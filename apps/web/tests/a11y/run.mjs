// Accessibility checks in a real browser (ACCESSIBILITY_AUDIT_2026-10-12.md): axe-core on every route in
// each theme, plus checks axe cannot make — keyboard order and focus visibility, the skip link, dialogs
// (focus moves in, stays in, Escape closes, focus returns), reflow at 320px, target sizes and reduced
// motion. An automated pass is a first pass only: the manual checks a person must still do are listed in
// the audit report.
//
// Needs the app running against the LOCAL stack and a Chromium-family browser:
//   E2E_ENV_FILE=<local env file> E2E_APP_URL=http://localhost:3100 \
//   CHROMIUM_EXECUTABLE_PATH=<Edge or Chrome> pnpm --filter web test:a11y
// It creates two accounts (an Admin and a Project Manager), signs them in, and removes them afterwards.
// It refuses any database that is not local.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import puppeteer from "puppeteer-core";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = Object.fromEntries(
  readFileSync(process.env.E2E_ENV_FILE ?? join(WEB, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(env.DATABASE_URL ?? "")) {
  throw new Error("The accessibility run creates accounts: it only runs against a local database.");
}
const APP = process.env.E2E_APP_URL ?? "http://localhost:3100";
const BROWSER = process.env.CHROMIUM_EXECUTABLE_PATH ?? env.CHROMIUM_EXECUTABLE_PATH;
if (!BROWSER) throw new Error("Set CHROMIUM_EXECUTABLE_PATH to Edge or Chrome.");
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const ONLY = process.env.A11Y_ONLY?.split(",");

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1, onnotice() {} });
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const THEMES = ["theme-2", "theme-1", "theme-3"];
const PUBLIC = ["/", "/login", "/forgot-password", "/invite"];
const ADMIN = [
  "/admin",
  "/admin/submissions",
  "/admin/data-explorer",
  "/admin/validation-queue",
  "/admin/approval-queue",
  "/admin/scope-1",
  "/admin/scope-3",
  "/admin/organization",
  "/admin/users",
  "/admin/roles",
  "/admin/reporting-periods",
  "/admin/conversion-factors",
  "/admin/brsr-mapping",
  "/admin/disclosures",
  "/admin/reports",
  "/admin/reports/bundle",
  "/admin/audit-trail",
  "/admin/ocr-monitoring",
  "/admin/deadlines",
  "/admin/forecast",
  "/admin/simulator",
  "/admin/carbon-credits",
  "/admin/profile",
];
const USER = ["/app", "/app/upload", "/app/submissions", "/app/notifications", "/app/profile"];

const password = () => "Aa1!" + crypto.randomBytes(12).toString("base64url");
const PEOPLE = {
  admin: { email: "a11y.admin@traceesg.test", name: "A11y Admin", role: "admin", unit: "MEIL" },
  manager: {
    email: "a11y.manager@traceesg.test",
    name: "A11y Manager",
    role: "project_manager",
    unit: "PRJ-X",
  },
};

async function removePeople() {
  for (const person of Object.values(PEOPLE)) {
    const [row] = await sql`select id from public.users where email = ${person.email}`;
    if (!row) continue;
    await sql`delete from public.notifications where user_id = ${row.id}`;
    await sql`delete from public.user_org_assignments where user_id = ${row.id}`;
    await sql`delete from public.users where id = ${row.id}`;
    await supabase.auth.admin.deleteUser(row.id);
  }
}

// Failures that are known and recorded in the audit report. They are printed as OPEN on every run and do
// not fail it; a check listed here that starts passing is reported, so the entry gets removed.
const KNOWN_OPEN = [
  "reflow: /admin/roles fits a 320px window",
  "reflow: /admin/disclosures fits a 320px window",
];

