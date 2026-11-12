// Phase 3 screens in a real browser (Edge, headless): on Verify Extraction the values' boxes are drawn on the
// document, picking a value selects its box and picking a box selects its value, the Excel download is
// offered; Submission Monitoring has the OCR column and filter. No console or page error anywhere.
// Screenshots go to E2E_SCREENSHOTS when set. Local stack only; run with E2E_WORKER_IMAGE (rules-14).
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  APP,
  RUN,
  WEB,
  check,
  env,
  finish,
  runWorker,
  sample,
  section,
  setup,
  upload,
} from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;

const bill = await upload(
  pm,
  sample("electricity", {
    reference: `UI3-${RUN}`.toUpperCase(),
    period: "01-Sep-2026 to 30-Sep-2026",
  }),
  `ui3-bill-${RUN}.pdf`,
  { metric: "GRID_ELECTRICITY" },
);
await runWorker();

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
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
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase3-${name}.png`) });
};

section("Verify Extraction: values and their boxes on the document");
const page = await pageAs(pm);
await page.goto(`${APP}/app/verify/${bill.documentId}`, { waitUntil: "networkidle0" });
await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Where "]').length > 0, {
  timeout: 30_000,
});
const boxes = await page.evaluate(() => document.querySelectorAll('[aria-label^="Where "]').length);
check("each value read is boxed on the document", boxes >= 3, `${boxes} boxes`);
check(
  "the Excel download is offered",
  await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Download as Excel"),
    ),
  ),
);
// Pick a value: its row is marked and its box is the selected one.
await page.evaluate(() => {
  const row = document.querySelector('[data-field-key="consumption"]');
  row?.querySelector("button")?.focus();
});
await page.waitForFunction(
  () =>
    document.querySelector('[data-field-key="consumption"]')?.getAttribute("data-selected") ===
      "true" &&
    [...document.querySelectorAll('[aria-label="Where Consumption was read"]')].some((b) =>
      b.className.includes("border-primary"),
    ),
  { timeout: 10_000 },
);
check("picking a value selects its box on the document", true);
await shot(page, "verify-selected");
// Pick a box: its value is selected.
await page.evaluate(() =>
  document.querySelector('[aria-label="Where Billing period was read"]')?.click(),
);
await page.waitForFunction(
  () =>
    document.querySelector('[data-field-key="billing_period"]')?.getAttribute("data-selected") ===
    "true",
  { timeout: 10_000 },
);
check("picking a box selects its value", true);

section("Submission Monitoring: the OCR column and filter");
const adminPage = await pageAs(admin);
await adminPage.goto(`${APP}/admin/submissions`, { waitUntil: "networkidle0" });
await adminPage.waitForFunction(() => document.querySelector("#f-ocr"), { timeout: 20_000 });
const headings = await adminPage.evaluate(() =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim()),
);
check("the table has an OCR column", headings.includes("OCR"));
const ocrOptions = await adminPage.evaluate(() =>
  [...document.querySelectorAll("#f-ocr option")].map((o) => o.textContent),
);
check(
  "the OCR filter offers every state",
  ["Reading", "Read", "Needs attention", "Failed", "Manual entry"].every((l) =>
    ocrOptions.includes(l),
  ),
);
check(
  "OCR Monitoring is no longer in the menu",
  !(await adminPage.evaluate(() =>
    [...document.querySelectorAll("nav a")].some((a) => a.textContent?.includes("OCR Monitoring")),
  )),
);
await shot(adminPage, "submissions");

check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
await browser.close();
await finish();
