// Provisions an account: Supabase Auth invite + public.users profile + role/org-scope assignment +
// audit entry. Accounts are Admin-provisioned only (.grill/phase-3-auth-decisions.md).
//
//   First Admin (refused while any active Admin exists):
//     pnpm --filter web provision-user --email admin@example.com --name "Jane Admin" --role admin --org-code MEIL
//   Any other role (attributed to an existing active Admin):
//     pnpm --filter web provision-user --email pm@example.com --name "Ravi PM" --role project_manager \
//       --org-code PRJ-X --assigned-by admin@example.com
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL (apps/web/.env.local by
// default). The invite email lets the user choose their own password — no password is ever passed here.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

function fail(message: string): never {
  console.error(`provision-user: ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string" },
    "org-code": { type: "string" },
    "assigned-by": { type: "string" },
  },
  strict: true,
});

const email = values.email?.trim().toLowerCase();
const displayName = values.name?.trim();
const roleCode = values.role?.trim();
const orgCode = values["org-code"]?.trim();
const assignedByEmail = values["assigned-by"]?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  fail("--email must be a valid email address");
if (!displayName) fail("--name is required");
if (!roleCode) fail("--role is required (a roles.code, e.g. admin, project_manager)");
if (!orgCode) fail("--org-code is required (an org_units.code, e.g. MEIL)");

const sql = postgres(requireEnv("DATABASE_URL"), { prepare: false, max: 1 });
const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const activeAdminExistsQuery = (db: postgres.Sql | postgres.TransactionSql) => db<
  { exists: boolean }[]
>`
  select exists (
    select 1
    from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id
    join public.users u on u.id = uoa.user_id
    where r.code = 'admin' and uoa.revoked_at is null and u.is_active and u.deleted_at is null
  ) as exists`;

try {
  const [role] = await sql<{ id: string; code: string; name: string }[]>`
    select id, code, name from public.roles where code = ${roleCode}`;
  if (!role) fail(`unknown role "${roleCode}"`);

  const [orgUnit] = await sql<{ id: string; name: string; unit_type: string }[]>`
    select id, name, unit_type from public.org_units
    where code = ${orgCode} and status = 'active' and deleted_at is null`;
  if (!orgUnit) fail(`no active org unit with code "${orgCode}"`);
  // The admin role is organization-wide (is_admin()), so it is only assignable at the root Group.
  if (role.code === "admin" && orgUnit.unit_type !== "group") {
    fail("the admin role can only be assigned at the root organization (the group node)");
  }

  const [existing] = await sql`select 1 from public.users where lower(email) = ${email}`;
  if (existing) fail(`a user with email ${email} already exists`);

  const isAdminRole = role.code === "admin";
  let assignedBy: string | null = null;

  if (isAdminRole) {
    const [{ exists }] = await activeAdminExistsQuery(sql);
    if (exists) {
      fail("an active Admin already exists — create further Admins from User Management instead");
    }
  } else {
    if (!assignedByEmail)
      fail("--assigned-by <active admin email> is required for non-admin roles");
    const [assigner] = await sql<{ id: string }[]>`
      select u.id
      from public.users u
      join public.user_org_assignments uoa on uoa.user_id = u.id and uoa.revoked_at is null
      join public.roles r on r.id = uoa.role_id and r.code = 'admin'
      where lower(u.email) = ${assignedByEmail} and u.is_active and u.deleted_at is null
      limit 1`;
    if (!assigner) fail(`--assigned-by ${assignedByEmail} is not an active Admin`);
    assignedBy = assigner.id;
  }

  const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
  });
  if (inviteError || !invite.user)
    fail(`invite failed: ${inviteError?.message ?? "no user returned"}`);
  const userId = invite.user.id;

  try {
    await sql.begin(async (tx) => {
      // Serialises concurrent provisioning so two first-Admin bootstraps cannot both pass the guard.
      await tx`select pg_advisory_xact_lock(hashtext('provision-user'))`;
      if (isAdminRole) {
        const [{ exists }] = await activeAdminExistsQuery(tx);
        if (exists) throw new Error("an active Admin was created concurrently");
      }

      await tx`
        insert into public.users (id, display_name, email)
        values (${userId}, ${displayName}, ${email})`;
      await tx`
        insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
        values (${userId}, ${orgUnit.id}, ${role.id}, ${assignedBy ?? userId})`;
      await tx`
        insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
        values ('user.provisioned', 'user', ${userId}, null, ${tx.json({
          email,
          display_name: displayName,
          role: role.code,
          org_unit_code: orgCode,
          assigned_by: assignedBy ?? userId,
          via: "apps/web/scripts/provision-user.ts",
        })})`;
    });
  } catch (error) {
    // Never leave an Auth account without its profile/assignment/audit rows.
    await supabase.auth.admin.deleteUser(userId);
    fail(`provisioning rolled back: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(
    `Invited ${email} as ${role.name} at ${orgUnit.name}. They set their password from the invite email.`,
  );
} finally {
  await sql.end();
}
