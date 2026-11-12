// Runs the end-to-end suite in order (Scenario D reports on what A–C created). Usage, from apps/web:
//   pnpm test:e2e              all scripts
//   pnpm test:e2e authorization   only the named ones
// Needs: local Supabase, the app on E2E_APP_URL (default http://localhost:3000, a production build is
// closest to deployment), the OCR worker image (or E2E_WORKER=local) and the worker's Python venv for the
// synthetic documents. See README → Testing.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ALL = [
  "scenario-a-scope1",
  "scenario-b-scope2",
  "scenario-c-hr",
  "scenario-d-report",
  "scenario-e-bundle",
  "scenario-f-activities",
  "authorization",
  "edge-cases",
  "audit-regression",
  "scoped-admin",
  "invitations-sessions",
  "feedback-2026-11",
  "phase2-lifecycle",
  "phase3-ocr",
  "phase4-forwarding-audit",
  "phase5-reminders",
  "phase6-factors",
  "phase7-analytics",
  "phase8-templates-search",
  "release-checks",
  "row-upload",
];
const chosen = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";

function preflight() {
  const problems = [];
  const unknown = chosen.filter((name) => !ALL.includes(name));
  if (unknown.length)
    problems.push(`unknown script(s): ${unknown.join(", ")} — choose from ${ALL.join(", ")}`);
  if (!existsSync(join(HERE, "..", "..", ".env.local")))
    problems.push("apps/web/.env.local is missing");
  const python =
    process.env.E2E_PYTHON ??
    join(
      HERE,
      "..",
      "..",
      "..",
      "ocr-worker",
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
  if (!existsSync(python))
    problems.push(`no Python for the synthetic documents at ${python} (set E2E_PYTHON)`);
  if (process.env.E2E_WORKER !== "local") {
    try {
      execFileSync(
        "docker",
        ["image", "inspect", process.env.E2E_WORKER_IMAGE ?? "traceesg-ocr-worker"],
        { stdio: "ignore" },
      );
    } catch {
      problems.push(
        "no OCR worker image — docker build -t traceesg-ocr-worker apps/ocr-worker (or E2E_WORKER=local)",
      );
    }
  }
  return problems;
}

const problems = preflight();
try {
  await fetch(`${APP}/login`);
} catch {
  problems.push(
    `the app is not answering at ${APP} — pnpm --filter web build && pnpm --filter web start`,
  );
}
if (problems.length) {
  console.error(`Cannot run the end-to-end suite:\n- ${problems.join("\n- ")}`);
  process.exit(2);
}

const results = [];
for (const name of chosen) {
  console.log(`\n=== ${name} ===`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [join(HERE, `${name}.mjs`)], {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  process.stdout.write(run.stdout);
  const tally = run.stdout.match(/(\d+) passed, (\d+) failed\s*$/);
  results.push({
    name,
    ok: run.status === 0,
    tally: tally ? `${tally[1]} passed, ${tally[2]} failed` : "did not finish",
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
console.log("\n=== Summary ===");
for (const r of results)
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(20)} ${r.tally} (${r.seconds}s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
