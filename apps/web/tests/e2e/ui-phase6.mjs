// Phase 6 screens in a real browser (Edge, headless): Conversion Factors (yearly review, a draft waiting, the
// source column, the Add factor form's source and fetch controls) and the carbon-credit links on Carbon
// Markets, at desktop and phone widths. No console or page error. Local stack only.
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, RUN, WEB, check, env, finish, ok, one, section, setup, sql } from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin } = sessions;

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
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase6-${name}.png`), fullPage: true });
};
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, path, waitFor) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: 20_000 },
    waitFor,
  );
};
const clickButton = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === l);
    b?.click();
    return !!b;
  }, label);
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

// A draft waiting for approval, made through the procedure and withdrawn at the end.
const diesel = await one(
  sql`select id from public.conversion_factors where activity_type = 'DIESEL_CONSUMPTION'`,
);
const draft = await admin.mutate("factors.addVersion", {
  factorId: diesel.id,
  value: 77,
  inputUnit: "L",
  outputUnit: "kgCO2e",
  sourceReference: `UI draft ${RUN}`,
  sourceUrl: "https://ipcc-nggip.iges.or.jp/public/2006gl/",
  sourcePublisher: "IPCC NGGIP",
  financialYear: "2090-91",
  effectiveFrom: "2090-04-01",
});
if (!ok(draft)) throw new Error(`could not add the draft: ${draft.error}`);

try {
  section("Conversion Factors");
  const sa = await pageAs(admin);
  await go(sa, "/admin/conversion-factors", "Yearly review");
  const t = await text(sa);
  check(
    "the yearly review is shown with its counts",
    /with no value/.test(t) && /entered for this year/.test(t),
  );
  check(
    "it explains there is no official service for factors",
    /No official service publishes these factors/.test(t),
  );
  check("the draft is announced as waiting for approval", /waiting for approval/i.test(t));
  check(
    "the yearly review's list is folded, so the factor table stays near the top",
    await sa.evaluate(
      () =>
        document.querySelector('section[aria-labelledby="factor-review-heading"] details')?.open ===
        false,
    ),
  );
  await sa.evaluate(() => {
    document.querySelector('section[aria-labelledby="factor-review-heading"] summary')?.click();
  });
  check(
    "unfolded, it offers to add a value for an activity with none",
    await sa.evaluate(() =>
      [...document.querySelectorAll("button")].some((b) =>
        /^Add value for FY/.test(b.textContent?.trim() ?? ""),
      ),
    ),
  );
  await sa.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find(
        (b) =>
          b.closest("li")?.textContent?.includes("PURCHASED_STEAM") &&
          /^Add value/.test(b.textContent ?? ""),
      )
      ?.click();
  });
  await sa.waitForSelector("#factor-activity", { timeout: 10_000 });
  check(
    "Add value opens Add factor with that activity chosen",
    (await sa.evaluate(() => document.querySelector("#factor-activity").value)) ===
      "PURCHASED_STEAM",
  );
  await sa.keyboard.press("Escape");
  await sa.waitForFunction(() => !document.querySelector("#factor-activity"), { timeout: 10_000 });
  await sa.evaluate(() =>
    [...document.querySelectorAll("button[aria-expanded]")]
      .find((b) => b.textContent?.includes("Diesel"))
      ?.click(),
  );
  await sa.waitForFunction(() => document.body.innerText.includes("Approval"), { timeout: 10_000 });
  const expanded = await text(sa);
  check(
    "the version history shows the source with its site and an official-source mark",
    /Official source/i.test(expanded) && /ipcc-nggip\.iges\.or\.jp/.test(expanded),
  );
  check(
    "the draft has Approve and Withdraw",
    await sa.evaluate(() =>
      ["Approve", "Withdraw"].every((l) =>
        [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === l),
      ),
    ),
  );
  sa.once("dialog", (d) => d.accept(""));
  await clickButton(sa, "Approve");
  const twoSupers =
    (
      await one(sql`
        select count(distinct a.user_id)::int as n from public.user_org_assignments a
        join public.roles r on r.id = a.role_id and r.code = 'admin' where a.revoked_at is null`)
    ).n > 1;
  if (twoSupers) {
    await sa.waitForFunction(
      () => document.body.innerText.includes("another Super Admin must approve"),
      { timeout: 10_000 },
    );
    check("approving their own draft is refused with the reason, in the page", true);
  }
  await shot(sa, "factors");

  await clickButton(sa, "Add factor");
  await sa.waitForSelector("#factor-source-url", { timeout: 10_000 });
  await sa.type("#factor-source-url", "https://example.org/factors.pdf");
  const outsideState = await sa.evaluate(() => ({
    disabled: [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Fetch values",
    )?.disabled,
    note: document.body.innerText.includes("Not on the list of official sources"),
  }));
  check(
    "a link off the official list cannot be fetched, and the form says so",
    outsideState.disabled && outsideState.note,
  );
  await sa.evaluate(() => {
    const input = document.querySelector("#factor-source-url");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sa.type("#factor-source-url", "https://cea.nic.in/baseline.pdf");
  check(
    "an official link can be fetched",
    await sa.evaluate(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === "Fetch values",
        )?.disabled === false,
    ),
  );
  await sa.select("#factor-fy", "2026-27");
  check(
    "choosing a financial year fills its dates",
    (await sa.evaluate(() =>
      [
        document.querySelector("#factor-from").value,
        document.querySelector("#factor-to").value,
      ].join(" "),
    )) === "2026-04-01 2027-03-31",
  );
  await shot(sa, "add-factor");
  await sa.keyboard.press("Escape");

  section("Carbon Markets");
  await go(sa, "/admin/carbon-credits", "Where to explore or buy carbon credits");
  const c = await text(sa);
  check(
    "the links section and its disclaimer are shown",
    /does not sell, certify or guarantee/.test(c),
  );
  check(
    "each link names its site and opens in a new tab",
    await sa.evaluate(() => {
      const links = [
        ...document.querySelectorAll('section[aria-labelledby="credit-links-heading"] a'),
      ];
      return (
        links.length >= 6 && links.every((a) => a.target === "_blank" && a.rel.includes("noopener"))
      );
    }),
  );
  check(
    "Check addresses and Add link are offered to the Super Admin",
    /Check addresses/.test(c) && /Add link/.test(c),
  );
  await shot(sa, "carbon-links");

  section("Phone width");
  const phone = await pageAs(admin, 390);
  await go(phone, "/admin/conversion-factors", "Yearly review");
  check("Conversion Factors does not scroll sideways at 390px", !(await sideways(phone)));
  await shot(phone, "factors-phone");
  await go(phone, "/admin/carbon-credits", "Where to explore or buy carbon credits");
  check("Carbon Markets does not scroll sideways at 390px", !(await sideways(phone)));
  await shot(phone, "carbon-phone");

  check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await admin.mutate("factors.reject", {
    versionId: draft.data.versionId,
    reason: "UI check draft withdrawn",
  });
  await browser.close();
}
await finish();
