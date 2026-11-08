// Phase 8 screens in a real browser (Edge, headless): the Scope Table / Chart switch, the top-bar search driven
// by the keyboard, the Ask button in the three themes, the template choice on Reports, and the landing page at
// desktop and phone widths. axe-core on each. No console or page error. Local stack only.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, WEB, check, env, finish, orgId, section, setup } from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const puppeteer = require("puppeteer-core");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;
const PRJ_X = await orgId("PRJ-X");

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session, width = 1440) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
  if (session)
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
const shot = async (page, name, fullPage = true) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase8-${name}.png`), fullPage });
};
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
/** axe-core's serious and critical violations (WCAG 2.2 AA rules), ignoring what lies outside `scope`. */
async function axe(page, scope) {
  await page.evaluate(AXE);
  const result = await page.evaluate(
    (sel) =>
      window.axe.run(sel ? document.querySelector(sel) : document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
      }),
    scope ?? null,
  );
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.nodes.length}: ${v.nodes[0]?.target?.join(" ")} ${v.nodes[0]?.failureSummary?.split(String.fromCharCode(10))[1] ?? ""})`,
    );
}

try {
  section("Scope pages: Table and Chart");
  const sa = await pageAs(admin);
  await go(sa, `/admin/scope-1?org=${PRJ_X}`, "By activity");
  const press = (label) =>
    sa.evaluate((l) => {
      const b = [...document.querySelectorAll('[role="group"] button')].find(
        (x) => x.textContent?.trim() === l,
      );
      b?.click();
      return !!b;
    }, label);
  check(
    "Table is pressed first",
    (await sa.evaluate(() =>
      document.querySelector('[aria-pressed="true"]')?.textContent?.trim(),
    )) === "Table",
  );
  await press("Chart");
  await sa.waitForFunction(() => location.search.includes("view=chart"), { timeout: 15_000 });
  await sa.waitForFunction(
    () => document.body.innerText.includes("Approved emissions by activity"),
    { timeout: 15_000 },
  );
  check(
    "Chart draws the activities at a project, and the address keeps it",
    sa.url().includes("view=chart"),
  );
  check(
    "the records stay a table, and the page says why",
    /each row is a document to open/.test(await text(sa)),
  );
  const period = await sa.evaluate(() => {
    const select = document.getElementById("scope-period");
    const other = [...select.options].find((o) => o.value !== select.value);
    return other?.value ?? null;
  });
  if (period) {
    await sa.select("#scope-period", period);
    await sa.waitForFunction((p) => location.search.includes(p), { timeout: 15_000 }, period);
    check("changing the period keeps Chart", sa.url().includes("view=chart"));
  }
  const chartAxe = await axe(sa, "main");
  check("Chart passes axe", chartAxe.length === 0, chartAxe.join(", "));
  await shot(sa, "scope-chart");
  await press("Table");
  await sa.waitForFunction(() => !location.search.includes("view=chart"), { timeout: 15_000 });
  check(
    "Table brings the tables back",
    !(await text(sa)).includes("Approved emissions by activity"),
  );

  section("Top-bar search");
  await go(sa, "/admin/users", "Users");
  await sa.keyboard.down("Control");
  await sa.keyboard.press("k");
  await sa.keyboard.up("Control");
  await sa.waitForSelector('[role="dialog"] input[role="combobox"]', { timeout: 10_000 });
  check(
    "Ctrl+K opens the search with the cursor in it",
    await sa.evaluate(() => document.activeElement?.getAttribute("role") === "combobox"),
  );
  check("one letter says what will be searched", /Type at least 2 characters/.test(await text(sa)));
  await sa.keyboard.type("e2e");
  await sa.waitForSelector('[role="option"]', { timeout: 15_000 });
  const firstGroup = await sa.evaluate(() =>
    document.querySelector('[role="listbox"] [role="group"]')?.getAttribute("aria-label"),
  );
  check("on Users, People come first", firstGroup === "People", firstGroup);
  const dialogAxe = await axe(sa, '[role="dialog"]');
  check("the search dialog passes axe", dialogAxe.length === 0, dialogAxe.join(", "));
  await shot(sa, "search", false);
  await sa.keyboard.press("ArrowDown");
  const target = await sa.evaluate(
    () => document.querySelector('[role="option"][aria-selected="true"]')?.textContent,
  );
  await sa.keyboard.press("Enter");
  await sa.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 15_000 });
  await sa
    .waitForFunction(() => location.search.includes("q="), { timeout: 15_000 })
    .catch(() => {});
  check(
    "arrow and Enter open the chosen result",
    !!target && sa.url().includes("/admin/users?q="),
    sa.url(),
  );
  await sa.keyboard.down("Control");
  await sa.keyboard.press("k");
  await sa.keyboard.up("Control");
  await sa.waitForSelector('[role="dialog"] input');
  await sa.keyboard.type("zzqqxx nothing");
  await sa.waitForFunction(() => /No matches for/.test(document.body.innerText), {
    timeout: 15_000,
  });
  check(
    "no matches says what was searched",
    /Searched .*records in every org unit/.test(await text(sa)),
  );
  await sa.keyboard.press("Escape");
  const closed = await sa
    .waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  check("Escape closes it", closed);

  const pmPage = await pageAs(pm);
  await go(pmPage, "/app", "Dashboard");
  await pmPage.keyboard.press("/");
  await pmPage.waitForSelector('[role="dialog"] input');
  await pmPage.keyboard.type("diesel");
  await pmPage.waitForSelector('[role="option"]', { timeout: 15_000 });
  const pmGroups = await pmPage.evaluate(() =>
    [...document.querySelectorAll('[role="listbox"] [role="group"]')].map((g) =>
      g.getAttribute("aria-label"),
    ),
  );
  check(
    "a Project Manager sees records and their activity only",
    !pmGroups.some((g) => ["People", "Org units", "Reports"].includes(g)),
    pmGroups.join(","),
  );

  section("Ask button");
  await go(sa, "/admin", "Dashboard");
  const ask = await sa.$("header .ask-button");
  if (ask) {
    for (const theme of ["theme-1", "theme-2", "theme-3"]) {
      await sa.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await new Promise((r) => setTimeout(r, 300));
      const look = await sa.evaluate(() => {
        const b = document.querySelector("header .ask-button");
        const ring = getComputedStyle(b, "::before");
        return {
          ring: ring.backgroundImage.includes("conic-gradient"),
          label: b.textContent.trim(),
        };
      });
      check(
        `${theme}: the Ask button has its ring and reads "Ask AI"`,
        look.ring && look.label === "Ask AI",
      );
      const header = await sa.$("header");
      if (SHOTS) await header.screenshot({ path: join(SHOTS, `phase8-ask-${theme}.png`) });
    }
    const headerAxe = await axe(sa, "header");
    check(
      "the header passes axe with the Ask button",
      headerAxe.length === 0,
      headerAxe.join(", "),
    );
  } else {
    console.log("  (the chatbot is not set up on this server: no Ask button to look at)");
  }

  section("Reports: choosing a template");
  await go(sa, "/admin/reports", "Template");
  const options = await sa.evaluate(() =>
    [...document.querySelectorAll("#report-template option")].map((o) => o.textContent),
  );
  check(
    "four templates are offered",
    options.join("|") === "Full SEBI BRSR|BRSR Core KPIs|GHG inventory|Executive summary",
    options.join("|"),
  );
  await sa.select("#report-template", "ghg");
  check("each says what it holds", /Also as an Excel workbook/.test(await text(sa)));
  check("the button names the template", /Generate GHG inventory/.test(await text(sa)));
  const reportsAxe = await axe(sa, "main");
  check("the Reports page passes axe", reportsAxe.length === 0, reportsAxe.join(", "));

  section("Landing page");
  for (const [width, name] of [
    [1440, "desktop"],
    [390, "phone"],
  ]) {
    const lp = await pageAs(null, width);
    await go(lp, "/", "From Real Documents");
    check(`${name}: no sideways scroll`, !(await sideways(lp)));
    const trend = await lp.evaluate(() =>
      document.querySelector('#reporting svg[role="img"]')?.getAttribute("aria-label"),
    );
    check(
      `${name}: the sample trend chart has a text alternative`,
      /Jan 48/.test(trend ?? ""),
      trend,
    );
    // Scroll through first so every reveal-on-scroll section has finished fading in.
    await lp.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 1500));
    const landingAxe = await axe(lp);
    check(`${name}: the landing page passes axe`, landingAxe.length === 0, landingAxe.join(", "));
    if (name === "phone") {
      const widths = await lp.evaluate(() =>
        [...document.querySelectorAll("section a")]
          .filter((a) => /Request a demo|See how it works/.test(a.textContent))
          .slice(0, 2)
          .map((a) => Math.round(a.getBoundingClientRect().width)),
      );
      check(
        "phone: the two hero buttons are the same full width",
        widths.length === 2 && widths[0] === widths[1] && widths[0] > 300,
        widths.join(","),
      );
    }
    await shot(lp, `landing-${name}`, false);
  }

  check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await browser.close();
}
await finish();
