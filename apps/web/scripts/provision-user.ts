// Provisions an account: Supabase Auth invite + public.users profile + role/org-scope assignment +
// audit entry. Accounts are Admin-provisioned only (.grill/phase-3-auth-decisions.md).
//
//   First Admin (refused while any active Admin exists):
//     pnpm --filter web provision-user --email admin@example.com --name "Jane Admin" --role admin --org-code MEIL
//   Any other role (attributed to an existing active Admin):
//     pnpm --filter web provision-user --email pm@example.com --name "Ravi PM" --role project_manager \
//       --org-code PRJ-X --assigned-by admin@example.com
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local by default — pass a
// different file's values via the environment to target another project, e.g. hosted). Everything goes
// through the Supabase client (service role bypasses RLS), never a direct database connection, so the
// same command provisions local or hosted accounts identically.
// By default the invite email lets the user choose their own password — no password is passed here.
// Pass --password (same policy as everywhere else, lib/auth/password-policy.ts) only where invite email
// can't be delivered yet (no custom SMTP configured — 06_IMPLEMENTATION_PLAN.md Phase 21 "Email" open
// item): the account is created with that password directly instead of an emailed invite link.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
// Relative import with extension: this script runs under plain `node`, not the Next.js/tsc "@/" alias.
import { passwordMeetsPolicy, passwordPolicyMessage } from "../lib/auth/password-policy.ts";

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
    password: { type: "string" },
  },
  strict: true,
});

const email = values.email?.trim().toLowerCase();
const displayName = values.name?.trim();
const roleCode = values.role?.trim();
const orgCode = values["org-code"]?.trim();
const assignedByEmail = values["assigned-by"]?.trim().toLowerCase();
const password = values.password;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  fail("--email must be a valid email address");
if (!displayName) fail("--name is required");
if (!roleCode) fail("--role is required (a roles.code, e.g. admin, project_manager)");
if (!orgCode) fail("--org-code is required (an org_units.code, e.g. MEIL)");
if (password !== undefined && !passwordMeetsPolicy(password))
  fail(`--password: ${passwordPolicyMessage(password)}`);

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function orFail<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) fail(`${what}: ${result.error.message}`);
  return result.data as T;
}

// ponytail: no cross-table transaction or advisory lock here (PostgREST has neither) — two concurrent
// runs racing the same first-Admin bootstrap could both pass this check. Acceptable for a manual,
// once-per-project CLI script; upgrade to a `provision_user` Postgres function called via supabase.rpc()
// if concurrent bootstraps ever become a real risk.
async function activeAdminUserIds(): Promise<string[]> {
  const adminRole = orFail<{ id: string } | null>(
    await supabase.from("roles").select("id").eq("code", "admin").maybeSingle(),
    "admin role lookup failed",
  );
  if (!adminRole) fail('the "admin" role is not seeded');

  const assignments = orFail<{ user_id: string }[]>(
    await supabase
      .from("user_org_assignments")
      .select("user_id")
      .eq("role_id", adminRole.id)
      .is("revoked_at", null),
    "admin assignment lookup failed",
  );
  const candidateIds = [...new Set(assignments.map((a) => a.user_id))];
  if (candidateIds.length === 0) return [];

  const activeUsers = orFail<{ id: string }[]>(
    await supabase
      .from("users")
      .select("id")
      .in("id", candidateIds)
      .eq("is_active", true)
      .is("deleted_at", null),
    "user lookup failed",
  );
  return activeUsers.map((u) => u.id);
}

const role = orFail<{ id: string; code: string; name: string } | null>(
  await supabase.from("roles").select("id, code, name").eq("code", roleCode).maybeSingle(),
  "role lookup failed",
);
if (!role) fail(`unknown role "${roleCode}"`);

const orgUnit = orFail<{ id: string; name: string; unit_type: string } | null>(
  await supabase
    .from("org_units")
    .select("id, name, unit_type")
    .eq("code", orgCode)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle(),
  "org unit lookup failed",
);
if (!orgUnit) fail(`no active org unit with code "${orgCode}"`);
// The admin role is organization-wide (is_admin()), so it is only assignable at the root Group.
if (role.code === "admin" && orgUnit.unit_type !== "group") {
  fail("the admin role can only be assigned at the root organization (the group node)");
}

const existing = orFail<{ id: string }[]>(
  await supabase.from("users").select("id").ilike("email", email),
  "existing-user lookup failed",
);
if (existing.length > 0) fail(`a user with email ${email} already exists`);

const isAdminRole = role.code === "admin";
let assignedBy: string | null = null;

if (isAdminRole) {
  if ((await activeAdminUserIds()).length > 0) {
    fail("an active Admin already exists — create further Admins from User Management instead");
  }
} else {
  if (!assignedByEmail) fail("--assigned-by <active admin email> is required for non-admin roles");
  const assigner = orFail<{ id: string } | null>(
    await supabase
      .from("users")
      .select("id")
      .ilike("email", assignedByEmail)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    "assigner lookup failed",
  );
  if (!assigner || !(await activeAdminUserIds()).includes(assigner.id)) {
    fail(`--assigned-by ${assignedByEmail} is not an active Admin`);
  }
  assignedBy = assigner.id;
}

const { data: created, error: createError } = password
  ? await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    })
  : await supabase.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName } });
if (createError || !created.user)
  fail(
    `${password ? "account creation" : "invite"} failed: ${createError?.message ?? "no user returned"}`,
  );
const userId = created.user.id;

// No shared transaction across these inserts (PostgREST has none) — roll back by hand on any failure so
// an Auth account is never left without its profile/assignment/audit rows.
let userInserted = false;
try {
  const userInsert = await supabase
    .from("users")
    .insert({ id: userId, display_name: displayName, email });
  if (userInsert.error) throw new Error(`profile insert failed: ${userInsert.error.message}`);
  userInserted = true;

  const assignmentInsert = await supabase.from("user_org_assignments").insert({
    user_id: userId,
    org_unit_id: orgUnit.id,
    role_id: role.id,
    assigned_by: assignedBy ?? userId,
  });
  if (assignmentInsert.error)
    throw new Error(`role assignment failed: ${assignmentInsert.error.message}`);

  const auditInsert = await supabase.from("audit_logs").insert({
    event_type: "user.provisioned",
    entity_type: "user",
    entity_id: userId,
    user_id: null,
    new_value: {
      email,
      display_name: displayName,
      role: role.code,
      org_unit_code: orgCode,
      assigned_by: assignedBy ?? userId,
      via: "apps/web/scripts/provision-user.ts",
    },
  });
  if (auditInsert.error) throw new Error(`audit log insert failed: ${auditInsert.error.message}`);
} catch (error) {
  if (userInserted) await supabase.from("users").delete().eq("id", userId);
  await supabase.auth.admin.deleteUser(userId);
  fail(`provisioning rolled back: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(
  password
    ? `Created ${email} as ${role.name} at ${orgUnit.name} with the password given — change it after signing in.`
    : `Invited ${email} as ${role.name} at ${orgUnit.name}. They set their password from the invite email.`,
);
