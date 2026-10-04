# Agent brief

Start every session by reading the project context and progress below. Follow the "How we work" rules in
`PROGRESS.md`.

- `CONTEXT.md` is the live state: what is uncommitted or in flight, what is waiting on a decision, the machine and
  environment facts, how the person works, and traps already hit. **Rewrite it at the end of every session** (its last
  section says how).
- `PROGRESS.md` is the history: what each phase delivered and the open items. **Update it at the end of each phase**
  as described in its last section.

## Working in parallel (two roles, two branches)

Two people work in this repo at the same time, in two roles: **feature** (features, add-ons, backend, OCR worker,
database) and **ui** (how the app looks and behaves in the browser). Branches keep the work apart; these rules keep
the merges clean. Ask the person you are working for which role they have if it isn't obvious.

1. **Never commit to `main` directly.** Work on your own branch (`feature/<topic>` or `ui/<topic>`), open a pull
   request, and merge only when CI passes. Commit or push only when the person asks.
2. **Start every session with `git pull --rebase origin main`** (or merge `main` in) and keep branches short — small,
   frequent merges are what prevents conflicts.
3. **Stay in your lane.**
   - feature: `apps/web/lib/**`, `apps/web/app/**/actions.ts`, tRPC routers, `supabase/**`, `apps/ocr-worker/**`,
     tests, and the docs listed below.
   - ui: `apps/web/components/**` (look and layout), `apps/web/app/**/page.tsx` and layout files,
     `apps/web/app/globals.css`, theme tokens.
   - **Shared files** (`components/upload/*`, `components/verification/*`, `package.json`, `next.config.ts`): change
     only what your task needs, keep it small, and say so in the pull request description. Do not reformat or
     reorganise files you don't own.
   - If a ui change needs a new server procedure or a feature change needs new UI, say so and let the other role do
     it, or agree on the interface first.
4. **Only feature adds migrations** (`supabase/migrations/00NN_*.sql`). The next number is the highest one on `main`
   plus one; check `main` before choosing so two branches never claim the same number. ui work must not need a
   migration — if it does, ask.
5. **Each doc is edited by one role.** `PROGRESS.md`, `CONTEXT.md`, `.grill/*`, `supabase/SCHEMA_DEVIATIONS.md` and
   `apps/web/APP_FLOW_DEVIATIONS.md` are edited by feature. ui records its decisions and deviations in `UI_NOTES.md`
   (create it if missing) in the same pull request; feature folds them into the others. This avoids both roles
   rewriting the same file at the end of a session.
6. **Never hand-merge `pnpm-lock.yaml`.** On a conflict take `main`'s copy and run `pnpm install`. Add a dependency
   only when the task needs it, and say so in the pull request.
7. **The hosted Supabase project and the hosted OCR worker are shared.** ui develops against local Supabase
   (`pnpm db:start`) and never runs a second worker against the hosted database. feature pushes migrations to hosted
   (with the person's go-ahead) before replacing the hosted worker container; everyone's running app sees those
   changes at once.
8. **Before opening a pull request:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (and Ruff plus the
   worker unit tests if `apps/ocr-worker` changed) must pass. Line endings are fixed by `.gitattributes` (LF).

@CONTEXT.md
@PROGRESS.md
