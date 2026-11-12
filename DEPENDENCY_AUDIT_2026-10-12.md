# TraceESG — Dependency and production configuration audit, 2026-10-12

_Seventh report of the 2026-10-12 audit. Branch `feature-security-audit-fixes`, uncommitted. **Nothing was
changed on hosted infrastructure, in any dashboard, or in the deployed worker image.** Secret values were
never printed: where a check needed them, only names and counts were output._

## 1. Result

| | Before the audit day | Now |
| - | -------------------- | --- |
| Known vulnerabilities in what ships (web) | 14 (1 critical, 7 high) | 2, neither with a fixed version, both reviewed and recorded |
| Known vulnerabilities in the worker image | 6 distinct, all in `pip` | 0 on a rebuilt image (the deployed image is unchanged) |
| Server-only values in the browser bundle | — | none |
| Browser source maps in a production build | — | none |

No committed secret, no debug endpoint in a production build, no third-party tracker. The application is not
deployed yet, so everything about the host, DNS, TLS and dashboards is a checklist (§6), not a finding.

## 2. Dependency inventory

### Web app (`apps/web`) — 26 runtime and 13 development packages; 967 lockfile entries

| Package | Version | Used for | Sends data out? | Note |
| ------- | ------- | -------- | --------------- | ---- |
| `next` | 16.3.8 | Framework | Anonymous build telemetry unless disabled | Was 16.3.5 (10 advisories). Latest is 16.4.0 — a minor, not taken |
| `react`, `react-dom` | 19.2.8 | UI | No | |
| `@supabase/supabase-js`, `@supabase/ssr` | 2.116.0, 0.12.7 | Auth, storage, a few reads as the user | To the Supabase project only | Server-side only; no client in the browser |
| `postgres` | 3.4.9 | Database | To the database only | |
| `@trpc/server`, `zod` | 11.18.0, 4.6.5 | API, validation | No | |
| `@sentry/nextjs` | 11.4.0 | Error reports | Only if `SENTRY_DSN` is set | Collection of users, cookies, headers, bodies, query strings and variables is switched off in `instrumentation.ts` |
| `nodemailer` | 10.0.10 | Email through Brevo SMTP | To Brevo | STARTTLS on 587; TLS is not forced |
| `puppeteer-core`, `@sparticuz/chromium` | 25.11.0, 153.0.0 | Report PDFs | No: JavaScript off and every request blocked while rendering | Chromium binary in the function |
| `pdf-lib`, `pdfjs-dist`, `jszip` | 1.17.1, 6.3.289, 3.10.2 | Split PDFs, viewer, evidence bundle | No | |
| `exceljs` | 4.4.0 | Writes the import templates | No | Carries `uuid` < 11.1.1 (accepted, below) |
| `xlsx` | **0.20.3 from SheetJS's own site** | Reads filled import sheets | No | Was 0.18.5 from npm: two high advisories and no fix on npm, where the project stopped publishing. See §3 |
| `radix-ui`, `lucide-react`, `motion`, `sonner`, `class-variance-authority`, `cn`, `tw-animate-css` | — | UI | No | `cn` 0.3.0 is shadcn's class-name helper (github.com/shadcn-ui/cn) |
| `shadcn` | 4.21.0 | Its stylesheet is imported at build | No at run time | A command-line tool listed as a runtime dependency; carries `braces` (accepted, below) |
| `server-only` | 0.0.1 | Build-time guard | No | |
| dev: `typescript`, `eslint`, `eslint-config-next`, `prettier`, `tailwindcss`, `@tailwindcss/postcss`, types, `axe-core` | — | Tooling | No | |
| dev: `agentation` | 3.1.2 | Page-feedback widget | To `localhost:4747`, development only | PolyForm Shield licence; rendered only when `NODE_ENV` is `development` |
| root dev: `supabase` | 2.117.0 | CLI | CLI telemetry | The only package allowed to run an install script |

