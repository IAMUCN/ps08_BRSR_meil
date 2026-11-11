// Copies the HOSTED database and its stored files to the LOCAL server, one way (owner's decision, 2026-11-11:
// hosted is the primary; local is a mirror refreshed every hour). Run by the Windows task "EmeilSG hosted to local
// sync" every hour, or by hand:
//
//   node scripts/sync-hosted-to-local.mjs [--from .env.local] [--to .env.localserver]
//
// What it does, each run:
//   1. Dumps hosted's data (the `public` schema, the sign-in accounts `auth.users` / `auth.identities`, and the
//      storage metadata `storage.objects`) with pg_dump, run inside the local server's database container.
//   2. Replaces the local server's data with it in ONE transaction (triggers off for that transaction only, as a
//      restore needs): every public table is emptied and reloaded, so local equals hosted row for row. Anything
//      written to the local server since the last run is overwritten; nobody should write there.
//   3. Copies stored files that are new or changed on hosted (evidence, reports) through the two Storage APIs,
//      and removes local files hosted no longer has. A manifest remembers what was copied.
//
// Safety: the destination must be a database on this machine (127.0.0.1 / localhost), never hosted; a lock file
// stops two runs overlapping; nothing is printed that holds a password or key.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP = join(WEB, "../../test data/_backup");
const require = createRequire(join(WEB, "package.json"));
const postgres = require("postgres");
const { createClient } = require("@supabase/supabase-js");

const DB_CONTAINER = "supabase_db_emeilsg_local_server";
const LOCK = join(BACKUP, "sync-hosted-to-local.lock");
const MANIFEST = join(BACKUP, "sync-hosted-to-local.manifest.json");
const STATUS = join(BACKUP, "sync-hosted-to-local.status.json");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const envOf = (file) =>
  Object.fromEntries(
    readFileSync(join(WEB, file), "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const docker = (args, opts = {}) =>
  execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });

const from = envOf(arg("from", ".env.local"));
const to = envOf(arg("to", ".env.localserver"));
const fromUrl = new URL(from.DATABASE_URL);
const toUrl = new URL(to.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(toUrl.hostname)) {
  throw new Error("Refusing: the destination is not a database on this machine.");
}
if (["127.0.0.1", "localhost"].includes(fromUrl.hostname)) {
  throw new Error("Refusing: the source is a local database; it should be hosted.");
}

async function copyDatabase() {
  // pg_dump runs inside the local database container (no PostgreSQL tools needed on Windows); the hosted
  // password goes in through the environment, not the command line.
  const conn = [
    `host=${fromUrl.hostname}`,
    `port=${fromUrl.port || 5432}`,
    `user=${decodeURIComponent(fromUrl.username)}`,
    `dbname=${fromUrl.pathname.slice(1) || "postgres"}`,
    "sslmode=require",
  ].join(" ");
  // `-e PGPASSWORD` with no value: docker takes it from this process's environment, so it never appears in a
  // command line (or in an error message that repeats one).
  const withPassword = {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(fromUrl.password) },
  };
  docker(
    [
      "exec",
      "-e",
      "PGPASSWORD",
      DB_CONTAINER,
      "pg_dump",
      conn,
      "--data-only",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
      "-f",
      "/tmp/sync-public.sql",
    ],
    withPassword,
  );
  docker(
    [
      "exec",
      "-e",
      "PGPASSWORD",
      DB_CONTAINER,
      "pg_dump",
      conn,
      "--data-only",
      "-t",
      "auth.users",
      "-t",
      "auth.identities",
      "-t",
      "storage.objects",
      "--no-owner",
      "--no-privileges",
      "-f",
      "/tmp/sync-other.sql",
    ],
    withPassword,
  );

  const local = postgres(to.DATABASE_URL, { max: 1, prepare: false, onnotice() {} });
  const tables = (
    await local`select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = 'public'`
  ).map((r) => r.t);
  await local.end();
  const load = [
    "\\set ON_ERROR_STOP on",
    "begin;",
    "set client_min_messages = warning;",
    "set local session_replication_role = replica;",
    `truncate table ${tables.join(", ")};`,
    "truncate table auth.users cascade;",
    "truncate table storage.objects;",
    "\\i /tmp/sync-other.sql",
    "\\i /tmp/sync-public.sql",
    "commit;",
  ].join("\n");
  docker(["exec", "-i", DB_CONTAINER, "sh", "-c", "cat > /tmp/sync-load.sql"], { input: load });
  docker(["exec", DB_CONTAINER, "psql", "-U", "postgres", "-q", "-f", "/tmp/sync-load.sql"]);
  docker([
    "exec",
    DB_CONTAINER,
    "rm",
    "-f",
    "/tmp/sync-public.sql",
    "/tmp/sync-other.sql",
    "/tmp/sync-load.sql",
  ]);
  return tables.length;
}

