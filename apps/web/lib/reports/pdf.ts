import "server-only";

// HTML → PDF with headless Chromium (TRD §17: puppeteer-core + @sparticuz/chromium). In production the
// browser comes from @sparticuz/chromium; locally CHROMIUM_EXECUTABLE_PATH names an installed Chromium-family
// browser. JavaScript is disabled and the page has no network to reach: the HTML is self-contained.
export async function renderPdf(html: string): Promise<Uint8Array> {
  const puppeteer = await import("puppeteer-core");
  const local = process.env.CHROMIUM_EXECUTABLE_PATH;
  const chromium = local ? null : (await import("@sparticuz/chromium")).default;
  // @sparticuz/chromium is a headless-shell build: it must be launched with headless "shell" and the
  // package's own arguments on top of puppeteer's defaults ("true" asks for the new headless mode, which
  // that binary does not have, so the launch fails on the host). A local Edge/Chrome uses the new mode.
  const browser = await puppeteer.launch(
    chromium
      ? {
          executablePath: await chromium.executablePath(),
          args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
          headless: "shell",
        }
      : {
          executablePath: local,
          args: ["--no-sandbox", "--disable-gpu"],
          headless: true,
        },
  );
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      request.url().startsWith("data:") ? request.continue() : request.abort(),
    );
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
