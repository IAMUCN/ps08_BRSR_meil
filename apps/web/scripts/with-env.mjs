// Runs a command with the variables of an env file set first (they win over .env.local, which Next.js also
// reads). Used by `pnpm --filter web dev:local-server` (docs/LOCAL_DATABASE_SERVER.md). Prints no value.
//
//   node scripts/with-env.mjs <env file> <command> [args...]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const [file, command, ...args] = process.argv.slice(2);
if (!file || !command) {
  console.error("usage: node scripts/with-env.mjs <env file> <command> [args...]");
  process.exit(1);
}
const vars = Object.fromEntries(
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, ""),
    ]),
);
const child = spawn(command, args, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...vars },
});
child.on("exit", (code) => process.exit(code ?? 1));
