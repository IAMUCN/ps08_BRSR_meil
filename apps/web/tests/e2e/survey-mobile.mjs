// A look at the core pages on a phone and a tablet (feature_enhancement.md 9.1): screenshots, sideways scroll,
// elements wider than the screen and the top bar's fit. Not part of the suite; run by hand while working on
// the responsive layout. Local stack only.
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, WEB, env, one, setup, sql } from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const doc = await one(sql`
  select d.id from public.documents d join public.users u on u.id = d.uploaded_by
  where u.email = 'e2e.pm@traceesg.test' and d.deleted_at is null order by d.created_at desc limit 1`);
const ROUTES = {
  admin: [
    "/admin",
    "/app/upload",
    "/admin/submissions",
    "/admin/approval-queue",
    "/admin/data-explorer",
    "/admin/scope-1",
    "/admin/reports",
    "/admin/carbon-analytics",
    "/admin/users",
    "/admin/organization",
    "/admin/conversion-factors",
    "/admin/audit-trail",
  ],
  pm: [
    "/app",
    "/app/upload",
    "/app/submissions",
    `/app/verify/${doc?.id}`,
    "/app/notifications",
    "/app/activity",
  ],
};
const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
for (const [who, routes] of Object.entries(ROUTES)) {
  for (const width of [390, 820]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 844, isMobile: width < 768, hasTouch: true });
    await context.setCookie(
      ...[...sessions[who].jar].map(([name, value]) => ({
        name,
        value,
        domain: new URL(APP).hostname,
        path: "/",
      })),
    );
    for (const route of routes) {
      await page.goto(`${APP}${route}`, { waitUntil: "networkidle0" }).catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= vw + 1) return false;
            // Inside a box that scrolls sideways on purpose (tables) is fine.
            for (let p = el.parentElement; p; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX;
              if (o === "auto" || o === "scroll" || o === "hidden") return false;
            }
            return true;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`);
        const header = document.querySelector("header");
        return {
          sideways: document.documentElement.scrollWidth > vw,
          wide,
          headerOverflow: header ? header.scrollWidth > header.clientWidth : false,
          bottomBar:
            !!document.querySelector('nav[aria-label="Quick navigation"]') &&
            getComputedStyle(document.querySelector('nav[aria-label="Quick navigation"]'))
              .display !== "none",
        };
      });
      const name = `${who}-${width}-${route.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}`;
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
      console.log(name, JSON.stringify(m));
    }
    await context.close();
  }
}
await browser.close();
await sql.end();
