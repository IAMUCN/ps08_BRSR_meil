import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { passwordSetupCookieOptions } from "../lib/auth/password-setup.ts";
import { assertOrgScope, inOrgScope, scopedOrgUnitIds } from "../lib/auth/scope.ts";
import { csvSafeText } from "../lib/csv.ts";
import { toCsv } from "../lib/reports/bundle-utils.ts";
import { SESSION_COOKIE_OPTIONS } from "../lib/supabase/cookie-options.ts";
import { sameOriginRequest } from "../lib/security/origin.ts";

const req = (over: Partial<Parameters<typeof sameOriginRequest>[0]>) =>
  sameOriginRequest({
    method: "POST",
    origin: null,
    secFetchSite: null,
    host: "traceesg.example.com",
    forwardedHost: null,
    ...over,
  });

test("CSRF: a mutation from the app's own pages is allowed", () => {
  assert.equal(req({ origin: "https://traceesg.example.com", secFetchSite: "same-origin" }), true);
  assert.equal(
    req({ origin: "https://TraceESG.example.com" }),
    true,
    "hosts compare case-insensitively",
  );
  assert.equal(
    req({ origin: "https://app.meil.in", host: "internal:3000", forwardedHost: "app.meil.in" }),
    true,
    "behind a proxy the forwarded host is the app's host",
  );
});

test("CSRF: a mutation from another site — including a sibling subdomain — is refused", () => {
  assert.equal(req({ origin: "https://evil.example" }), false);
  assert.equal(
    req({ origin: "https://other.example.com" }),
    false,
    "SameSite=Lax would allow this one",
  );
  assert.equal(req({ origin: "null" }), false, "sandboxed frames send Origin: null");
  assert.equal(
    req({ secFetchSite: "cross-site" }),
    false,
    "a browser without Origin but cross-site",
  );
});

test("CSRF: reads and non-browser clients are not affected", () => {
  assert.equal(req({ method: "GET", origin: "https://evil.example" }), true);
  assert.equal(req({}), true, "no Origin and no Sec-Fetch-Site: not a browser, no ambient cookies");
});

// --- Audit of 2026-10-12 (SECURITY_AUDIT_2026-10-12.md) ---------------------------------------------------

/** Stands in for the database connection: answers every query with the given assignment scope. */
const scopeSql = (ids: string[]) => {
  let queries = 0;
  const sql = (() => {
    queries++;
    return Promise.resolve(ids.map((id) => ({ id })));
  }) as unknown as Parameters<typeof scopedOrgUnitIds>[0];
  return { sql, queries: () => queries };
};

test("org scope: an Admin reaches every org unit without a lookup", async () => {
  const db = scopeSql([]);
  const admin = { userId: "u-admin", isAdmin: true };
  assert.equal(await scopedOrgUnitIds(db.sql, admin), null);
  assert.equal(await inOrgScope(db.sql, admin, "any-unit"), true);
  await assertOrgScope(db.sql, admin, "any-unit");
  assert.equal(db.queries(), 0);
});

test("org scope: anyone else reaches only their assigned units and what lies beneath", async () => {
  const db = scopeSql(["project-x", "site-1"]);
  const pm = { userId: "u-pm", isAdmin: false };
  assert.deepEqual(await scopedOrgUnitIds(db.sql, pm), ["project-x", "site-1"]);
  assert.equal(await inOrgScope(db.sql, pm, "site-1"), true);
  assert.equal(
    await inOrgScope(db.sql, pm, "project-y"),
    false,
    "a sibling project is out of scope",
  );
  await assert.rejects(assertOrgScope(db.sql, pm, "project-y"), { code: "FORBIDDEN" });
  await assert.rejects(
    assertOrgScope(scopeSql([]).sql, pm, "project-x"),
    { code: "FORBIDDEN" },
    "no assignment means no org unit at all",
  );
});

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("access control: procedures that read across the organisation are gated in their routers", () => {
  const deadlines = source("lib/trpc/routers/deadlines.ts");
  assert.ok(
    !deadlines.includes("protectedProcedure"),
    "deadline tasks carry names and emails of every org unit's people: Admin only",
  );
  const carbon = source("lib/trpc/routers/carbonCredits.ts");
  assert.ok(
    !carbon.includes("protectedProcedure"),
    "no carbon-credit procedure is open to any user",
  );
  for (const name of [
    "summary",
    "list",
    "reconciliation",
    "icpList",
    "mint",
    "retire",
    "transfer",
  ]) {
    const start = carbon.indexOf(`  ${name}: `);
    assert.ok(start > 0, `${name} exists`);
    const body = carbon.slice(start, carbon.indexOf("\n  /**", start + 1));
    assert.match(body, /scopedOrgUnitIds|assertOrgScope|inScope/, `${name} checks org scope`);
  }
  assert.ok(
    !carbon.includes("passed: true"),
    "the double-counting check is computed from the ledger, never a fixed answer",
  );
  const reports = source("lib/trpc/routers/reports.ts");
  assert.match(
    reports,
    /bundlePreview: generateProcedure/,
    "the bundle preview needs report.generate",
  );
});

test("evidence bundle: reads the audit table that exists and keeps error text on the server", () => {
  assert.ok(!/public\.audit_log\b(?!s)/.test(source("lib/reports/bundle.ts")));
  const route = source("app/api/reports/bundle/route.ts");
  assert.ok(!route.includes("error.message"), "database error text is not sent to the browser");
  assert.match(route, /report\.generate/);
});

test("CSV exports: text a spreadsheet would run as a formula stays text", () => {
  assert.equal(csvSafeText('=HYPERLINK("http://evil.example","Invoice")')[0], "'");
  for (const cell of ["+cmd|' /C calc'!A0", "-2+3", "@SUM(A1:A9)", "\t=1+1"]) {
    assert.equal(csvSafeText(cell), `'${cell}`);
  }
  for (const cell of ["Diesel invoice.pdf", "-12.5", "+7", "42", "", "a=b"]) {
    assert.equal(csvSafeText(cell), cell, `"${cell}" is left as it is`);
  }
  assert.ok(toCsv(["file"], [["=1+1"]]).endsWith("'=1+1"), "the evidence bundle's CSVs use it");
  assert.ok(toCsv(["value"], [[-5]]).endsWith("-5"), "a number stays a number");
});

test("session and set-password cookies are not readable by scripts", () => {
  assert.equal(SESSION_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(SESSION_COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(passwordSetupCookieOptions.httpOnly, true);
  assert.equal(passwordSetupCookieOptions.path, "/reset-password");
  for (const file of ["lib/supabase/server.ts", "proxy.ts"]) {
    assert.match(source(file), /cookieOptions: SESSION_COOKIE_OPTIONS/, file);
  }
  for (const file of ["app/reset-password/page.tsx", "app/reset-password/actions.ts"]) {
    assert.match(
      source(file),
      /PASSWORD_SETUP_COOKIE/,
      `${file} refuses a session without the marker`,
    );
  }
});

test("password reset code: an attempt is claimed in one statement before the code is compared", () => {
  const action = source("app/forgot-password/actions.ts");
  assert.match(
    action,
    /update public\.password_reset_otps set attempts = attempts \+ 1[\s\S]*returning id, code_hash/,
  );
  assert.match(action, /timingSafeEqual/);
});
