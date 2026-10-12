import assert from "node:assert/strict";
import { test } from "node:test";
import { poolSize, serverlessPoolerUrl } from "../lib/pooler-url.ts";

const session = "postgresql://postgres.abc:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

test("on Vercel the session pooler port becomes the transaction pooler port", () => {
  const out = serverlessPoolerUrl(session, { VERCEL: "1" });
  assert.equal(new URL(out).port, "6543");
  assert.equal(new URL(out).username, "postgres.abc");
});

test("elsewhere, and for other hosts or ports, the URL is unchanged", () => {
  assert.equal(serverlessPoolerUrl(session, {}), session);
  const local = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  assert.equal(serverlessPoolerUrl(local, { VERCEL: "1" }), local);
  const done = session.replace(":5432", ":6543");
  assert.equal(serverlessPoolerUrl(done, { VERCEL: "1" }), done);
});

test("a serverless instance keeps at most three connections", () => {
  assert.equal(poolSize(5, { VERCEL: "1" }), 3);
  assert.equal(poolSize(5, {}), 5);
});
