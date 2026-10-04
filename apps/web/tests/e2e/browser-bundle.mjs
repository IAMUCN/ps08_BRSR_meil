// Browser check for multi-bill PDFs (Edge via puppeteer-core): the real upload form, the "reading" state,
// the review screen and Confirm. Run with the app on E2E_APP_URL and CHROMIUM_EXECUTABLE_PATH set:
//   node tests/e2e/browser-bundle.mjs   (screenshots go to E2E_SHOTS, default the OS temp folder)
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { APP, RUN, check, env, finish, runWorker, sampleBundle, section, setup } from "./lib.mjs";

const shots = process.env.E2E_SHOTS ?? mkdtempSync(join(tmpdir(), "traceesg-shots-"));
const exe = process.env.CHROMIUM_EXECUTABLE_PATH ?? env.CHROMIUM_EXECUTABLE_PATH;
if (!exe) throw new Error("set CHROMIUM_EXECUTABLE_PATH to Edge or Chrome");

const { credentials } = await setup();
const bundleFile = join(mkdtempSync(join(tmpdir(), "traceesg-bundle-")), `browser-${RUN}.pdf`);
// E2E_BUNDLE_FILE: a ready-made PDF (electricity, diesel, water) when generating one is not possible.
writeFileSync(
  bundleFile,
  process.env.E2E_BUNDLE_FILE
    ? readFileSync(process.env.E2E_BUNDLE_FILE)
    : sampleBundle(["electricity", "diesel", "water"]),
);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const text = () => page.evaluate(() => document.body.innerText);
  const waitText = (needle, timeout = 60_000) =>
    page.waitForFunction((n) => document.body.innerText.includes(n), { timeout }, needle);
  const buttonWith = (label) =>
    page.evaluateHandle(
      (l) => [...document.querySelectorAll("button")].find((b) => b.innerText.includes(l)),
      label,
    );

  section("Sign in as the Project Manager");
  await page.goto(`${APP}/login`);
  await page.type('input[name="email"]', credentials.pm.email);
  await page.type('input[name="password"]', credentials.pm.password);
  await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')]);
  check("the PM lands in the app", page.url().includes("/app"), page.url());

  section("The upload form offers a PDF with several bills");
  await page.goto(`${APP}/app/upload`);
  await waitText("What are you uploading?");
  check("two choices are shown", (await text()).includes("A PDF with several bills"));
  check("ESG activity is asked for a single bill", (await text()).includes("ESG activity"));
  await page.click('input[name="upload-mode"][value="bundle"]');
  check(
    "choosing several bills hides the activity picker",
    !(await text()).includes("ESG activity"),
  );
  const accept = await page.evaluate(() => document.querySelector('input[type="file"]').accept);
  check("only PDF files are offered", accept === "application/pdf", accept);
  await (await page.$('input[type="file"]')).uploadFile(bundleFile);
  await page.screenshot({ path: join(shots, "1-upload.png") });
  const uploadButton = await buttonWith("Upload PDF");
  await uploadButton.click();
  // The same file again (a repeated run) asks for acknowledgement first: say so, then carry on.
  await page.waitForFunction(
    () =>
      location.pathname.startsWith("/app/upload/split/") ||
      document.body.innerText.includes("Possible duplicate"),
    { timeout: 90_000 },
  );
  if (!page.url().includes("/app/upload/split/")) {
    check("an identical file is warned about", true);
    await Promise.all([
      page.waitForNavigation({ timeout: 90_000 }),
      (await buttonWith("Upload anyway")).click(),
    ]);
  }
  const splitUrl = page.url();
  check("upload goes to the split page", splitUrl.includes("/app/upload/split/"), splitUrl);
  await waitText("Reading your PDF");
  check("it says the PDF is being read", true);
  await page.screenshot({ path: join(shots, "2-reading.png") });

  section("After the OCR, the review screen proposes the split");
  await runWorker();
  await page.reload();
  await waitText("Check how your PDF is split");
  const review = await text();
  check(
    "three bills are listed",
    ["Bill 1", "Bill 2", "Bill 3"].every((b) => review.includes(b)),
  );
  check(
    "each shows what it looks like",
    review.includes("Looks like: Electricity Bill") &&
      review.includes("Looks like: Diesel Invoice") &&
      review.includes("Looks like: Water Bill"),
  );
  check(
    "the water bill says it is not the PM's to record",
    review.includes("your role can't record"),
  );
  check("the button counts the bills to be recorded", review.includes("Record 2 bills"));
  await page.screenshot({ path: join(shots, "3-review.png"), fullPage: true });

  section("Editing the split is checked as you type");
  const numbers = await page.$$('input[type="number"]');
  const retype = async (input, value) => {
    await input.evaluate((el) => el.select());
    await input.type(value);
  };
  await retype(numbers[2], "1"); // bill 2's "From page"
  await waitText("both include page 1");
  check("overlapping pages are reported at once", true);
  const blocked = await (await buttonWith("Record 2")).evaluate((b) => b.disabled);
  check("Record is disabled while the split is invalid", blocked === true);
  await retype(numbers[2], "2");
  await page.waitForFunction(() => !document.body.innerText.includes("both include page"));

  section("Confirm records the two bills");
  await (await buttonWith("Record 2")).click();
  await page.waitForFunction(
    () =>
      location.pathname.startsWith("/app/submissions") ||
      document.body.innerText.includes("Possible duplicates"),
    { timeout: 60_000 },
  );
  if (!page.url().includes("/app/submissions")) {
    check("existing records for the same activity are warned about", true);
    await (await buttonWith("Record anyway")).click();
    await page.waitForFunction(() => location.pathname.startsWith("/app/submissions"), {
      timeout: 60_000,
    });
  }
  check("the PM is taken to My Submissions", page.url().includes("/app/submissions"), page.url());
  await waitText("Processing");
  await page.screenshot({ path: join(shots, "4-submissions.png"), fullPage: true });

  section("Opening the split page again shows what was recorded");
  await page.goto(splitUrl);
  await waitText("Bills recorded");
  const done = await text();
  check("it lists the two recorded bills", done.includes("Diesel") && done.includes("Grid"));
  await page.screenshot({ path: join(shots, "5-done.png") });
} finally {
  await browser.close();
}
console.log(`screenshots: ${shots}`);
await finish();