let passed = 0;
const failures = [];
const stillOpen = [];
const notes = [];
function check(name, ok, detail = "") {
  const known = KNOWN_OPEN.includes(name);
  if (ok && known) notes.push(`"${name}" now passes: remove it from KNOWN_OPEN`);
  if (ok) passed++;
  else (known ? stillOpen : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** axe on the current page; violations are reported once per rule and page, with the first few nodes. */
async function axe(page, label, { exclude = [] } = {}) {
  await page.evaluate(AXE);
  const result = await page.evaluate(async (exclude) => {
    const context = exclude.length ? { exclude: exclude.map((s) => [s]) } : document;
    const r = await axe.run(context, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      resultTypes: ["violations", "incomplete"],
    });
    const brief = (items) =>
      items.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes.slice(0, 3).map((n) => ({
          target: n.target.join(" ").slice(0, 110),
          summary: (n.any[0]?.message ?? n.all[0]?.message ?? n.none[0]?.message ?? "").slice(
            0,
            160,
          ),
        })),
      }));
    return { violations: brief(r.violations), incomplete: brief(r.incomplete) };
  }, exclude);
  check(
    `axe: ${label}`,
    result.violations.length === 0,
    result.violations
      .map(
        (v) =>
          `[${v.impact}] ${v.id} ×${v.nodes}: ${v.sample.map((s) => `${s.target} (${s.summary})`).join(" ; ")}`,
      )
      .join("\n      "),
  );
  for (const item of result.incomplete) {
    notes.push(`needs a person: ${label}: ${item.id} ×${item.nodes} (${item.help})`);
  }
}

const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
async function open(page, path, width = 1366, height = 900) {
  await page.setViewport({ width, height });
  await page.goto(APP + path, { waitUntil: "networkidle2", timeout: 60000 });
  await settle();
}

async function signIn(context, person) {
  const page = await context.newPage();
  await open(page, "/login");
  await page.type('input[name="email"]', person.email);
  await page.type('input[name="password"]', person.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.keyboard.press("Enter"),
  ]);
  return page;
}

/** What has focus, and whether anything visible marks it. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body)
      return { tag: "body", name: "", visible: false, inDialog: false };
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const ring =
      (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
      (s.boxShadow && s.boxShadow !== "none");
    // An element under a sticky bar or a floating button is focused but cannot be seen (2.4.11).
    // 2.4.11 asks that it is not ENTIRELY hidden, so nine points across the control are sampled.
    const seenAt = (fx, fy) => {
      const x = Math.min(Math.max(rect.left + rect.width * fx, 0), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height * fy, 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      return Boolean(top && (top === el || el.contains(top) || top.contains(el)));
    };
    const anyVisible = [0.1, 0.5, 0.9].some((fx) => [0.1, 0.5, 0.9].some((fy) => seenAt(fx, fy)));
    return {
      tag: el.tagName.toLowerCase(),
      name: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || "")
        .trim()
        .slice(0, 40),
      visible: Boolean(ring),
      inView: rect.bottom > 0 && rect.top < innerHeight,
      covered: !anyVisible,
      inDialog: Boolean(
        el.closest("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]"),
      ),
    };
  });

async function tabThrough(page, label, count) {
  const seen = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    seen.push(await focusInfo(page));
  }
  const unmarked = seen.filter((f) => f.tag !== "body" && !f.visible);
  check(
    `keyboard: every focused control on ${label} shows a focus indicator`,
    unmarked.length === 0,
    unmarked
      .slice(0, 5)
      .map((f) => `${f.tag} "${f.name}"`)
      .join(", "),
  );
  const hidden = seen.filter((f) => f.tag !== "body" && f.inView && f.covered);
  check(
    `keyboard: no focused control on ${label} is entirely hidden behind another element`,
    hidden.length === 0,
    hidden
      .slice(0, 5)
      .map((f) => `${f.tag} "${f.name}"`)
      .join(", "),
  );
  return seen;
}

/** Opens something with a button, then checks the dialog contract: focus in, trapped, Escape, restored. */
async function dialogCheck(page, label, openerText, { modal = true } = {}) {
  const [opener] = await page.$$(
    `xpath/.//button[normalize-space()='${openerText}' or starts-with(@aria-label, '${openerText}')]`,
  );
  if (!opener)
    return check(`dialog: ${label} opens from "${openerText}"`, false, "button not found");
  await opener.focus();
  await page.keyboard.press("Enter");
  await settle(600);
  const state = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].find(
      (d) => d.getBoundingClientRect().width > 0,
    );
    if (!dialog) return null;
    return {
      named: Boolean(
        dialog.getAttribute("aria-label") ||
        document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.innerText,
      ),
      focusInside: dialog.contains(document.activeElement),
    };
  });
  check(`dialog: ${label} opens`, Boolean(state));
  if (!state) return;
  check(`dialog: ${label} has an accessible name`, state.named);
  check(`dialog: focus moves into ${label}`, state.focusInside);
  await axe(page, `${label} (open)`);
  if (modal) {
    let escaped = 0;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() =>
        Boolean(document.activeElement?.closest("[role=dialog], [role=alertdialog]")),
      );
      if (!inside) escaped++;
    }
    check(`dialog: Tab stays inside ${label}`, escaped === 0, `${escaped} of 25 presses left it`);
  }
  await page.keyboard.press("Escape");
  await settle(500);
  const after = await page.evaluate((text) => {
    const open = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].some(
      (d) => d.getBoundingClientRect().width > 0,
    );
    const el = document.activeElement;
    return {
      open,
      restored: (el?.innerText || el?.getAttribute("aria-label") || "").trim().startsWith(text),
    };
  }, openerText);
  check(`dialog: Escape closes ${label}`, !after.open);
  check(`dialog: focus returns to "${openerText}" after ${label} closes`, after.restored);
}

