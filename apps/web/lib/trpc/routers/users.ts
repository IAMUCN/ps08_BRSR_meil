import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { accountCreatedEmailHtml, sendEmail } from "@/lib/email/brevo";
import { loadLevels } from "@/lib/org/levels";
import {
  isFrozen,
  levelLabel,
  reachableNodeIds,
  treeOrder,
  unitByRef,
  type OrgNode,
} from "@/lib/org/rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { permissionProcedure, router } from "@/lib/trpc/init";
import type { ActiveSession } from "@/lib/auth/session";
import { checkAdminRemoval, checkRoleAtNode, generateDefaultPassword } from "@/lib/users/rules";

const userManage = permissionProcedure("user.manage");
// Handing out or taking away a role is Admin-only, whoever else holds user.manage: otherwise a person who
// was given that permission could assign themselves (or anyone) the Admin role.
const roleGrant = userManage.use(({ ctx, next }) => {
  if (!ctx.session.isAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an Admin can assign or remove roles.",
    });
  }
  return next();
});
const userBulkImport = permissionProcedure("user.bulk_import");

// Supabase Auth ban used for deactivation (~100 years); "none" lifts it.
const BAN_DURATION = "876000h";

export type UserStatus = "invited" | "active" | "deactivated";

export type UserRow = {
  id: string;
  displayName: string;
  email: string;
  employeeId: string | null;
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
      {
        id: string;
        display_name: string;
        email: string;
        employee_id: string | null;
        is_active: boolean;
      }[]
    >`
      select id, display_name, email, employee_id, is_active from public.users
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
      employeeId: u.employee_id,
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

  invite: roleGrant
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

  addAssignment: roleGrant
    .input(z.object({ userId: z.uuid(), roleId: z.uuid(), orgUnitId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db().begin(async (tx) => {
          if (input.userId === ctx.session.userId) {
            badRequest("You can't change your own roles. Ask another Admin.");
          }
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

  revokeAssignment: roleGrant
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
        if (assignment.user_id === ctx.session.userId) {
          badRequest("You can't change your own roles. Ask another Admin.");
        }
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

  delete: userManage.input(z.object({ userId: z.uuid() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.session.userId) badRequest("You can't delete your own account.");
    const sql = db();
    const [user] = await sql<{ display_name: string; email: string }[]>`
      select display_name, email from public.users where id = ${input.userId} and deleted_at is null`;
    if (!user) badRequest("User not found.");

    try {
      await sql.begin(async (tx) => {
        await assertAdminRemovalAllowed(tx, ctx.session.userId, input.userId);
        await tx`delete from public.user_org_assignments where user_id = ${input.userId}`;
        await tx`delete from public.users where id = ${input.userId}`;
        await writeAudit(tx, {
          eventType: "user.deleted",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
          oldValue: { email: user.email, display_name: user.display_name },
        });
      });
    } catch (error) {
      // Foreign keys are the source of truth for "has this user left any data behind"
      // (submissions, approvals, granted assignments, audit history, …) — no need to enumerate
      // every referencing table by hand.
      if (pgErrorCode(error) === "23503")
        badRequest(
          "This user has data on record (submissions, approvals or similar) — deactivate them instead.",
        );
      throw error;
    }

    // The DB rows are gone either way; a failure here just leaves an orphaned, invisible Auth
    // account for this email — re-inviting it will surface if that ever needs manual cleanup.
    await createSupabaseAdminClient().auth.admin.deleteUser(input.userId);
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

  bulkImportOptions: userBulkImport.query(async ({ ctx }) => {
    const nodeRows = await db()<
      {
        id: string;
        parent_id: string | null;
        unit_type: string;
        status: string;
        name: string;
        code: string | null;
      }[]
    >`
      select id, parent_id, unit_type, status, name, code from public.org_units
      where deleted_at is null`;
    const nodes: OrgNode[] = nodeRows.map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      unitType: r.unit_type as OrgNode["unitType"],
      status: r.status as OrgNode["status"],
    }));
    const reachable = new Set(
      ctx.session.isAdmin
        ? nodes.filter((n) => !isFrozen(n.id, nodes)).map((n) => n.id)
        : reachableNodeIds(
            nodes,
            ctx.session.assignments.map((a) => a.orgUnitId),
          ),
    );
    const roles = await db()<{ code: string; name: string }[]>`
      select code, name from public.roles where code <> 'admin' order by name`;
    // In tree order with level and parent, so the template's reference sheet reads as the hierarchy does.
    const levels = await loadLevels(db());
    const codeOf = new Map(nodeRows.map((n) => [n.id, n.code]));
    const inScope = treeOrder(
      nodeRows
        .filter((n) => reachable.has(n.id))
        .map((n) => ({
          id: n.id,
          parentId: n.parent_id,
          name: n.name,
          code: n.code,
          unitType: n.unit_type,
        })),
    );
    return {
      roles,
      // Every org unit in scope can be chosen. One with a code is named by it; one without is named by
      // its name, which bulkImport resolves (on a new installation most units have no code).
      orgUnits: inScope.map((n) => ({
        code: n.code ?? n.name,
        name: n.name,
        unitType: n.unitType,
        level: levelLabel(levels, n.unitType),
        parentCode: n.parentId
          ? (codeOf.get(n.parentId) ?? nodeRows.find((p) => p.id === n.parentId)?.name ?? null)
          : null,
        depth: n.depth,
      })),
      /** Kept for the template's signature; every unit can be named now. */
      withoutCode: [] as string[],
    };
  }),

  bulkImport: userBulkImport
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              employeeId: z.string().trim().min(1, "Employee ID is required.").max(50),
              displayName: z.string().trim().min(1, "Name is required.").max(200),
              email: z
                .email("Enter a valid email address.")
                .transform((e) => e.trim().toLowerCase()),
              roleCode: z.string().trim().min(1, "Role is required."),
              orgUnitCode: z.string().trim().min(1, "Organization Scope is required."),
            }),
          )
          .min(1, "The sheet has no rows.")
          .max(500, "Import at most 500 rows at a time."),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ results: BulkImportRowResult[] }> => {
      const results: BulkImportRowResult[] = [];
      for (const [index, row] of input.rows.entries()) {
        // Sheet row 1 is the header, so the first data row is row 2.
        results.push(await importOneEmployee(ctx.session, row, index + 2));
      }
      return { results };
    }),
});

type BulkImportRow = {
  employeeId: string;
  displayName: string;
  email: string;
  roleCode: string;
  orgUnitCode: string;
};

export type BulkImportRowResult =
  | {
      row: number;
      ok: true;
      employeeId: string;
      email: string;
      password: string;
      emailSent: boolean;
      emailError?: string;
    }
  | { row: number; ok: false; employeeId: string; email: string; error: string };

function rowFailed(row: number, r: BulkImportRow, error: string): BulkImportRowResult {
  return { row, ok: false, employeeId: r.employeeId, email: r.email, error };
}

/**
 * One row of a bulk-import sheet, isolated so one bad row can't take down the rest of the batch. The
 * account is created directly with a generated default password (no invite link), then a credentials
 * email is attempted — if Brevo isn't configured yet, or the send fails, the row still counts as created
 * and the password comes back in the result so it can be shared by hand instead (bulk-import-decisions.md).
 */
async function importOneEmployee(
  session: ActiveSession,
  row: BulkImportRow,
  rowNum: number,
): Promise<BulkImportRowResult> {
  const sql = db();

  const [existingEmail] = await sql`select 1 from public.users where lower(email) = ${row.email}`;
  if (existingEmail) return rowFailed(rowNum, row, "A user with that email already exists.");

  const [existingEmployeeId] = await sql`
    select 1 from public.users where employee_id = ${row.employeeId}`;
  if (existingEmployeeId)
    return rowFailed(rowNum, row, `Employee ID "${row.employeeId}" is already used.`);

  const [role] = await sql<{ id: string; code: string }[]>`
    select id, code from public.roles where lower(code) = ${row.roleCode.toLowerCase()}`;
  if (!role) return rowFailed(rowNum, row, `Unknown role "${row.roleCode}".`);
  if (role.code === "admin")
    return rowFailed(rowNum, row, "The Admin role can't be assigned by bulk import.");

  const nodeRows = await sql<
    {
      id: string;
      parent_id: string | null;
      unit_type: string;
      status: string;
      code: string | null;
      name: string;
    }[]
  >`select id, parent_id, unit_type, status, code, name from public.org_units where deleted_at is null`;
  const nodes: OrgNode[] = nodeRows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    unitType: r.unit_type as OrgNode["unitType"],
    status: r.status as OrgNode["status"],
  }));
  // By code, or by name for an org unit that has no code ("id:…" is what an earlier template wrote).
  const scopeId = /^id:([0-9a-f-]{36})$/i.exec(row.orgUnitCode)?.[1].toLowerCase();
  const orgUnit = scopeId
    ? nodeRows.find((r) => r.id === scopeId)
    : unitByRef(nodeRows, row.orgUnitCode);
  if (orgUnit === "ambiguous")
    return rowFailed(
      rowNum,
      row,
      `More than one org unit is called "${row.orgUnitCode}". Give them codes on the Organization page, then use the code.`,
    );
  if (!orgUnit)
    return rowFailed(rowNum, row, `Unknown organization scope code "${row.orgUnitCode}".`);
  const reachable = new Set(
    session.isAdmin
      ? nodes.filter((n) => !isFrozen(n.id, nodes)).map((n) => n.id)
      : reachableNodeIds(
          nodes,
          session.assignments.map((a) => a.orgUnitId),
        ),
  );
  if (!reachable.has(orgUnit.id))
    return rowFailed(rowNum, row, `"${row.orgUnitCode}" is outside your scope.`);

  const password = generateDefaultPassword(row.displayName, row.employeeId);
  const auth = createSupabaseAdminClient().auth.admin;
  const { data, error } = await auth.createUser({
    email: row.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: row.displayName },
  });
  if (error || !data.user) {
    return rowFailed(
      rowNum,
      row,
      error?.code === "email_exists"
        ? "That email already has a sign-in account."
        : "The account could not be created.",
    );
  }
  const userId = data.user.id;

  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into public.users (id, display_name, email, employee_id)
        values (${userId}, ${row.displayName}, ${row.email}, ${row.employeeId})`;
      await tx`
        insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
        values (${userId}, ${orgUnit.id}, ${role.id}, ${session.userId})`;
      await writeAudit(tx, {
        eventType: "user.bulk_imported",
        entityType: "user",
        entityId: userId,
        userId: session.userId,
        newValue: {
          email: row.email,
          display_name: row.displayName,
          employee_id: row.employeeId,
          role: role.code,
          org_unit_id: orgUnit.id,
        },
      });
    });
  } catch (err) {
    // Never leave an Auth account without its profile, assignment and audit rows.
    await auth.deleteUser(userId);
    if (pgErrorCode(err) === "23505")
      return rowFailed(rowNum, row, "That email or employee ID was just taken by another row.");
    throw err;
  }

  const emailResult = await sendEmail({
    to: { email: row.email, name: row.displayName },
    subject: "Your TraceESG account",
    html: accountCreatedEmailHtml({ displayName: row.displayName, email: row.email, password }),
  });

  return {
    row: rowNum,
    ok: true,
    employeeId: row.employeeId,
    email: row.email,
    password,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.reason,
  };
}
