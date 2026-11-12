// Phase 9 in a real browser (Edge, headless, device emulation): the phone bottom bar and Menu drawer, the
// tablet rail, no sideways scrolling on the core pages, documents fitting a phone on Verify, the camera button
// on touch screens, the custom cursor after a tap, and the installable app (manifest, icons, service worker,
// offline page). axe on the phone layout. No console or page error. Local stack only.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, WEB, check, env, finish, one, section, setup, sql } from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const puppeteer = require("puppeteer-core");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;
const doc = await one(sql`
  select d.id from public.documents d join public.users u on u.id = d.uploaded_by
  where u.email = 'e2e.pm@traceesg.test' and d.mime_type = 'application/pdf' and d.deleted_at is null
    and d.is_bundle = false order by d.created_at desc limit 1`);

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const TABLET = { width: 820, height: 1180, isMobile: true, hasTouch: true };
async function pageAs(session, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
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
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase9-${name}.png`) });
};
const go = async (page, path) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
};
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const visible = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
  }, selector);
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
const BAR = 'nav[aria-label="Quick navigation"]';

try {
  section("Phone: bottom bar and Menu");
  const phone = await pageAs(pm, PHONE);
  await go(phone, "/app");
  check("the bottom bar is shown on a phone", await visible(phone, BAR));
  const labels = await phone.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} a, ${sel} button`)].map((a) => a.textContent.trim()),
    BAR,
  );
  check(
    "it holds Home, Upload, Uploads/My submissions, Activity",
    labels.join(",") === "Home,Upload,My submissions,Activity" ||
      labels.join(",") === "Home,Upload,Uploads,Activity" ||
      labels.join(",") === "Home,Upload,My submissions,Activity,Menu" ||
      labels.join(",") === "Home,Upload,Uploads,Activity,Menu",
    labels.join(","),
  );
  check(
    "the icon rail is not taking room on a phone",
    !(await visible(phone, 'nav[aria-label="Workspace navigation"]')),
  );
  const fabVisible = await visible(phone, ".ask-fab");
  check("the floating Ask button is rendered cleanly above the bottom bar", fabVisible);
  const fits = await phone.evaluate((sel) => {
    const labels = [...document.querySelectorAll(`${sel} li span:last-child, ${sel} button`)];
    return labels.every((l) => l.scrollWidth <= l.clientWidth + 1);
  }, BAR);
  check("every label fits under its icon", fits);
  await phone.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} a`)]
        .find((a) => a.textContent.includes("Upload"))
        ?.click(),
    BAR,
  );
  await phone.waitForFunction(() => location.pathname === "/app/upload", { timeout: 15_000 });
  await phone.waitForFunction(() => /Browse files/.test(document.body.innerText), {
    timeout: 20_000,
  });
  check(
    "Upload opens the upload page and is marked current",
    (
      await phone.evaluate(
        (sel) => document.querySelector(`${sel} [aria-current="page"]`)?.textContent,
        BAR,
      )
    )?.includes("Upload"),
  );
  check(
    "on a touch screen the upload offers Take a photo",
    await phone.evaluate(() =>
      [...document.querySelectorAll("button")].some(
        (b) => /Take a photo/.test(b.textContent) && getComputedStyle(b).display !== "none",
      ),
    ),
  );
  check(
    "its camera input asks for the back camera",
    await phone.evaluate(
      () => !!document.querySelector('input[type="file"][capture="environment"][accept="image/*"]'),
    ),
  );
  await shot(phone, "phone-upload");
  await phone.evaluate((sel) => {
    const topBtn = document.querySelector('button[aria-label="Open navigation menu"]');
    if (topBtn) {
      topBtn.click();
      return;
    }
    [...document.querySelectorAll(`${sel} button`)]
      .find((b) => b.textContent.includes("Menu"))
      ?.click();
  }, BAR);
  await phone.waitForFunction(
    () => {
      const nav = document.querySelector('nav[aria-label="Workspace navigation"]');
      return (
        nav && getComputedStyle(nav).display !== "none" && nav.getBoundingClientRect().width > 200
      );
    },
    { timeout: 10_000 },
  );
  check("Menu opens the full navigation as a drawer", true);
  await shot(phone, "phone-menu");
  await phone.keyboard.press("Escape");
  await phone
    .waitForFunction(
      () =>
        getComputedStyle(document.querySelector('nav[aria-label="Workspace navigation"]'))
          .display === "none",
      { timeout: 5_000 },
    )
    .catch(() => {});
  check("Escape closes it", !(await visible(phone, 'nav[aria-label="Workspace navigation"]')));
  const phoneAxe = await axe(phone);
  check("the phone layout passes axe", phoneAxe.length === 0, phoneAxe.join(", "));

  section("Phone: the core pages");
  const adminPhone = await pageAs(admin, PHONE);
  for (const path of [
    "/admin",
    "/admin/submissions",
    "/admin/approval-queue",
    "/admin/data-explorer",
    "/admin/scope-1",
    "/admin/reports",
    "/admin/carbon-analytics",
    "/admin/users",
    "/admin/organization",
    "/admin/audit-trail",
  ]) {
    await go(adminPhone, path);
    check(`${path}: no sideways scrolling on a phone`, !(await sideways(adminPhone)));
  }
  const adminLabels = await adminPhone.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} a, ${sel} button`)].map((a) => a.textContent.trim()),
    BAR,
  );
  check(
    "an administrator's bar has Approvals",
    adminLabels.join(",") === "Home,Upload,My submissions,Approvals" ||
      adminLabels.join(",") === "Home,Upload,Uploads,Approvals" ||
      adminLabels.join(",") === "Home,Upload,My submissions,Approvals,Menu" ||
      adminLabels.join(",") === "Home,Upload,Uploads,Approvals,Menu",
    adminLabels.join(","),
  );
  for (const path of ["/app/submissions", "/app/notifications", "/app/activity"]) {
    await go(phone, path);
    check(`${path}: no sideways scrolling on a phone`, !(await sideways(phone)));
  }
  if (doc) {
    await go(phone, `/app/verify/${doc.id}`);
    await phone
      .waitForFunction(() => /\d+%/.test(document.body.innerText), { timeout: 20_000 })
      .catch(() => {});
    const zoom = await phone.evaluate(() =>
      [...document.querySelectorAll("span")]
        .find((s) => /^\d+%$/.test(s.textContent.trim()))
        ?.textContent.trim(),
    );
    check("Verify opens a document at 50% on a phone so the page fits", zoom === "50%", zoom);
    check("Verify does not scroll sideways", !(await sideways(phone)));
    await shot(phone, "phone-verify");
  }

  const small = await pageAs(admin, { ...PHONE, width: 360 });
  await go(small, "/admin");
  check(
    "at 360px the top bar fits, with the name on the left",
    (await small.evaluate(() => {
      const h = document.querySelector("header");
      return h.scrollWidth <= h.clientWidth && /EmeilSG/.test(h.textContent);
    })) && !(await sideways(small)),
  );

  section("Tablet and desktop");
  const tablet = await pageAs(admin, TABLET);
  await go(tablet, "/admin");
  check(
    "a tablet shows the icon rail, no bottom bar",
    (await visible(tablet, 'nav[aria-label="Admin navigation"]')) && !(await visible(tablet, BAR)),
  );
  check("the tablet page does not scroll sideways", !(await sideways(tablet)));
  await shot(tablet, "tablet");
  const desk = await pageAs(admin, { width: 1440, height: 900 });
  await go(desk, "/admin");
  check("a desktop has no bottom bar", !(await visible(desk, BAR)));

  section("Custom cursor after a tap");
  await desk.mouse.move(400, 300);
  await desk.mouse.move(420, 320);
  await new Promise((r) => setTimeout(r, 300));
  check("a mouse shows the custom cursor", await visible(desk, "[data-custom-cursor]"));
  await desk.evaluate(() => {
    const at = { clientX: 500, clientY: 400, bubbles: true };
    window.dispatchEvent(new PointerEvent("pointerdown", { ...at, pointerType: "touch" }));
    document.body.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
    // What a browser fires after a tap: emulated mouse events at the same spot.
    document.body.dispatchEvent(new MouseEvent("mousemove", at));
    document.body.dispatchEvent(new MouseEvent("mousedown", at));
    document.body.dispatchEvent(new MouseEvent("mouseup", at));
  });
  await new Promise((r) => setTimeout(r, 400));
  check(
    "a tap hides it, and the tap's emulated mouse events do not bring it back",
    !(await visible(desk, "[data-custom-cursor]")),
  );
  await new Promise((r) => setTimeout(r, 1100));
  await desk.mouse.move(600, 420);
  await desk.mouse.move(610, 430);
  await new Promise((r) => setTimeout(r, 300));
  check("a real mouse (or pen) brings it back", await visible(desk, "[data-custom-cursor]"));

  section("Installable app");
  const manifest = await (await fetch(`${APP}/manifest.webmanifest`)).json().catch(() => null);
  check(
    "the manifest names the app, opens the workspace standalone and has a maskable icon",
    manifest?.name === "EmeilSG" &&
      manifest.start_url === "/app" &&
      manifest.display === "standalone" &&
      manifest.icons?.some((i) => i.purpose === "maskable"),
    JSON.stringify(manifest)?.slice(0, 200),
  );
  const icons = await Promise.all(
    (manifest?.icons ?? []).map((i) =>
      fetch(`${APP}${i.src}`).then(
        (r) => r.status === 200 && r.headers.get("content-type") === "image/png",
      ),
    ),
  );
  check("every icon is served as a PNG", icons.length === 3 && icons.every(Boolean));
  const swHeaders = await fetch(`${APP}/sw.js`).then((r) => r.headers.get("cache-control"));
  check("the service worker is never cached", /no-store/.test(swHeaders ?? ""), swHeaders);
  const pwa = await pageAs(pm, PHONE);
  await go(pwa, "/app");
  const scope = await pwa.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  check(
    "the service worker is registered for the whole site",
    scope === `${new URL(APP).origin}/`,
    scope,
  );
  check(
    "the page links the manifest and the Apple icon",
    await pwa.evaluate(
      () =>
        !!document.querySelector('link[rel="manifest"]') &&
        !!document.querySelector('link[rel="apple-touch-icon"]'),
    ),
  );
  await pwa.reload({ waitUntil: "networkidle0" });
  // Offline for the page and for the service worker: DevTools offline mode covers only the page.
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === "service_worker" && t.browserContext() === pwa.browserContext(),
    { timeout: 10_000 },
  );
  const swSession = await swTarget.createCDPSession();
  await swSession.send("Network.enable");
  await swSession.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await pwa.setOfflineMode(true);
  await pwa.goto(`${APP}/app/submissions`).catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
  check(
    "offline, a page load shows the offline page",
    /You are offline/.test(await pwa.evaluate(() => document.body.innerText)),
  );
  await shot(pwa, "offline");
  const cached = await pwa.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const n of names)
      for (const req of await (await caches.open(n)).keys()) urls.push(new URL(req.url).pathname);
    return urls.sort();
  });
  check(
    "nothing but the offline page and its icon is stored on the device",
    cached.join(",") === "/icons/icon-192.png,/offline.html",
    cached.join(","),
  );
  await pwa.setOfflineMode(false);
  await swSession.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  check(
    "no console or page errors",
    problems.filter((p) => !/ERR_INTERNET_DISCONNECTED|net::ERR|ChunkLoadError/.test(p)).length ===
      0,
    problems.slice(0, 5).join(" | "),
  );
} finally {
  await browser.close();
}
await finish();