/** WCAG 1.4.10: at 320 CSS pixels wide nothing needs sideways scrolling (data tables scroll in their box). */
async function reflow(page, path) {
  await open(page, path, 320, 640);
  const size = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  check(`reflow: ${path} fits a 320px window`, size[0] <= size[1] + 1, `${size[0]}px wide`);
}

/**
 * WCAG 2.5.8: a target is at least 24 by 24 CSS pixels. Not a failure, by the criterion's exceptions: a link
 * inside a sentence; a native checkbox, radio or slider the page has not resized; a link stretched over its
 * card by a pseudo-element; and a smaller target whose 24px circle touches no other target (spacing).
 */
async function targets(page, label) {
  const small = await page.evaluate(() => {
    const all = [];
    for (const el of document.querySelectorAll(
      "button, a[href], input:not([type=hidden]), select, [role=button], summary",
    )) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === "hidden") continue;
      if (el.closest("details:not([open])") && !el.matches("summary")) continue;
      if (s.position === "absolute" && s.clip !== "auto") continue; // visually hidden (sr-only)
      all.push({ el, r, s });
    }
    const out = [];
    for (const { el, r, s } of all) {
      if (r.width >= 24 && r.height >= 24) continue;
      if (
        el.tagName === "A" &&
        s.display === "inline" &&
        el.parentElement?.innerText.trim() !== el.innerText.trim()
      )
        continue;
      if (el.tagName === "A" && getComputedStyle(el, "::after").position === "absolute") continue;
      if (el.matches("input[type=checkbox], input[type=radio]") && s.appearance !== "none")
        continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const crowded = all.some(
        (other) =>
          other.el !== el &&
          !other.el.contains(el) &&
          !el.contains(other.el) &&
          other.r.left < cx + 12 &&
          other.r.right > cx - 12 &&
          other.r.top < cy + 12 &&
          other.r.bottom > cy - 12,
      );
      if (!crowded) continue;
      const name = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || "")
        .trim()
        .slice(0, 24);
      out.push(
        `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`,
      );
    }
    return out;
  });
  check(
    `target size: every control on ${label} is at least 24×24 or clear of its neighbours`,
    small.length === 0,
    `${small.length}: ${[...new Set(small)].slice(0, 6).join("; ")}`,
  );
}

