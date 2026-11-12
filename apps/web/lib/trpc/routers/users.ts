import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode, type Tx } from "@/lib/db";
import { mustChangePassword, ownPasswordMetadata } from "@/lib/auth/initial-password";
import { invitationState } from "@/lib/auth/invitation-token";
import { issueInvitation, revokeInvitations, sendInvitationEmail } from "@/lib/auth/invitations";
import { bucket, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { loadLevels } from "@/lib/org/levels";
import { loadOrgNodes } from "@/lib/org/nodes";
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
import {
  administeredIds,
  checkAccountReach,
  checkAdminRemoval,
  checkGrant,
  checkRoleAtNode,
  generateInitialPassword,
} from "@/lib/users/rules";

const userManage = permissionProcedure("user.manage");
// Holding user.manage is not enough to hand out or take away a role, or to act on an account: each of those
// is checked against who the caller is and where (lib/users/rules.ts — checkGrant, checkAccountReach).
// A Super Admin: anything. An Administrator: inside what they administer, and never their own level's
// Administrator role or the Super Admin role. Anyone else who was given the permission: nothing.
const userBulkImport = permissionProcedure("user.bulk_import");

// Supabase Auth ban used for deactivation (~100 years); "none" lifts it.
const BAN_DURATION = "876000h";

export type UserStatus = "invited" | "active" | "deactivated";

/**
 * Where an account that has not been activated stands: its link is still good ("pending"), ran out
 * ("expired") or was cancelled ("revoked"); "none" is an account from before invitation links, still
 * holding an emailed temporary password.
 */
export type InvitationInfo = {
  state: "pending" | "expired" | "revoked" | "none";
  expiresAt: string | null;
};

export type UserRow = {
  id: string;
  displayName: string;
  email: string;
  employeeId: string | null;
  status: UserStatus;
  /** Set while the status is "invited". */
  invitation: InvitationInfo | null;
  /** Whether the caller may deactivate, reactivate, delete or re-invite this account. */
  manageable: boolean;
  assignments: {
    id: string;
    /** Whether the caller may take this role away. */
    removable: boolean;
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

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

/** The database's own refusal of one Super Admin too many (migration 0050), in its words. */
function superAdminLimit(error: unknown): string | null {
  const message = error instanceof Error ? error.message : "";
  return pgErrorCode(error) === "23514" && message.includes("Super Admin") ? message : null;
}

const TOO_MANY_INVITATIONS =
  "Too many invitations were sent in the last hour. Wait a while and try again.";

/** Refuses once this person has issued more links than the limit allows; otherwise counts this one. */
async function countInvitation(actorUserId: string): Promise<boolean> {
  const limits = await rateLimits();
  const name = bucket("invitation-issuer", actorUserId);
  if (await exceeded(name, limits.invitations_per_user, limits.invitation_window_minutes)) {
    return false;
  }
  await count(name);
  return true;
}

/** Validates a role + org node pairing for a new assignment by this caller (inside the transaction). */
async function assertAssignable(tx: Tx, session: ActiveSession, roleId: string, orgUnitId: string) {
  const [role] = await tx<{ code: string; name: string }[]>`
    select code, name from public.roles where id = ${roleId}`;
  if (!role) badRequest("Role not found.");
  const nodes: OrgNode[] = await loadOrgNodes(tx);
  const node = nodes.find((n) => n.id === orgUnitId);
  if (!node) badRequest("Organization node not found.");
  const grant = checkGrant(session, role.code, orgUnitId, nodes);
  if (!grant.ok) forbidden(grant.reason);
  if (isFrozen(node.id, nodes)) {
    badRequest("That node is inactive (or under an inactive node) — no new assignments.");
  }
  const roleCheck = checkRoleAtNode(role.code, node.unitType);
  if (!roleCheck.ok) badRequest(roleCheck.reason);
  return role;
}

/** Refuses an account the caller may not act on as a whole (lib/users/rules.ts: checkAccountReach). */
async function assertAccountReach(
  sql: Tx | ReturnType<typeof db>,
  session: ActiveSession,
  userId: string,
) {
  if (session.isAdmin) return;
  const held = await sql<{ roleCode: string; orgUnitId: string }[]>`
    select r.code as "roleCode", uoa.org_unit_id as "orgUnitId"
    from public.user_org_assignments uoa join public.roles r on r.id = uoa.role_id
    where uoa.user_id = ${userId} and uoa.revoked_at is null`;
  const check = checkAccountReach(session, held, await loadOrgNodes(sql));
  if (!check.ok) forbidden(check.reason);
}

/**
 * An active account whose owner has neither used an invitation link nor ever signed in. Anything else is
 * refused: a link must never become a way to set the password of an account that is already in use.
 */
async function pendingAccount(sql: ReturnType<typeof db>, userId: string) {
  const [profile] = await sql<{ display_name: string; email: string; activated: boolean }[]>`
    select u.display_name, u.email,
           exists (select 1 from public.user_invitations i
                   where i.user_id = u.id and i.consumed_at is not null) as activated
    from public.users u
    where u.id = ${userId} and u.deleted_at is null and u.is_active`;
  if (!profile) badRequest("User not found.");
  const { data, error } = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user) badRequest("User not found.");
  if (profile.activated || data.user.last_sign_in_at) {
    badRequest("This person has already set up their account.");
  }
  return {
    email: profile.email,
    displayName: profile.display_name,
    holdsTemporaryPassword: mustChangePassword(data.user),
  };
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

/**
 * What a user has done that the records must keep attributing to them, in words for the Admin
 * ("2 submissions, 1 approval"). Empty when the account has left nothing but its own traces
 * (notifications, reset codes, chat history, audit entries).
 */
async function userWorkOnRecord(tx: Tx, userId: string): Promise<string[]> {
  const [c] = await tx<Record<string, number>[]>`
    select
      (select count(*) from public.esg_records where submitted_by = ${userId})::int as submissions,
      (select count(*) from public.documents where uploaded_by = ${userId})::int as documents,
      (select count(*) from public.esg_record_documents where added_by = ${userId})::int as evidence,
      ((select count(*) from public.verifications where verified_by = ${userId})
        + (select count(*) from public.esg_records where verified_by = ${userId})
        + (select count(*) from public.ocr_fields where verified_by = ${userId}))::int as verifications,
      (select count(*) from public.approvals where decided_by = ${userId})::int as approvals,
      (select count(*) from public.report_runs where requested_by = ${userId})::int as reports,
      (select count(*) from public.user_org_assignments where assigned_by = ${userId}
         and user_id <> ${userId})::int as assignments,
      ((select count(*) from public.conversion_factor_versions where created_by = ${userId})
        + (select count(*) from public.org_settings where updated_by = ${userId})
        + (select count(*) from public.submission_expectations where created_by = ${userId})
        + (select count(*) from public.brsr_disclosures where updated_by = ${userId})
        + (select count(*) from public.org_unit_parents where created_by = ${userId})
        + (select count(*) from public.carbon_credit_transactions where executed_by = ${userId})
        + (select count(*) from public.capex_carbon_evaluations where created_by = ${userId}))::int
        as settings`;
  const labels: [string, string, string][] = [
    ["submissions", "submission", "submissions"],
    ["documents", "uploaded document", "uploaded documents"],
    ["evidence", "supporting file", "supporting files"],
    ["verifications", "verification", "verifications"],
    ["approvals", "approval decision", "approval decisions"],
    ["reports", "report", "reports"],
    ["assignments", "role given to someone else", "roles given to other people"],
    ["settings", "configuration change", "configuration changes"],
  ];
  return labels.flatMap(([key, one, many]) => {
    const n = c?.[key] ?? 0;
    return n > 0 ? [`${n} ${n === 1 ? one : many}`] : [];
  });
}

export const usersRouter = router({
  /** The roles this caller may hand out: every role for a Super Admin, all but that one for an Administrator. */
  options: userManage.query(async ({ ctx }) => {
    if (!ctx.session.isAdmin && !ctx.session.isOrgAdmin) return { roles: [] };
    const roles = await db()<{ id: string; code: string; name: string }[]>`
      select id, code, name from public.roles
      order by case code when 'admin' then 0 when 'org_admin' then 1 else 2 end, name`;
    return { roles: roles.filter((r) => ctx.session.isAdmin || r.code !== "admin") };
  }),

  list: userManage.query(async ({ ctx }): Promise<UserRow[]> => {
    const sql = db();
    const nodes: OrgNode[] = await loadOrgNodes(sql);
    // An Administrator sees the people who hold a role inside what they administer; a Super Admin, everyone.
    const scope = administeredIds(ctx.session, nodes);
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
      order by case r.code when 'admin' then 0 when 'org_admin' then 1 else 2 end, r.name, ou.name`;

    // "Invited" = the person has neither chosen a password through their link nor ever signed in.
    const { data, error } = await createSupabaseAdminClient().auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw error;
    const signedIn = new Set(data.users.filter((u) => u.last_sign_in_at).map((u) => u.id));
    // Each account's latest link, and whether any link of theirs was ever used.
    const invitations = await sql<
      {
        user_id: string;
        expires_at: Date;
        consumed_at: Date | null;
        revoked_at: Date | null;
        activated: boolean;
      }[]
    >`
      select distinct on (user_id) user_id, expires_at, consumed_at, revoked_at,
             bool_or(consumed_at is not null) over (partition by user_id) as activated
      from public.user_invitations
      order by user_id, created_at desc`;
    const invitationOf = new Map(invitations.map((i) => [i.user_id, i]));

    return users.flatMap((u): UserRow[] => {
      const held = assignments.filter((a) => a.user_id === u.id);
      if (scope && !held.some((a) => scope.has(a.org_unit_id))) return [];
      const own = u.id === ctx.session.userId;
      const latest = invitationOf.get(u.id);
      const status: UserStatus = !u.is_active
        ? "deactivated"
        : signedIn.has(u.id) || latest?.activated
          ? "active"
          : "invited";
      const state = latest
        ? invitationState({
            consumedAt: latest.consumed_at,
            revokedAt: latest.revoked_at,
            expiresAt: latest.expires_at,
          })
        : null;
      return [
        {
          id: u.id,
          displayName: u.display_name,
          email: u.email,
          employeeId: u.employee_id,
          status,
          invitation:
            status !== "invited"
              ? null
              : latest && state && state !== "used"
                ? { state, expiresAt: latest.expires_at.toISOString() }
                : { state: "none", expiresAt: null },
          manageable:
            !own &&
            checkAccountReach(
              ctx.session,
              held.map((a) => ({ roleCode: a.role_code, orgUnitId: a.org_unit_id })),
              nodes,
            ).ok,
          assignments: held.map((a) => ({
            id: a.id,
            removable: !own && checkGrant(ctx.session, a.role_code, a.org_unit_id, nodes).ok,
            roleId: a.role_id,
            roleCode: a.role_code,
            roleName: a.role_name,
            orgUnitId: a.org_unit_id,
            orgUnitName: a.org_unit_name,
            orgUnitType: a.org_unit_type,
          })),
        },
      ];
    });
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

      // Validate before creating the account.
      await sql.begin((tx) => assertAssignable(tx, ctx.session, input.roleId, input.orgUnitId));
      if (!(await countInvitation(ctx.session.userId))) badRequest(TOO_MANY_INVITATIONS);

      // No password is given here: Supabase Auth fills in a random one that it never returns, so nobody
      // can sign in to the account. The person chooses their own through the emailed link (migration
      // 0051); no password is ever sent or shown.
      const auth = createSupabaseAdminClient().auth.admin;
      const { data, error } = await auth.createUser({
        email: input.email,
        email_confirm: true,
        user_metadata: { display_name: input.displayName },
        app_metadata: ownPasswordMetadata,
      });
      if (error || !data.user) {
        badRequest(
          error?.code === "email_exists"
            ? "That email already has a sign-in account."
            : "The account could not be created. Try again.",
        );
      }
      const userId = data.user.id;

      let invitation;
      try {
        invitation = await sql.begin(async (tx) => {
          const role = await assertAssignable(tx, ctx.session, input.roleId, input.orgUnitId);
          await tx`
            insert into public.users (id, display_name, email)
            values (${userId}, ${input.displayName}, ${input.email})`;
          await tx`
            insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
            values (${userId}, ${input.orgUnitId}, ${input.roleId}, ${ctx.session.userId})`;
          const issued = await issueInvitation(tx, userId, ctx.session.userId);
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
              invitation_valid_hours: issued.validHours,
            },
          });
          return issued;
        });
      } catch (err) {
        // Never leave an Auth account without its profile, assignment and audit rows.
        await auth.deleteUser(userId);
        const limit = superAdminLimit(err);
        if (limit) badRequest(limit);
        throw err;
      }

      // The account and its link exist either way; if the email fails the administrator sends a new link.
      const emailResult = await sendInvitationEmail({
        email: input.email,
        displayName: input.displayName,
        invitation,
      });
      return {
        id: userId,
        emailSent: emailResult.sent,
        emailError: emailResult.sent ? undefined : emailResult.reason,
      };
    }),

  /**
   * Gives an employee ID to someone who has none. An ID once given stays: the check is in the update itself,
   * so two administrators acting at once cannot overwrite each other. Nobody sets their own.
   */
  setEmployeeId: userManage
    .input(
      z.object({
        userId: z.uuid(),
        employeeId: z.string().trim().min(1, "Employee ID is required.").max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session.userId) {
        forbidden("You can't change your own account. Another administrator can.");
      }
      const sql = db();
      await assertAccountReach(sql, ctx.session, input.userId);
      try {
        await sql.begin(async (tx) => {
          const updated = await tx`
            update public.users set employee_id = ${input.employeeId}
            where id = ${input.userId} and deleted_at is null and employee_id is null
            returning id`;
          if (updated.length === 0) badRequest("This person already has an employee ID.");
          await writeAudit(tx, {
            eventType: "user.employee_id_set",
            entityType: "user",
            entityId: input.userId,
            userId: ctx.session.userId,
            newValue: { employee_id: input.employeeId },
          });
        });
      } catch (err) {
        if (pgErrorCode(err) === "23505") {
          badRequest(`Employee ID "${input.employeeId}" is already used.`);
        }
        throw err;
      }
      return null;
    }),

  /**
   * Corrects the name or email of someone still invited (status Invited only: a person who set up their
   * account owns their own details). A changed email cancels the old link, which may have gone to the wrong
   * person, and sends a new one; the sign-in record changes with it, so no second account appears.
   */
  updateInvited: userManage
    .input(
      z.object({
        userId: z.uuid(),
        displayName: z.string().trim().min(1, "Name is required.").max(200),
        email: z.email("Enter a valid email address.").transform((e) => e.trim().toLowerCase()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      // Scope first, so nothing about an account outside it (whether it exists, whether it is set up) leaks.
      await assertAccountReach(sql, ctx.session, input.userId);
      const profile = await pendingAccount(sql, input.userId);

      const emailChanged = input.email !== profile.email.toLowerCase();
      if (!emailChanged && input.displayName === profile.displayName) {
        badRequest("Nothing has changed.");
      }
      if (emailChanged) {
        const [taken] = await sql`
          select 1 from public.users where lower(email) = ${input.email} and id <> ${input.userId}`;
        if (taken) badRequest("A user with that email already exists.");
        if (!(await countInvitation(ctx.session.userId))) badRequest(TOO_MANY_INVITATIONS);
      }

      const auth = createSupabaseAdminClient().auth.admin;
      const { error } = await auth.updateUserById(input.userId, {
        email: input.email,
        email_confirm: true,
        user_metadata: { display_name: input.displayName },
        // An emailed temporary password must not keep working for the old address.
        ...(emailChanged && profile.holdsTemporaryPassword
          ? { password: generateInitialPassword(), app_metadata: ownPasswordMetadata }
          : {}),
      });
      if (error) {
        badRequest(
          error.code === "email_exists"
            ? "That email already has a sign-in account."
            : "The details could not be saved. Try again.",
        );
      }

      let invitation;
      try {
        invitation = await sql.begin(async (tx) => {
          await tx`
            update public.users set display_name = ${input.displayName}, email = ${input.email}
            where id = ${input.userId}`;
          const issued = emailChanged
            ? await issueInvitation(tx, input.userId, ctx.session.userId)
            : null;
          await writeAudit(tx, {
            eventType: "user.invited_details_updated",
            entityType: "user",
            entityId: input.userId,
            userId: ctx.session.userId,
            oldValue: { email: profile.email, display_name: profile.displayName },
            newValue: { email: input.email, display_name: input.displayName },
          });
          return issued;
        });
      } catch (err) {
        // The sign-in record and the profile must not disagree about the address.
        await auth.updateUserById(input.userId, {
          email: profile.email,
          email_confirm: true,
          user_metadata: { display_name: profile.displayName },
        });
        throw err;
      }

      if (!invitation) return { emailChanged: false, emailSent: false };
      const sent = await sendInvitationEmail({
        email: input.email,
        displayName: input.displayName,
        invitation,
      });
      return {
        emailChanged: true,
        emailSent: sent.sent,
        emailError: sent.sent ? undefined : sent.reason,
      };
    }),

  /** A new link for an account that has not been activated; every earlier link stops working. */
  resendInvite: userManage
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      // Scope first, so nothing about an account outside it (whether it exists, whether it is set up) leaks.
      await assertAccountReach(sql, ctx.session, input.userId);
      const profile = await pendingAccount(sql, input.userId);

      const limits = await rateLimits();
      const perAccount = bucket("invitation-account", input.userId);
      if (
        await exceeded(
          perAccount,
          limits.invitation_resends_per_account,
          limits.invitation_window_minutes,
        )
      ) {
        badRequest(TOO_MANY_INVITATIONS);
      }
      if (!(await countInvitation(ctx.session.userId))) badRequest(TOO_MANY_INVITATIONS);
      await count(perAccount);

      // An account from before invitation links still holds an emailed temporary password. It stops
      // working here: from now on the link is the only way in.
      if (profile.holdsTemporaryPassword) {
        const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(
          input.userId,
          { password: generateInitialPassword(), app_metadata: ownPasswordMetadata },
        );
        if (error) badRequest("The invitation could not be prepared. Try again.");
      }

      const invitation = await sql.begin(async (tx) => {
        const issued = await issueInvitation(tx, input.userId, ctx.session.userId);
        await writeAudit(tx, {
          eventType: "user.invite_resent",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
          newValue: { invitation_valid_hours: issued.validHours },
        });
        return issued;
      });
      const emailResult = await sendInvitationEmail({
        email: profile.email,
        displayName: profile.displayName,
        invitation,
      });
      if (!emailResult.sent) badRequest(`The email could not be sent: ${emailResult.reason}`);
      return null;
    }),

  /** Cancels the open link of an account that has not been activated. The account itself stays. */
  revokeInvite: userManage
    .input(z.object({ userId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      await assertAccountReach(sql, ctx.session, input.userId);
      await pendingAccount(sql, input.userId);
      await sql.begin(async (tx) => {
        const revoked = await revokeInvitations(tx, input.userId);
        if (revoked === 0) badRequest("This account has no open invitation link.");
        await writeAudit(tx, {
          eventType: "user.invite_revoked",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
        });
      });
      return null;
    }),

  addAssignment: userManage
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
          // An Administrator adds roles to the people they can already see: someone with a role inside
          // what they administer. Anyone else reads as not found (§4.4).
          const scope = administeredIds(ctx.session, await loadOrgNodes(tx));
          if (scope) {
            const held = await tx<{ org_unit_id: string }[]>`
              select org_unit_id from public.user_org_assignments
              where user_id = ${input.userId} and revoked_at is null`;
            if (!held.some((a) => scope.has(a.org_unit_id))) badRequest("User not found.");
          }
          const role = await assertAssignable(tx, ctx.session, input.roleId, input.orgUnitId);
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
        const limit = superAdminLimit(error);
        if (limit) badRequest(limit);
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
        if (assignment.user_id === ctx.session.userId) {
          badRequest("You can't change your own roles. Ask another Admin.");
        }
        const grant = checkGrant(
          ctx.session,
          assignment.role_code,
          assignment.org_unit_id,
          await loadOrgNodes(tx),
        );
        if (!grant.ok) forbidden(grant.reason);
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
    await assertAccountReach(sql, ctx.session, input.userId);
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
        // A deactivated person must not be able to finish setting the account up.
        await revokeInvitations(tx, input.userId);
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
    await assertAccountReach(sql, ctx.session, input.userId);

    let kept = false;
    try {
      await sql.begin(async (tx) => {
        await assertAdminRemovalAllowed(tx, ctx.session.userId, input.userId);

        // Work that must keep its author: with any of it the account can only be deactivated.
        const work = await userWorkOnRecord(tx, input.userId);
        if (work.length > 0)
          badRequest(
            `This user can't be deleted because the records name them: ${work.join(", ")}. Deactivate them instead.`,
          );

        // The person's own traces are not data on record and go with the account.
        await tx`delete from public.notifications where user_id = ${input.userId}`;
        await tx`delete from public.password_reset_otps where user_id = ${input.userId}`;
        await tx`delete from public.chat_conversations where user_id = ${input.userId}`;
        await tx`delete from public.user_org_assignments where user_id = ${input.userId}`;

        // The audit log is append-only and may name them (a theme or password change is enough), so the
        // row cannot always go. Then it stays as a closed, hidden entry and the address is freed.
        const [named] = await tx`
          select 1 from public.audit_logs where user_id = ${input.userId} limit 1`;
        kept = Boolean(named);
        if (kept) {
          await revokeInvitations(tx, input.userId);
          await tx`
            update public.users
            set deleted_at = now(), is_active = false, email = ${`deleted-${input.userId}@deleted.invalid`}
            where id = ${input.userId}`;
        } else {
          await tx`delete from public.users where id = ${input.userId}`;
        }
        await writeAudit(tx, {
          eventType: "user.deleted",
          entityType: "user",
          entityId: input.userId,
          userId: ctx.session.userId,
          oldValue: { email: user.email, display_name: user.display_name },
          newValue: { kept_for_audit_log: kept },
        });
      });
    } catch (error) {
      // A table this check does not know about still refers to them.
      if (pgErrorCode(error) === "23503")
        badRequest(
          "This user can't be deleted because other data refers to them — deactivate them instead.",
        );
      throw error;
    }

    // The DB rows are gone either way; a failure here just leaves an orphaned, invisible Auth
    // account for this email — re-inviting it will surface if that ever needs manual cleanup.
    // A kept profile row still points at the sign-in account, so that one is closed, not removed:
    // Supabase Auth blanks its email and password and it can never sign in again.
    await createSupabaseAdminClient().auth.admin.deleteUser(input.userId, kept);
    return null;
  }),

  reactivate: userManage.input(z.object({ userId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const sql = db();
    const [user] = await sql<{ is_active: boolean }[]>`
      select is_active from public.users where id = ${input.userId} and deleted_at is null`;
    if (!user) badRequest("User not found.");
    if (user.is_active) badRequest("The user is already active.");
    await assertAccountReach(sql, ctx.session, input.userId);

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
      const limit = superAdminLimit(error);
      if (limit) badRequest(limit);
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
    // The two administrator roles are never handed out from a sheet.
    const roles = await db()<{ code: string; name: string }[]>`
      select code, name from public.roles where code not in ('admin', 'org_admin') order by name`;
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
        if (!(await countInvitation(ctx.session.userId))) {
          results.push(rowFailed(index + 2, row, TOO_MANY_INVITATIONS));
          continue;
        }
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
      emailSent: boolean;
      emailError?: string;
    }
  | { row: number; ok: false; employeeId: string; email: string; error: string };

function rowFailed(row: number, r: BulkImportRow, error: string): BulkImportRowResult {
  return { row, ok: false, employeeId: r.employeeId, email: r.email, error };
}

/**
 * One row of a bulk-import sheet, isolated so one bad row can't take down the rest of the batch. The
 * account is created without a password anyone knows and the person is emailed an invitation link,
 * exactly as Invite user does. If the email cannot be sent the row still counts as created: the results say so, and a new
 * link is sent from the Users page (Resend invitation). No password is created, shown or emailed.
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
  if (role.code === "admin" || role.code === "org_admin")
    return rowFailed(
      rowNum,
      row,
      "An administrator role can't be assigned by bulk import. Assign it on the Users page.",
    );

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

  const auth = createSupabaseAdminClient().auth.admin;
  const { data, error } = await auth.createUser({
    email: row.email,
    email_confirm: true,
    user_metadata: { display_name: row.displayName },
    app_metadata: ownPasswordMetadata,
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

  let invitation;
  try {
    invitation = await sql.begin(async (tx) => {
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
      return issueInvitation(tx, userId, session.userId);
    });
  } catch (err) {
    // Never leave an Auth account without its profile, assignment and audit rows.
    await auth.deleteUser(userId);
    if (pgErrorCode(err) === "23505")
      return rowFailed(rowNum, row, "That email or employee ID was just taken by another row.");
    throw err;
  }

  const emailResult = await sendInvitationEmail({
    email: row.email,
    displayName: row.displayName,
    invitation,
  });

  return {
    row: rowNum,
    ok: true,
    employeeId: row.employeeId,
    email: row.email,
    emailSent: emailResult.sent,
    emailError: emailResult.sent ? undefined : emailResult.reason,
  };
}
