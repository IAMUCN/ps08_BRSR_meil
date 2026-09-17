import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { isFrozen, type OrgNode } from "@/lib/org/rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { permissionProcedure, router } from "@/lib/trpc/init";
import { checkAdminRemoval, checkRoleAtNode } from "@/lib/users/rules";

const userManage = permissionProcedure("user.manage");

// Supabase Auth ban used for deactivation (~100 years); "none" lifts it.
const BAN_DURATION = "876000h";

export type UserStatus = "invited" | "active" | "deactivated";

export type UserRow = {
  id: string;
  displayName: string;
  email: string;
  status: UserStatus;
  assignments: {
    id: string;
    roleId: string;
    roleCode: string;
    roleName: string;
    orgUnitId: string;
    orgUnitName: string;
    orgUnitType: string;
  }[];
};

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

async function loadNodes(tx: Tx): Promise<OrgNode[]> {
  const rows = await tx<
    { id: string; parent_id: string | null; unit_type: string; status: string }[]
  >`
    select id, parent_id, unit_type, status from public.org_units where deleted_at is null`;
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    unitType: r.unit_type as OrgNode["unitType"],
    status: r.status as OrgNode["status"],
  }));
}

/** Validates a role + org node pairing for a new assignment (inside the transaction). */
async function assertAssignable(tx: Tx, roleId: string, orgUnitId: string) {
  const [role] = await tx<{ code: string; name: string }[]>`
    select code, name from public.roles where id = ${roleId}`;
  if (!role) badRequest("Role not found.");
  const nodes = await loadNodes(tx);
  const node = nodes.find((n) => n.id === orgUnitId);
  if (!node) badRequest("Organization node not found.");
  if (isFrozen(node.id, nodes)) {
    badRequest("That node is inactive (or under an inactive node) — no new assignments.");
  }
  const roleCheck = checkRoleAtNode(role.code, node.unitType);
  if (!roleCheck.ok) badRequest(roleCheck.reason);
  return role;
}

/** Lockout guards; takes a transaction-scoped lock so concurrent admin removals serialise. */
async function assertAdminRemovalAllowed(tx: Tx, actorUserId: string, targetUserId: string) {
  await tx`select pg_advisory_xact_lock(hashtext('admin_lockout_guard'))`;
  const [{ target_is_admin, others }] = await tx<{ target_is_admin: boolean; others: number }[]>`
    select
      exists (
        select 1 from public.user_org_assignments uoa
        join public.roles r on r.id = uoa.role_id and r.code = 'admin'
        join public.users u on u.id = uoa.user_id
        where uoa.user_id = ${targetUserId} and uoa.revoked_at is null and u.is_active
      ) as target_is_admin,
      (
        select count(distinct uoa.user_id)::int from public.user_org_assignments uoa
        join public.roles r on r.id = uoa.role_id and r.code = 'admin'
        join public.users u on u.id = uoa.user_id
        where uoa.user_id <> ${targetUserId} and uoa.revoked_at is null
          and u.is_active and u.deleted_at is null
      ) as others`;
  const check = checkAdminRemoval({
    actorUserId,
    targetUserId,
    targetIsActiveAdmin: target_is_admin,
    otherActiveAdminCount: others,
  });
  if (!check.ok) badRequest(check.reason);
}

