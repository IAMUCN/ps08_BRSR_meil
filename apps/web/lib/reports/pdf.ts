import "server-only";

// HTML → PDF with headless Chromium (TRD §17: puppeteer-core + @sparticuz/chromium). In production the
// browser comes from @sparticuz/chromium; locally CHROMIUM_EXECUTABLE_PATH names an installed Chromium-family
// browser. JavaScript is disabled and the page has no network to reach: the HTML is self-contained.

/** The whole render may take this long; a browser that hangs on the host must fail the run, not hold it. */
const RENDER_LIMIT_MS = 100_000;

export async function renderPdf(html: string): Promise<Uint8Array> {
  const started = Date.now();
  const step = (name: string) => console.info(`report pdf: ${name} (+${Date.now() - started} ms)`);
  let browser: import("puppeteer-core").Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const work = (async () => {
    const puppeteer = await import("puppeteer-core");
    const local = process.env.CHROMIUM_EXECUTABLE_PATH;
    const chromium = local ? null : (await import("@sparticuz/chromium")).default;
    if (chromium) chromium.setGraphicsMode = false;
    step(local ? "using the local browser" : "unpacking the bundled browser");
    // @sparticuz/chromium is a headless-shell build: it must be launched with headless "shell" and the
    // package's own arguments on top of puppeteer's defaults ("true" asks for the new headless mode, which
    // that binary does not have, so the launch fails on the host). A local Edge/Chrome uses the new mode.
    const executablePath = local ?? (await chromium!.executablePath());
    step("launching the browser");
    browser = await puppeteer.launch(
      chromium
        ? {
            executablePath,
            args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
            headless: "shell",
          }
        : { executablePath, args: ["--no-sandbox", "--disable-gpu"], headless: true },
    );
    step("browser started");
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      request.url().startsWith("data:") ? request.continue() : request.abort(),
    );
    step("page ready");
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    step("content loaded");
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    step("pdf printed");
    return pdf;
  })();

  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`the PDF render did not finish within ${RENDER_LIMIT_MS / 1000} s`)),
      RENDER_LIMIT_MS,
    );
  });

  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
    work.catch(() => undefined);
    // Do not wait on a browser that is stuck: closing is best effort, and the process is killed if it hangs.
    const open = browser;
    if (open) {
      void Promise.race([open.close(), new Promise((r) => setTimeout(r, 5_000))])
        .catch(() => undefined)
        .finally(() => {
          const proc = open.process();
          if (proc && proc.exitCode === null) proc.kill("SIGKILL");
        });
    }
  }
}