**Install scripts.** `pnpm-workspace.yaml` allows a build script for the Supabase CLI only (`allowBuilds`);
every other package's install script is blocked, `sharp` included. pnpm reported "Lockfile passes
supply-chain policies" on install.

**Maintenance.** Every direct dependency is within one minor release of its latest. `@types/jszip` was
deprecated (jszip ships its own types) and was removed in the second pass. Nothing else is abandoned.

**Licences.** Permissive throughout (see `COMPLIANCE_AUDIT_2026-10-12.md` §5).

### OCR worker (`apps/ocr-worker`)

`paddlepaddle` 3.3.1, `paddleocr` 3.7.0, `psycopg[binary]` 3.3.5, `sentry-sdk` 2.69.2 — pinned exactly; their
96 transitive packages are not pinned (no lock or hashes). Base image `python:3.12-slim` by tag. `pip-audit`
inside the deployed image: no advisory in any application package; six in `pip` 25.0.1, which comes with the
base image and is not used at run time. The worker runs as a non-root user, has no inbound port, and its
only outbound calls are to the Supabase database and storage; PaddleOCR's model-source check is disabled and
the models are baked into the image. `.dockerignore` keeps `.env` files out of the image.

## 3. Changes made

| Change | Why | Verified |
| ------ | --- | -------- |
| `next`, `eslint-config-next` 16.3.5 → 16.3.8 (earlier today) | 10 advisories, one critical | Build, tests |
| `xlsx` 0.18.5 (npm) → 0.20.3 (tarball from `cdn.sheetjs.com`, integrity hash in the lockfile) | Prototype pollution and ReDoS; the fix exists only on the vendor's site. Same API, so `.xlsx` and `.xls` uploads keep working | New test `tests/bulk-import-parse.test.ts` (3) |
| Lockfile refresh of `sharp`, `source-map-js`, `@modelcontextprotocol/sdk` inside their existing ranges | Three high advisories in transitive packages | `pnpm audit` |
| `pnpm-workspace.yaml`: two advisories accepted with reasons (`auditConfig.ignoreGhsas`) | `braces` (no fix; reached only by a build-time CLI) and `uuid` in `exceljs` (which calls `v4` only — checked in its source) | `pnpm audit --prod --audit-level=high` exits 0 |
| `next.config.ts`: `poweredByHeader: false` | Responses advertised the framework | Header gone on the rebuilt app |
| tRPC route: `Cache-Control: private, no-store` and a deny-all CSP on every API answer | Signed-in data was returned with no caching directive | Headers present on the rebuilt app |
| CI: `permissions: contents: read`; the third-party action pinned to a commit; an audit step that fails on a new high or critical advisory; Next telemetry off | Least privilege, a tag that cannot be moved, and no silent regression | **Not run on GitHub** — the workflow runs only on a pull request or a push to `main` |
| Worker `Dockerfile`: upgrade `pip` as the last build step | Six advisories in the base image's pip | Built under a throwaway tag: pip 26.2.1, extractor `rules-13`, non-root, `pip-audit` clean; tag removed. **`traceesg-ocr-worker:latest` and the running container were not touched** |

**For the owner to confirm:** `xlsx` now installs from the vendor's site instead of the npm registry. That is
SheetJS's documented way to get fixed versions, and the lockfile pins the file's hash, but it is a second
download source for installs and CI. The alternative is to read sheets with `exceljs` and drop `.xls` support.