export const usersRouter = router({
  list: userManage.query(async (): Promise<UserRow[]> => {
    const sql = db();
    const users = await sql<
      { id: string; display_name: string; email: string; is_active: boolean }[]
    >`
      select id, display_name, email, is_active from public.users
      where deleted_at is null order by display_name`;
    const assignments = await sql<
      {
        id: string;
        user_id: string;
        role_id: string;
        role_code: string;
        role_name: string;
        org_unit_id: string;
        org_unit_name: string;
        org_unit_type: string;
      }[]
    >`
      select uoa.id, uoa.user_id, r.id as role_id, r.code as role_code, r.name as role_name,
             ou.id as org_unit_id, ou.name as org_unit_name, ou.unit_type as org_unit_type
      from public.user_org_assignments uoa
      join public.roles r on r.id = uoa.role_id
      join public.org_units ou on ou.id = uoa.org_unit_id
      where uoa.revoked_at is null
      order by r.name, ou.name`;

    // "Invited" = Auth user who has not accepted the invite yet (no confirmed email).
    const { data, error } = await createSupabaseAdminClient().auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;
    const confirmed = new Set(data.users.filter((u) => u.email_confirmed_at).map((u) => u.id));

    return users.map((u) => ({
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      status: !u.is_active ? "deactivated" : confirmed.has(u.id) ? "active" : "invited",
      assignments: assignments
        .filter((a) => a.user_id === u.id)
        .map((a) => ({
          id: a.id,
          roleId: a.role_id,
          roleCode: a.role_code,
          roleName: a.role_name,
          orgUnitId: a.org_unit_id,
          orgUnitName: a.org_unit_name,
          orgUnitType: a.org_unit_type,
        })),
    }));
  }),

  invite: userManage
    .input(
      z.object({
        email: z.email("Enter a valid email address.").transform((e) => e.trim().toLowerCase()),
        displayName: z.string().trim().min(1, "Name is required.").max(200),
        roleId: z.uuid(),
        orgUnitId: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const [existing] = await sql`select 1 from public.users where lower(email) = ${input.email}`;
      if (existing) badRequest("A user with that email already exists.");

      // Validate before sending any email.
      await sql.begin((tx) => assertAssignable(tx, input.roleId, input.orgUnitId));

      const auth = createSupabaseAdminClient().auth.admin;
      const { data, error } = await auth.inviteUserByEmail(input.email, {
        data: { display_name: input.displayName },
      });
      if (error || !data.user) {
        badRequest(
          error?.code === "email_exists"
            ? "That email already has a sign-in account."
            : "The invite email could not be sent. Try again.",
        );
      }
      const userId = data.user.id;

      try {
        await sql.begin(async (tx) => {
          const role = await assertAssignable(tx, input.roleId, input.orgUnitId);
          await tx`
            insert into public.users (id, display_name, email)
            values (${userId}, ${input.displayName}, ${input.email})`;
          await tx`
            insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
            values (${userId}, ${input.orgUnitId}, ${input.roleId}, ${ctx.session.userId})`;
          await writeAudit(tx, {
            eventType: "user.invited",
            entityType: "user",
            entityId: userId,
            userId: ctx.session.userId,
            newValue: {
              email: input.email,
              display_name: input.displayName,
              role: role.code,
              org_unit_id: input.orgUnitId,
            },
          });
        });
      } catch (err) {
        // Never leave an Auth account without its profile, assignment and audit rows.
        await auth.deleteUser(userId);
        throw err;
      }
      return { id: userId };
    }),

  resendInvite: userManage
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const auth = createSupabaseAdminClient().auth.admin;
      const { data, error } = await auth.getUserById(input.userId);
      if (error || !data.user?.email) badRequest("User not found.");
      if (data.user.email_confirmed_at) badRequest("This user has already accepted their invite.");
      const { error: inviteError } = await auth.inviteUserByEmail(data.user.email);
      if (inviteError) badRequest("The invite email could not be sent. Try again.");
      await db().begin((tx) =>
        writeAudit(tx, {
          eventType: "user.invite_resent",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
        }),
      );
      return null;
    }),

  addAssignment: userManage
    .input(z.object({ userId: z.uuid(), roleId: z.uuid(), orgUnitId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db().begin(async (tx) => {
          const [user] =
            await tx`select 1 from public.users where id = ${input.userId} and deleted_at is null`;
          if (!user) badRequest("User not found.");
          const role = await assertAssignable(tx, input.roleId, input.orgUnitId);
          const [created] = await tx<{ id: string }[]>`
            insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
            values (${input.userId}, ${input.orgUnitId}, ${input.roleId}, ${ctx.session.userId})
            returning id`;
          await writeAudit(tx, {
            eventType: "user_assignment.added",
            entityType: "user_org_assignment",
            entityId: created.id,
            userId: ctx.session.userId,
            newValue: { user_id: input.userId, role: role.code, org_unit_id: input.orgUnitId },
          });
        });
        return null;
      } catch (error) {
        if (pgErrorCode(error) === "23505")
          badRequest("The user already has that role at that node.");
        throw error;
      }
    }),

  revokeAssignment: userManage
    .input(z.object({ assignmentId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [assignment] = await tx<
          { user_id: string; role_code: string; org_unit_id: string }[]
        >`
          select uoa.user_id, r.code as role_code, uoa.org_unit_id
          from public.user_org_assignments uoa join public.roles r on r.id = uoa.role_id
          where uoa.id = ${input.assignmentId} and uoa.revoked_at is null
          for update of uoa`;
        if (!assignment) badRequest("Assignment not found or already revoked.");
        if (assignment.role_code === "admin") {
          await assertAdminRemovalAllowed(tx, ctx.session.userId, assignment.user_id);
        }
        await tx`update public.user_org_assignments set revoked_at = now() where id = ${input.assignmentId}`;
        await writeAudit(tx, {
          eventType: "user_assignment.revoked",
          entityType: "user_org_assignment",
          entityId: input.assignmentId,
          userId: ctx.session.userId,
          oldValue: {
            user_id: assignment.user_id,
            role: assignment.role_code,
            org_unit_id: assignment.org_unit_id,
          },
        });
      });
      return null;
    }),

  deactivate: userManage.input(z.object({ userId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sql = db();
    const [user] = await sql<{ is_active: boolean }[]>`
      select is_active from public.users where id = ${input.userId} and deleted_at is null`;
    if (!user) badRequest("User not found.");
    if (!user.is_active) badRequest("The user is already deactivated.");
    // Fail fast before touching Auth; re-checked under lock inside the transaction.
    await sql.begin((tx) => assertAdminRemovalAllowed(tx, ctx.session.userId, input.userId));

    const auth = createSupabaseAdminClient().auth.admin;
    const { error: banError } = await auth.updateUserById(input.userId, {
      ban_duration: BAN_DURATION,
    });
    if (banError) badRequest("The account could not be deactivated. Try again.");

    try {
      await sql.begin(async (tx) => {
        await assertAdminRemovalAllowed(tx, ctx.session.userId, input.userId);
        await tx`update public.users set is_active = false where id = ${input.userId}`;
        await writeAudit(tx, {
          eventType: "user.deactivated",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
          oldValue: { is_active: true },
          newValue: { is_active: false, auth_banned: true },
        });
      });
    } catch (error) {
      await auth.updateUserById(input.userId, { ban_duration: "none" });
      throw error;
    }
    return null;
  }),

  reactivate: userManage.input(z.object({ userId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sql = db();
    const [user] = await sql<{ is_active: boolean }[]>`
      select is_active from public.users where id = ${input.userId} and deleted_at is null`;
    if (!user) badRequest("User not found.");
    if (user.is_active) badRequest("The user is already active.");

    const auth = createSupabaseAdminClient().auth.admin;
    const { error: unbanError } = await auth.updateUserById(input.userId, { ban_duration: "none" });
    if (unbanError) badRequest("The account could not be reactivated. Try again.");

    try {
      await sql.begin(async (tx) => {
        await tx`update public.users set is_active = true where id = ${input.userId}`;
        await writeAudit(tx, {
          eventType: "user.reactivated",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
          oldValue: { is_active: false },
          newValue: { is_active: true, auth_banned: false },
        });
      });
    } catch (error) {
      await auth.updateUserById(input.userId, { ban_duration: BAN_DURATION });
      throw error;
    }
    return null;
  }),
});