async function copyFiles() {
  const hosted = createClient(from.NEXT_PUBLIC_SUPABASE_URL, from.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const local = createClient(to.NEXT_PUBLIC_SUPABASE_URL, to.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const sql = postgres(from.DATABASE_URL, { max: 1, prepare: false, onnotice() {} });
  const objects = await sql`
    select bucket_id as bucket, name, coalesce(metadata->>'eTag', updated_at::text) as tag,
           metadata->>'mimetype' as type
    from storage.objects`;
  await sql.end();
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const next = {};
  const todo = [];
  for (const o of objects) {
    const key = `${o.bucket}/${o.name}`;
    next[key] = o.tag;
    if (manifest[key] !== o.tag) todo.push(o);
  }
  let copied = 0;
  const failed = [];
  const worker = async () => {
    for (let o = todo.shift(); o; o = todo.shift()) {
      const { data, error } = await hosted.storage.from(o.bucket).download(o.name);
      if (error || !data) {
        failed.push(`${o.bucket}/${o.name}: ${error?.message ?? "no data"}`);
        delete next[`${o.bucket}/${o.name}`];
        continue;
      }
      const up = await local.storage
        .from(o.bucket)
        .upload(o.name, Buffer.from(await data.arrayBuffer()), {
          upsert: true,
          contentType: o.type ?? undefined,
        });
      if (up.error) {
        failed.push(`${o.bucket}/${o.name}: ${up.error.message}`);
        delete next[`${o.bucket}/${o.name}`];
      } else copied++;
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  // Files hosted no longer has.
  const gone = Object.keys(manifest).filter((k) => !(k in next));
  for (const key of gone) {
    const [bucket, ...rest] = key.split("/");
    await local.storage.from(bucket).remove([rest.join("/")]);
  }
  writeFileSync(MANIFEST, JSON.stringify(next));
  return { objects: objects.length, copied, removed: gone.length, failed };
}

async function counts(url) {
  const sql = postgres(url, { max: 1, prepare: false, onnotice() {} });
  const [r] = await sql`
    select (select count(*)::int from public.esg_records) as records,
           (select count(*)::int from public.users) as users,
           (select count(*)::int from public.audit_logs) as audit_entries,
           (select count(*)::int from storage.objects) as files`;
  await sql.end();
  return r;
}

if (existsSync(LOCK)) {
  const age = Date.now() - Number(readFileSync(LOCK, "utf8"));
  if (age < 50 * 60 * 1000) {
    log("Another sync is still running; skipping this one.");
    process.exit(0);
  }
}
writeFileSync(LOCK, String(Date.now()));
const started = Date.now();
try {
  log("Sync hosted -> local: start");
  const tables = await copyDatabase();
  log(
    `Database copied: ${tables} public tables replaced, sign-in accounts and storage metadata included.`,
  );
  const files = await copyFiles();
  log(
    `Files: ${files.objects} on hosted, ${files.copied} copied, ${files.removed} removed, ${files.failed.length} failed.`,
  );
  for (const f of files.failed.slice(0, 10)) log("  failed:", f);
  const [h, l] = await Promise.all([counts(from.DATABASE_URL), counts(to.DATABASE_URL)]);
  const same = JSON.stringify(h) === JSON.stringify(l);
  log(
    `Check: hosted ${JSON.stringify(h)} / local ${JSON.stringify(l)} -> ${same ? "match" : "DIFFER"}`,
  );
  writeFileSync(
    STATUS,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        ok: same && files.failed.length === 0,
        seconds: Math.round((Date.now() - started) / 1000),
        hosted: h,
        local: l,
        files,
      },
      null,
      2,
    ),
  );
  log(`Sync done in ${Math.round((Date.now() - started) / 1000)} s.`);
} catch (error) {
  log("Sync FAILED:", error.message.replace(/postgres(ql)?:\/\/[^\s]+/g, "<database url>"));
  writeFileSync(
    STATUS,
    JSON.stringify(
      { at: new Date().toISOString(), ok: false, error: String(error.message).slice(0, 500) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  rmSync(LOCK, { force: true });
}
