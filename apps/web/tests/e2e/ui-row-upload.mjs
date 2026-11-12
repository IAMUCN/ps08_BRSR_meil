// The Upload table and the typed-value check in a real browser (Edge, headless; migration 0077, A60): rows,
// required evidence, merged cells for several files and several bills, page ranges, the draft kept across a reload, a submitted row
// recorded once read, Verify showing a match and a mismatch with its two choices, a phone without sideways
// scrolling, axe. No console or page error. Local stack only.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APP, RUN, WEB, check, env, finish, runWorker, sample, section, setup } from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const puppeteer = require("puppeteer-core");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { pm } = sessions;
await pm.mutate("bundles.clearDraft");

const dir = mkdtempSync(join(tmpdir(), "emeilsg-rows-"));
const fileA = join(dir, `diesel-a-${RUN}.pdf`);
const fileB = join(dir, `diesel-b-${RUN}.pdf`);
writeFileSync(fileA, sample("diesel")); // reads 1250.00 Ltr
writeFileSync(fileB, sample("diesel"));

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
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
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `rows-${name}.png`), fullPage: true });
};
const go = async (page, path) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page) => page.evaluate(() => document.body.innerText);
/** The n-th control whose accessible name ends with `suffix` (": bill type", ": quantity"). */
const nth = (tag, suffix, n) => `
  [...document.querySelectorAll("${tag}[aria-label]")]
    .filter((el) => el.getAttribute("aria-label").toLowerCase().endsWith(${JSON.stringify(suffix.toLowerCase())}))[${n}]`;
/** Chooses an option by its visible text in the n-th select named "...: <suffix>". */
async function choose(page, suffix, optionText, n = 0) {
  return page.evaluate(
    (find, optionText) => {
      const select = eval(find);
      const option =
        select && [...select.options].find((o) => o.text.trim().startsWith(optionText));
      if (!option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    nth("select", suffix, n),
    optionText,
  );
}
async function typeInto(page, suffix, value, n = 0) {
  const handle = await page.evaluateHandle((find) => eval(find) ?? null, nth("input", suffix, n));
  const element = handle.asElement();
  if (!element) return false;
  await element.type(value);
  return true;
}
const groups = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("table tbody")].map((tbody) => ({
      rows: tbody.querySelectorAll("tr").length,
      merged: [...tbody.querySelectorAll("td[rowspan]")].filter(
        (td) => Number(td.getAttribute("rowspan")) > 1,
      ).length,
      pages: tbody.querySelectorAll('input[aria-label$="page from"]').length,
    })),
  );
const clickButton = (page, label) =>
  page.evaluate((label) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent.trim().startsWith(label) && !x.disabled,
    );
    b?.click();
    return !!b;
  }, label);
