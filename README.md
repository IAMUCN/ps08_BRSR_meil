# ps08_BRSR_meil

**TraceESG** — an evidence-first ESG/BRSR reporting platform (PS-08). Users upload source documents; the
system extracts, verifies, validates, calculates and maps them to BRSR, with full lineage back to the
original evidence.

> **Status:** Phase 1 (project setup) of `ps_documents/implementation_docs/06_IMPLEMENTATION_PLAN.md`.
> The repository is a buildable scaffold — no product features are implemented yet.

## Repository layout

```
apps/web/            Next.js app (frontend + backend logic)           — TypeScript
apps/ocr-worker/     OCR worker (PaddleOCR)                           — Python 3.12
packages/shared-types/  Types shared across TS code
supabase/migrations/ SQL migrations (schema, RLS policies)
ps_documents/        Project documentation only — no application code
```

All design and build decisions come from the documents in `ps_documents/implementation_docs/`
(Master Approach → PRD → TRD → App Flow → UI/UX Brief → Backend Schema → Implementation Plan).

## Prerequisites

- **Node.js** 20.9 or newer (developed on Node 24)
- **pnpm** 12.4.2 — pinned via `packageManager`. Run `corepack enable` once (Corepack ships with Node) so a
  plain `pnpm` command is on your PATH; the root scripts call `pnpm` internally, so they need it.
- **Python 3.12** for the OCR worker — PaddlePaddle does **not** publish wheels for Python 3.14

## Web app (`apps/web`)

```bash
# from the repository root
pnpm install                                   # install all workspace dependencies
cp apps/web/.env.example apps/web/.env.local   # then fill in values (never commit them)
pnpm dev                                       # start the dev server at http://localhost:3000
```

Root commands:

| Command | What it does | Without `corepack enable` |
|---|---|---|
| `pnpm dev` | Dev server for `apps/web` | `corepack pnpm --filter web dev` |
| `pnpm lint` | ESLint across the workspace | `corepack pnpm -r lint` |
| `pnpm typecheck` | TypeScript checks across the workspace | `corepack pnpm -r typecheck` |
| `pnpm format` / `pnpm format:check` | Prettier write / check for `apps/web` | `corepack pnpm --filter web format:check` |
| `pnpm build` | Production build of `apps/web` | `corepack pnpm --filter web build` |

## OCR worker (`apps/ocr-worker`)

The worker's Python dependencies are listed in **`apps/ocr-worker/requirements.txt`** (PaddlePaddle +
PaddleOCR, pinned). Development tooling (Ruff) is in `requirements-dev.txt`.

### Using `requirements.txt`

1. Go to the worker folder:

   ```bash
   cd apps/ocr-worker
   ```

2. Create a virtual environment **with Python 3.12**:

   ```bash
   # Windows
   py -3.12 -m venv .venv

   # macOS / Linux
   python3.12 -m venv .venv
   ```

3. Activate it:

   ```bash
   # Windows (PowerShell)
   .venv\Scripts\Activate.ps1

   # Windows (Git Bash)
   source .venv/Scripts/activate

   # macOS / Linux
   source .venv/bin/activate
   ```

4. Install the dependencies from `requirements.txt` (and the dev tooling):

   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   python -m pip install -r requirements-dev.txt
   ```

   This is a large download (PaddlePaddle, PaddleOCR and their dependencies). It installs the CPU build —
   no GPU is required.

5. Check the install:

   ```bash
   python -c "import paddle, paddleocr; print(paddle.__version__, paddleocr.__version__)"
   ruff check .
   ```

6. Copy `.env.example` to `.env` and fill in values (never commit them).

To add or upgrade a Python dependency, pin its exact version in `requirements.txt`, reinstall with step 4,
and commit the updated file. The `.venv/` folder is git-ignored and must never be committed.

OCR model weights are **not** part of `requirements.txt`; they are downloaded and baked into the worker
image in Phase 2B (TRD §10, §35).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and push to `main`:
lint, typecheck and format check for the web app, and Ruff for the OCR worker. There is no deploy step yet.

## Secrets

Only variable **names** live in the repository (`.env.example` files, per TRD §33). Real `.env*` files are
git-ignored.

## License

See [LICENSE](LICENSE).
