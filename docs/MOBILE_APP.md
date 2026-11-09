# EmeilSG on phones and tablets

feature_enhancement.md Phase 9 (requirements 3, 8 and 14). Owner's decision, 2026-11-09: make EmeilSG an
**installable web app** now, and package a store app with Capacitor later, after feature freeze. This file
says what works today, what does not, and how a store app would be built.

## 1. What works today (the installable web app)

| Area | How it works | Checked |
|---|---|---|
| Install | `app/manifest.ts` (name, icons 192/512 and a maskable 512, theme colour, opens on `/app` in its own window, shortcuts to Upload and My uploads). Chrome and Edge on Android offer "Install app"; Safari on iOS uses Share → Add to Home Screen (`apple-touch-icon`, `appleWebApp`). | Manifest, icons and service worker in Edge's mobile emulation (`tests/e2e/ui-phase9.mjs`) |
| Navigation | Below 768px: a bottom bar (Home, Upload, Uploads, Approvals or Activity) and Menu, which opens the full navigation as a drawer. From 768px the icon rail; from 1280px the full sidebar. | Phone 390px and tablet 820px in Edge |
| Upload | "Browse files" opens the phone's own picker (files, gallery or camera). On touch screens "Take a photo" opens the back camera directly (`capture="environment"`). The server checks every file the same way as on a desktop. | The buttons and inputs in emulation; **not on a real phone** |
| Verify | The document opens at 50% on phones so an A4 page fits; zoom and the field list work as on a desktop. | 390px in Edge |
| Offline | `public/sw.js` shows a clear "You are offline" page when there is no connection. It caches nothing but that page and one icon: pages, data and documents always come from the network, so no ESG data or evidence is stored on the device. | Service worker registered and the offline page served with the network cut, in Edge |
| Sessions | The same sign-in, session time limits and one-session-per-account rule as in a browser; the installed app is a browser window with its own cookies. | Unchanged code |
| Notifications | In the app (the bell) and by email. No push notifications. | — |
| Custom cursor | Never shown after a tap: emulated mouse events that follow a touch are ignored; pen and mouse still drive it (requirement 8). | Touch emulation in Edge |

## 2. Known limits

- **Not tested on a real Android or iOS device.** This machine has no Android SDK, no Mac and no phones;
  everything above was checked in Edge's device emulation (touch, small viewport, mobile user agent).
  Before relying on it, try on one Android phone (Chrome) and one iPhone (Safari): sign in, install, upload
  a photo taken with the camera, verify it, approve it, open a report.
- **No push notifications** (Web Push needs a push service and keys; not built).
- **iOS:** an installed web app on iOS keeps its own storage, so the person signs in again inside it;
  iOS may clear it after weeks of not opening the app.
- **Camera in the page itself** (a live preview) is blocked by the site's `Permissions-Policy: camera=()`;
  only the phone's own camera app, opened by the file input, is used. That is enough for photographing bills.
- **Large PDFs** are rendered page by page by pdf.js on the phone; very large files are slow on older phones.

## 3. A store app later (Capacitor)

When features are frozen, wrap the same web app with [Capacitor](https://capacitorjs.com):

1. A new `apps/mobile` package with `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
   `@capacitor/ios`. `capacitor.config.ts` with `server.url` set to the deployed site (the app is
   server-rendered and needs its server; it cannot be bundled as static files) and `allowNavigation`
   limited to that host.
2. Android: Android Studio and the Android SDK; `npx cap add android`, app id `in.meil.emeilsg` (to be
   confirmed), icons from `public/icons/`. iOS: a Mac with Xcode, an Apple developer account.
3. Plugins only where the web cannot do it: `@capacitor/camera` (if a live camera is wanted, which also
   needs the `Permissions-Policy` changed for the app's origin), `@capacitor/push-notifications` (needs
   Firebase / APNs and a server side to send), `@capacitor/app` for deep links (`emeilsg://` or verified
   https links for invitation emails).
4. **Test on devices, not only the emulator** (the plan's own rule): sign-in and session expiry, invitation
   links opening the app, upload from camera and gallery, verification, approvals, report download, offline
   and back online, Android back button, app switching mid-upload.
5. Store listings, privacy labels and review: Google Play and the App Store need a privacy policy URL
   (`docs/PRIVACY_NOTICE_DRAFT.md` is a draft for a lawyer).

Until then the installable web app is the supported way to use EmeilSG on a phone.
