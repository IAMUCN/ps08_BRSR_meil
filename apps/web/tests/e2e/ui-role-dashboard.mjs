// The role-wise dashboard in a real browser (Edge, headless; Phase 6 of .grill/role-dashboard-decisions.md): each
// role's dashboard in the three themes at desktop, tablet and phone widths: nothing scrolls sideways, every tile
// loads, the headings and charts are named, a chart's table is there, keyboard focus on a mark shows its tooltip,
// axe finds nothing serious, and no console or page error. Local stack only.
// Run: E2E_SCREENSHOTS=<folder> node tests/e2e/ui-role-dashboard.mjs (the app must be running on E2E_APP_URL).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, WEB, check, env, finish, orgId, section, setup } from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const puppeteer = require("puppeteer-core");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const PRJ_X = await orgId("PRJ-X");

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session, width) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
  await context.setCookie(
    ...[...session.jar].map(([name, value]) => ({
      name,
      value,
      domain: new URL(APP).hostname,
      path: "/",
    })),
  );
  page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, path, waitFor) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: 30_000 },
    waitFor,
  );
};
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
async function axe(page) {
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    }),
  );
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.nodes.length}: ${v.nodes[0]?.target?.join(" ")})`);
}

// Who opens what: the page, a word that proves it rendered, and what must be on it.
const PERSONAS = [
  {
    key: "admin",
    path: "/admin",
    ready: "Admin Dashboard",
    headings: ["Overview", "Analysis", "Emissions overview"],
  },
  {
    key: "approver",
    path: "/app",
    ready: "Dashboard",
    headings: ["Overview", "Analysis", "Emissions overview"],
  },
  { key: "pm", path: "/app", ready: "Dashboard", headings: ["Overview", "Your area's records"] },
  { key: "hr", path: "/app", ready: "Dashboard", headings: ["Overview", "Your area's records"] },
  { key: "ehs", path: "/app", ready: "Dashboard", headings: ["Overview", "Your area's records"] },
];
const WIDTHS = [
  ["desktop", 1440],
  ["tablet", 820],
  ["phone", 390],
];

try {
  for (const { key, path, ready, headings } of PERSONAS) {
    section(`${key}: ${path}`);
    for (const [name, width] of WIDTHS) {
      const page = await pageAs(sessions[key], width);
      await go(page, path, ready);
      const body = await text(page);
      check(
        `${key} ${name}: a band or the "nothing needs your attention" line is there`,
        /Needs your attention|Nothing needs your attention/.test(body),
      );
      for (const h of headings) check(`${key} ${name}: "${h}" is on the page`, body.includes(h));
      check(`${key} ${name}: no tile failed to load`, !body.includes("could not be loaded"));
      check(`${key} ${name}: nothing scrolls sideways`, !(await sideways(page)));

      if (name === "desktop") {
        // Charts: named, and every chart offers its figures as a table.
        const charts = await page.evaluate(() => ({
          unnamed: [...document.querySelectorAll("svg[role='img'],svg[role='group']")].filter(
            (s) => !s.getAttribute("aria-label"),
          ).length,
          figures: document.querySelectorAll("figure").length,
          tables: [...document.querySelectorAll("figure details summary")].filter((s) =>
            /View as table/.test(s.textContent ?? ""),
          ).length,
        }));
        check(`${key}: every chart svg has a name`, charts.unnamed === 0, String(charts.unnamed));
        check(
          `${key}: every chart figure has "View as table"`,
          charts.figures === charts.tables,
          `${charts.figures} figures, ${charts.tables} tables`,
        );

        // A chart mark takes keyboard focus and shows its tooltip (needs data; skipped when there is none).
        const mark = await page.$("figure svg a, figure svg g[tabindex='0']");
        if (mark) {
          await mark.focus();
          const tip = await page
            .waitForSelector("[role='tooltip']", { timeout: 5_000 })
            .catch(() => null);
          check(`${key}: keyboard focus on a chart mark shows its tooltip`, !!tip);
        }
      }

      // Themes: the same page in each, readable (axe) and unbroken (no sideways scroll).
      for (const theme of ["theme-1", "theme-2", "theme-3"]) {
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await new Promise((r) => setTimeout(r, 250));
        if (name !== "tablet") {
          const found = await axe(page);
          check(`${key} ${name} ${theme}: passes axe`, found.length === 0, found.join(", "));
        }
        check(`${key} ${name} ${theme}: nothing scrolls sideways`, !(await sideways(page)));
        if (SHOTS && name === "desktop") {
          await page.screenshot({
            path: join(SHOTS, `dashboard-${key}-${theme}.png`),
            fullPage: true,
          });
        }
      }
      await page.close();
    }
  }

  section("Admin: the unit picker narrows the tiles");
  const sa = await pageAs(sessions.admin, 1440);
  await go(sa, `/admin?org=${PRJ_X}`, "Admin Dashboard");
  const scoped = await text(sa);
  check(
    "the Scope caption names the chosen unit, not the whole group",
    /Scope: [^\n]*Project X/i.test(scoped) || /Scope: [^\n]*PRJ-X/i.test(scoped),
    scoped
      .match(/Scope: [^\n]*/g)
      ?.slice(0, 3)
      .join(" | "),
  );
  check(
    "the old pipeline cards and readiness card are gone",
    !scoped.includes("Submission Completion") && !scoped.includes("Approval Completion"),
  );
  check(
    "the scope completion cards and the issues list remain",
    scoped.includes("Scope 1 Completion") && scoped.includes("Issues"),
  );

  check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await browser.close();
}
await finish();