**Second pass (the same brief was sent again).** Three further changes, all listed above: the worker's error
reports (checked by loading the changed module inside the existing image: personal data off, frame variables
off, bodies never; Ruff and the worker's 44 unit tests pass), `app/robots.ts` (the build lists `/robots.txt`),
and removing `@types/jszip` (typecheck passes). The worker's logging was read: it writes job and document
ids, statuses and failure reasons — no document text, no settings.

Retested after all of it: unit tests 194/194, typecheck, lint, format, production build; on the rebuilt app
against the local stack — the cross-project procedure check 107/107, the chatbot check 49/49, and the browser
checks for sign-in, keyboard, dialogs and axe 131/131.

## 4. Configuration findings

### Verified in order

| Area | Evidence |
| ---- | -------- |
| Secrets in the repository | Pattern scan of the whole git history (earlier today): none. `.env*` files are git-ignored; only `.env.example` files (names only) are tracked |
| Secrets in the browser | Built bundle (92 files, 5.8 MB) searched for the value of every server-only setting and for secret-shaped strings: none. Two "hits" were ordinary words (the bucket name and the sender name). Even the public Supabase key is absent — no browser code uses it — and the key configured as public carries the `anon` role |
| Public settings | Exactly three `NEXT_PUBLIC_` names: the Supabase URL, the public key, the app URL |
| Source maps | None in `.next/static`; server-side maps exist and are not served. (Maps under `.next/dev` belong to a development server, not a build) |
| Debug surface | A production build answers 404 for dev-overlay and hot-reload endpoints, `/.env`, `/.git/config`; the feedback widget is not rendered |
| HTTPS and headers | HSTS (2 years, subdomains), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies on every response; session cookie HttpOnly, Secure in production, SameSite=Lax |
| Caching | Pages: `private, no-store`. Hashed assets: one year, immutable. Evidence and report files: `private, no-store`. API: now `private, no-store` |
| Cross-origin | No CORS headers anywhere; a pre-flight gets none; a cross-site POST to the API is refused (403) |
| Image endpoint | A remote URL is refused (400); only the app's own images are resized |
| Errors | API errors carry a message and a code, no stack. Unexpected errors are logged on the server and reported generically |
| Error reporting | Off without `SENTRY_DSN`. In the web app, collection of personal data is switched off explicitly; in the worker, personal data, frame variables and request bodies are off (second pass) |
| Webhooks, OAuth | None exist. The only callback is `/auth/confirm` for invite and recovery links, with a fixed destination |

### Findings

| ID | Sev. | Finding | Status |
| -- | ---- | ------- | ------ |
| P-01 | Medium | Content-Security-Policy still allows inline scripts and has no `default-src` | Open (security report F-10): needs per-request nonces |
| P-02 | Medium | Rate limits trust the first `X-Forwarded-For` entry | Open (F-08): depends on the host |
| P-03 | Low | `.env.production.local` exists in `apps/web` with the full set of hosted settings; `next build` and `next start` read it on this machine. Git-ignored, so not a leak — but a production build made here is wired to the hosted project without anyone choosing that | Owner: delete it or keep it deliberately |
| P-04 | Low | The worker's transitive Python packages are unpinned and the base image is pinned by tag, so two builds can differ | Open: a hashed lock file (`pip-compile --generate-hashes`) and an image digest |
| P-05 | Low | Email goes out with opportunistic TLS (`secure: false` on port 587) | Open: `requireTLS: true` — not changed because email was not exercised in this audit |
| P-06 | Low | No `robots.txt`; the sign-in and app paths can be indexed | **Fixed in the second pass** (`app/robots.ts`): only the landing page is offered to crawlers |
| P-11 | Medium | The worker's error reports would have included each stack frame's local variables — which in the worker can be the text read from a document, or the database address | **Fixed in the second pass** (`worker/logs.py`); takes effect when the image is rebuilt |
| P-12 | Low | `supabase/seed.sql` gives the chatbot's database role a known local password. The seed runs only on a local reset — but a push to hosted made with the seed included would give that role a login with a published password | Owner: never push with the seed; set the hosted password by hand (checklist) |
| P-07 | Low | CI does not build the app, the worker image, or run the end-to-end, isolation, chatbot or accessibility checks | Open: they need the local stack and a browser |
| P-08 | Info | `shadcn` is a runtime dependency only because `globals.css` imports its stylesheet at build | Copy the stylesheet in, or accept |
| P-09 | Info | `render.yaml` describes a host the owner does not use | Remove when the worker's host is chosen |
| P-10 | Info | No Dependabot or equivalent; no `CODEOWNERS`. Branch protection could not be checked from here (`gh` is not installed) | Dashboard |

## 5. Environment by environment

| | Development | Local test | Production (planned) |
| - | ----------- | ---------- | -------------------- |
| Settings file | `apps/web/.env.local` — today it names the **hosted** project | A local-only file built from `supabase status` (kept outside the repository) | The host's secret store; no file |
| Database | Hosted (shared, "development only") | Local stack | To be decided: a new project or the promoted one |
| Extra script policy | `'unsafe-eval'` allowed for hot reload | none | none |
| Feedback widget | Loaded | Not loaded | Not loaded |
| Auth site URL / redirects | `supabase/config.toml`: `http://localhost:3000` | same | Must be set in the hosted dashboard |
| Chatbot | On if the three settings are present | Stand-in provider in tests | Off until `chat_reader` has a password and the provider is approved |

The same hosted project serving "development" and whatever comes next is the main environment risk: there is
no staging, and the dev server on this machine writes to the shared database.

## 6. Deployment checklist

### Code and repository (nothing here is done yet unless marked)

- [x] Advisory gate in CI; least-privilege workflow token; pinned third-party action.
- [ ] Merge this branch; confirm the CI run on the pull request is green (first run of the changed workflow).
- [ ] Rebuild the worker image from the changed `Dockerfile` and recreate the container (after migrations).
- [ ] Nonce-based CSP (P-01); `robots.ts` (P-06); `requireTLS` for email after one test send (P-05).
- [ ] Decide on `shadcn` (P-08) and `render.yaml` (P-09).

### Dashboards and infrastructure (the owner's; none was touched)

**Supabase**
- [ ] Rotate the database password (it was shared in chat earlier) and the service-role key if it ever left
      this machine.
- [ ] Auth: sign-ups off; 12-character passwords with all four classes; site URL and redirect list set to the
      production domain (`…/auth/confirm`); per-IP limits raised as `SECURITY_REVIEW.md` F8 says; custom SMTP
      so invite emails reach people outside the Supabase team.
- [ ] Push migration `0047` (after the check in the database report), set `chat_reader`'s password by hand.
      Never push with the seed file included: it sets a known local password for that role (P-12).
- [ ] Confirm the region, point-in-time recovery or backup schedule, and who can download a backup.
- [ ] Decide whether the Data API needs to stay exposed.

**Web host**
- [ ] Every server-only setting in the secret store, scoped to production; nothing server-only under a
      `NEXT_PUBLIC_` name.
- [ ] `NEXT_PUBLIC_APP_URL` set to the real address (email links fall back to `localhost`).
- [ ] HTTPS only, HTTP redirected; custom domain; confirm what the host puts in `X-Forwarded-For` (P-02).
- [ ] `NEXT_TELEMETRY_DISABLED=1`; `SENTRY_DSN` if error reports are wanted.
- [ ] Function memory and time-out sufficient for report PDFs (headless Chromium) and the evidence bundle.

**Worker host**
- [ ] Always-on, about 2 GB memory, no inbound port; the four Supabase settings as secrets; the session-pooler
      database address.

**Email (Brevo)**
- [ ] A verified sender on MEIL's domain with SPF, DKIM and DMARC; the SMTP key stored as a secret.

**AI provider**
- [ ] Terms reviewed, or `NVIDIA_NIM_BASE_URL` pointed at a model inside the network.

**GitHub**
- [ ] Branch protection on `main`: pull request required, CI required, no force-push.
- [ ] Secret scanning and push protection on; Dependabot alerts (or the audit step) watched.

**Monitoring**
- [ ] An alert when the worker stops (uploads then wait in "Processing"), when report generation fails, and on
      a burst of failed sign-ins. None exists today.