async function axe(page) {
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    }),
  );
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.nodes[0]?.target?.join(" ")})`);
}

try {
  section("The Upload table");
  const page = await pageAs(pm, { width: 1440, height: 1000 });
  await go(page, "/app/upload");
  await page.evaluate(() => localStorage.removeItem("upload-mode"));
  await go(page, "/app/upload");
  let body = await text(page);
  check(
    "the page opens in Manual mode with a switch to Automatic",
    body.includes("Manual: type each bill") &&
      (await page.$('[role="radiogroup"][aria-label="Upload mode"]')) !== null,
  );
  await clickButton(page, "automatic");
  await wait(300);
  body = await text(page);
  check(
    "Automatic shows the earlier drop-the-bills flow",
    body.includes("Automatic: drop the bills") && !(await page.$("table thead")),
  );
  await clickButton(page, "manual");
  await wait(300);
  body = await text(page);
  check(
    "the submissions are a table with column headers",
    (await page.$$("table thead th")).length >= 7,
  );
  check("the page opens on one submission", (await groups(page)).length === 1);
  check("evidence is marked required", body.includes("Attach (required)"));
  check(
    "the bill type is a dropdown of the person's activities",
    await choose(page, "bill type", "Diesel"),
  );
  await wait(200);
  const unit = await page.evaluate((find) => eval(find)?.value, nth("select", ": unit", 0));
  check("the unit defaults to the activity's own", unit === "L", String(unit));
  check("the value box appears for the chosen type", await typeInto(page, ": quantity", "1250"));
  await clickButton(page, "Submit all");
  await wait(300);
  body = await text(page);
  check(
    "a row without its document is not sent",
    body.includes("every submission needs its document"),
  );

  section("Several files, several bills: merged cells");
  await clickButton(page, "Add another submission");
  await wait(200);
  check("a second submission is added", (await groups(page)).length === 2);
  await choose(page, "bill type", "Diesel", 1);
  await wait(150);
  await typeInto(page, ": quantity", "12500", 1);
  let pickers = await page.$$('input[type="file"]');
  await pickers[1].uploadFile(fileA, fileB);
  await wait(300);
  let g = (await groups(page))[1];
  body = await text(page);
  check(
    "two files on one activity: a line per file, the activity's cells merged down",
    g.rows === 3 && g.merged >= 6 && body.includes("These files are:"),
    JSON.stringify(g),
  );
  await shot(page, "files");
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Remove diesel-b"))
      .at(-1)
      ?.click(),
  );
  await wait(200);
  check("back to one file, one line", (await groups(page))[1].rows === 2);
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Remove diesel-a"))
      .at(-1)
      ?.click(),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.textContent.trim() === "Another bill in this file")[1]
      ?.click(),
  );
  await wait(200);
  g = (await groups(page))[1];
  check(
    "a file with two bills: a line per bill, its evidence merged down, pages on each",
    g.rows === 3 && g.pages === 2 && g.merged === 2,
    JSON.stringify(g),
  );
  await shot(page, "each");
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.getAttribute("aria-label") === "Remove Submission 2, bill 2")
      ?.click(),
  );
  await wait(200);
  check("removing the second bill goes back to one line", (await groups(page))[1].rows === 2);
  await wait(2500); // the draft is saved 1.5 s after the last change
  body = await text(page);
  check("the draft is saved as the person types", /Draft saved/.test(body));
  await shot(page, "table");
  const violations = await axe(page);
  check(
    "axe: no serious or critical issue on the Upload table",
    violations.length === 0,
    violations.join(", "),
  );

  section("The draft survives a reload");
  await go(page, "/app/upload");
  body = await text(page);
  check(
    "the draft is restored, with a note to attach the files again",
    body.includes("Your draft was restored"),
  );
  const restored = await page.evaluate(() =>
    [...document.querySelectorAll('input[inputmode="decimal"]')].map((i) => i.value),
  );
  check(
    "both typed values came back",
    restored.includes("1250") && restored.includes("12500"),
    restored.join(","),
  );

  section("Submitting, reading and recording");
  const fileInputs = await page.$$('input[type="file"]');
  await fileInputs[0].uploadFile(fileA);
  await fileInputs[1].uploadFile(fileB);
  await wait(300);
  check(
    "the evidence sits in the same row as the values",
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label$=": quantity"]');
      const file = document.querySelector('button[aria-label^="Preview diesel-a"]');
      if (!input || !file) return false;
      const a = input.closest("tr");
      return a === file.closest("tr");
    }),
  );
  const openPreview = async () => {
    await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .find((b) => b.getAttribute("aria-label")?.startsWith("Preview "))
        ?.click(),
    );
    for (let i = 0; i < 30 && !(await page.$('[role="dialog"] canvas')); i++) await wait(300);
    const shown = (await page.$('[role="dialog"] canvas')) !== null;
    return shown;
  };
  check("the eye button shows the attached file before it is sent", await openPreview());
  await shot(page, "preview");
  await page.keyboard.press("Escape");
  await wait(300);
  await clickButton(page, "Submit all");
  const sentRows = async () =>
    ((await text(page)).match(/Reading the document|Recorded\./g) ?? []).length;
  for (let i = 0; i < 60 && (await sentRows()) < 2; i++) await wait(500);
  check("both rows are sent and wait for the reading", (await sentRows()) === 2);
  await runWorker(); // the uploads
  for (let i = 0; i < 40 && !((await text(page)).match(/Recorded\./g)?.length === 2); i++) {
    await wait(1500);
    if (i === 6) await runWorker(); // the bills they became
  }
  await runWorker();
  body = await text(page);
  check(
    "each row says Recorded once its bill pairs with what was typed",
    body.match(/Recorded\./g)?.length === 2,
  );
  await shot(page, "recorded");
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/app/verify/"]')].map((a) => a.getAttribute("href")),
  );
  check("each recorded row links to Verify", links.length === 2, links.join(","));
  check(
    "the draft is gone once everything is sent",
    (await pm.query("bundles.draft")).data === null,
  );
  check("and the uploaded bill after it is recorded", await openPreview());
  await page.keyboard.press("Escape");
  await wait(300);

  section("Verify: a match and a mismatch");
  const verify = await pageAs(pm, { width: 1440, height: 1000 });
  await go(verify, links[0]);
  body = await text(verify);
  check("the matching row says so", body.includes("Matches what you typed at upload"));
  check(
    "Verify lets the person move the record to another month before confirming",
    await verify.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find(
        (l) => l.textContent.trim() === "Reporting period",
      );
      const select = label && document.getElementById(label.htmlFor);
      const move = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === "Move",
      );
      return !!select && select.options.length > 1 && !!move;
    }),
  );
  // Move the matching bill to another month: the picker must then show that month.
  const target = await verify.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find(
      (l) => l.textContent.trim() === "Reporting period",
    );
    const select = document.getElementById(label.htmlFor);
    const other = [...select.options].find((o) => o.value !== select.value);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(select, other.value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { id: other.value, label: other.text.replace(" (late submission)", "") };
  });
  await clickButton(verify, "Move");
  for (let i = 0; i < 30; i++) {
    await wait(400);
    const shown = await verify.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find(
        (l) => l.textContent.trim() === "Reporting period",
      );
      return document.getElementById(label?.htmlFor)?.value;
    });
    if (shown === target.id) break;
  }
  check(
    "after Move the picker shows the new month",
    (await verify.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find(
        (l) => l.textContent.trim() === "Reporting period",
      );
      return document.getElementById(label?.htmlFor)?.value;
    })) === target.id,
    target.label,
  );
  await go(verify, links[1]);
  body = await text(verify);
  check(
    "the mismatching row names both values",
    /You typed\s*12500\s*L at upload; the document reads\s*1250/.test(body),
    body.match(/You typed[^\n]*/)?.[0],
  );
  const confirmDisabled = () =>
    verify.evaluate(
      () =>
        [...document.querySelectorAll("button")].find((b) =>
          b.textContent.trim().startsWith("Confirm"),
        )?.disabled,
    );
  check("Confirm waits for a choice", (await confirmDisabled()) === true);
  await clickButton(verify, "Use the document");
  await wait(300);
  check("choosing the document's value is enough to confirm", (await confirmDisabled()) === false);
  await clickButton(verify, "Keep my value");
  await wait(300);
  body = await text(verify);
  check("keeping the typed value says it goes to a reviewer", body.includes("goes to a reviewer"));
  await shot(verify, "verify-mismatch");

  section("Phone");
  const phone = await pageAs(pm, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await go(phone, "/app/upload");
  await choose(phone, "bill type", "Diesel");
  await wait(200);
  check(
    "no sideways scrolling on a phone",
    !(await phone.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )),
  );
  await shot(phone, "phone");
  await pm.mutate("bundles.clearDraft");

  section("No errors");
  check("no console or page error", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
await finish();