const run = (name) => !ONLY || ONLY.includes(name);
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
// The database allows two Super Admins (migration 0050), and a local database the end-to-end suite has run
// on may already have them. The run's own Admin then needs one more place: the limit is raised for the run
// and put back afterwards, whatever happens.
let superAdminLimit = null;
try {
  await removePeople();
  const [holders] = await sql`
    select count(distinct uoa.user_id)::int as n from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id and r.code = 'admin'
    join public.users u on u.id = uoa.user_id
    where uoa.revoked_at is null and u.is_active and u.deleted_at is null`;
  const [setting] = await sql`
    select value from public.org_settings where key = 'super_admin_limit'`;
  if (setting && holders.n >= Number(setting.value)) {
    superAdminLimit = setting.value;
    await sql`update public.org_settings set value = ${sql.json(holders.n + 1)}
              where key = 'super_admin_limit'`;
  }
  for (const person of Object.values(PEOPLE)) {
    person.password = password();
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    person.id = data.user.id;
    await sql`insert into public.users (id, display_name, email) values (${person.id}, ${person.name}, ${person.email})`;
    await sql`
      insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
      select ${person.id}, o.id, r.id, ${person.id} from public.org_units o, public.roles r
      where o.code = ${person.unit} and r.code = ${person.role}`;
    await sql`
      insert into public.notifications (user_id, type, title, message, deep_link_path)
      values (${person.id}, 'verification_needed', 'A document is ready to verify', 'Open it to check the values.', '/app')`;
  }

  // --- Signed out -----------------------------------------------------------------------------------
  const anonymous = await browser.createBrowserContext();
  const page = await anonymous.newPage();
  if (run("axe"))
    for (const path of PUBLIC) {
      await open(page, path);
      await axe(page, `${path} (signed out)`);
    }
  if (run("keyboard")) {
    await open(page, "/");
    await page.keyboard.press("Tab");
    const first = await focusInfo(page);
    check(
      "skip link: the first Tab stop on the landing page is a skip link",
      /skip/i.test(first.name),
      `it is ${first.tag} "${first.name}"`,
    );
    check("skip link: it is visible when focused", first.visible);
    await page.keyboard.press("Enter");
    await settle(200);
    check(
      "skip link: using it moves focus to the main region",
      await page.evaluate(() => document.activeElement?.id === "main-content"),
    );
    await tabThrough(page, "the landing page", 30);
    await open(page, "/login");
    const order = (await tabThrough(page, "the sign-in page", 6)).map((f) => f.name || f.tag);
    notes.push(`sign-in tab order: ${order.join(" → ")}`);
    // 3.3.8 Accessible Authentication: a password manager can fill, and paste is not blocked.
    const auth = await page.evaluate(() => {
      const email = document.querySelector('input[name="email"]');
      const pw = document.querySelector('input[name="password"]');
      return {
        emailAuto: email?.getAttribute("autocomplete"),
        pwAuto: pw?.getAttribute("autocomplete"),
        pasteBlocked: Boolean(pw?.getAttribute("onpaste")),
        labelled: Boolean(email?.labels?.length && pw?.labels?.length),
      };
    });
    check("sign-in: the fields are labelled and announce what to fill", auth.labelled);
    check(
      "sign-in: autocomplete lets a password manager fill both fields",
      /email|username/.test(auth.emailAuto ?? "") && /current-password/.test(auth.pwAuto ?? ""),
      `email="${auth.emailAuto}" password="${auth.pwAuto}"`,
    );
    // An error must be announced, not only shown.
    await page.type('input[name="email"]', "nobody@traceesg.test");
    await page.type('input[name="password"]', "wrong-password-1A!");
    await page.keyboard.press("Enter");
    await settle(2500);
    const error = await page.evaluate(() => {
      const el = [...document.querySelectorAll("[role=alert], [aria-live]")].find((e) =>
        e.innerText.trim(),
      );
      const email = document.querySelector('input[name="email"]');
      return {
        announced: el?.innerText.trim().slice(0, 80) ?? null,
        described: email?.getAttribute("aria-describedby"),
        invalid: email?.getAttribute("aria-invalid"),
      };
    });
    check(
      "sign-in: a failed attempt is announced to assistive technology",
      Boolean(error.announced),
      JSON.stringify(error),
    );
  }
  if (run("reflow")) for (const path of PUBLIC) await reflow(page, path);
  if (run("targets")) {
    for (const path of PUBLIC) {
      await open(page, path, 390, 844);
      await targets(page, `${path} (phone)`);
    }
  }
  if (run("motion")) {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await open(page, "/");
    await settle(1200);
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((el) => {
          const s = getComputedStyle(el);
          return (
            s.animationName !== "none" &&
            parseFloat(s.animationDuration) > 0.01 &&
            s.animationIterationCount === "infinite"
          );
        })
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`),
    );
    check(
      "reduced motion: nothing on the landing page keeps animating",
      moving.length === 0,
      moving.slice(0, 4).join("; "),
    );
    await page.emulateMediaFeatures([]);
  }
  await anonymous.close();

  // --- Signed in ------------------------------------------------------------------------------------
  for (const [who, paths] of [
    ["admin", ADMIN],
    ["manager", USER],
  ]) {
    const person = PEOPLE[who];
    const context = await browser.createBrowserContext();
    const app = await signIn(context, person);
    if (run("axe")) {
      for (const theme of THEMES) {
        await sql`update public.users set theme = ${theme} where id = ${person.id}`;
        const sample = paths;
        for (const path of sample) {
          await open(app, path);
          await app.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
          await settle(150);
          await axe(app, `${path} (${who}, ${theme})`);
        }
      }
      await sql`update public.users set theme = 'theme-2' where id = ${person.id}`;
    }
    const home = who === "admin" ? "/admin" : "/app";
    if (run("keyboard")) {
      await open(app, home);
      await app.keyboard.press("Tab");
      const first = await focusInfo(app);
      check(
        `skip link: the first Tab stop in the ${who} shell is a skip link`,
        /skip/i.test(first.name),
        `it is ${first.tag} "${first.name}"`,
      );
      await tabThrough(app, `the ${who} dashboard`, 45);
      const landmarks = await app.evaluate(() => ({
        main: document.querySelectorAll("main").length,
        nav: [...document.querySelectorAll("nav")].map(
          (n) => n.getAttribute("aria-label") ?? "(unnamed)",
        ),
        header: document.querySelectorAll("header").length,
        lang: document.documentElement.lang,
      }));
      check(
        `landmarks: the ${who} shell has one main region and named navigation`,
        landmarks.main === 1 &&
          landmarks.nav.length > 0 &&
          !landmarks.nav.includes("(unnamed)") &&
          landmarks.lang === "en",
        JSON.stringify(landmarks),
      );
    }
    if (run("dialogs")) {
      await open(app, home);
      await dialogCheck(app, "the notifications menu", "Notifications", { modal: false });
      if (who === "admin") {
        await open(app, "/admin/users");
        await dialogCheck(app, "the Invite user panel", "Invite user");
        await open(app, "/admin/reporting-periods");
        await dialogCheck(app, "the Create period panel", "Create period");
      }
    }
    if (run("reflow")) for (const path of paths) await reflow(app, path);
    if (run("targets")) {
      for (const path of paths.filter((_, i) => i % 2 === 0)) {
        await open(app, path, 390, 844);
        await targets(app, `${path} (${who}, phone)`);
      }
    }
    if (run("tables") && who === "admin") {
      for (const path of [
        "/admin/users",
        "/admin/deadlines",
        "/admin/reporting-periods",
        "/admin/roles",
      ]) {
        await open(app, path);
        const tables = await app.evaluate(() =>
          [...document.querySelectorAll("main table")].map((t) => ({
            headers: t.querySelectorAll("th").length,
            scoped: t.querySelectorAll("th[scope]").length,
            named: Boolean(
              t.caption || t.getAttribute("aria-label") || t.getAttribute("aria-labelledby"),
            ),
          })),
        );
        check(
          `tables: header cells on ${path} say what they head (scope)`,
          tables.every((t) => t.headers > 0 && t.scoped === t.headers),
          JSON.stringify(tables),
        );
      }
    }
    if (run("titles")) {
      const titles = new Map();
      for (const path of paths) {
        await open(app, path);
        const title = await app.title();
        titles.set(title, [...(titles.get(title) ?? []), path]);
      }
      const shared = [...titles].filter(([, where]) => where.length > 1);
      check(
        `titles: every ${who} page has its own title`,
        shared.length === 0,
        shared.map(([t, w]) => `"${t}": ${w.join(", ")}`).join("; "),
      );
    }
    await context.close();
  }
} catch (error) {
  failures.push("the run stopped: " + (error?.stack ?? error));
} finally {
  await browser.close();
  await removePeople().catch((error) => failures.push("cleanup: " + error.message));
  if (superAdminLimit !== null) {
    await sql`update public.org_settings set value = ${sql.json(superAdminLimit)}
              where key = 'super_admin_limit'`.catch((error) =>
      failures.push("cleanup (Super Admin limit): " + error.message),
    );
  }
  await sql.end();
  for (const note of [...new Set(notes)]) console.log("note  " + note);
  for (const item of stillOpen) console.log("OPEN  " + item);
  for (const failure of failures) console.log("FAIL  " + failure);
  console.log(`\n${passed} passed, ${failures.length} failed, ${stillOpen.length} known open`);
  process.exit(failures.length ? 1 : 0);
}
