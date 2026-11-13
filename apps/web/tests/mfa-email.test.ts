import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentEmailCode,
  emailCodeMatches,
  emailPassToken,
  emailPassValid,
} from "../lib/auth/mfa-email.ts";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
const user = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const now = Date.UTC(2026, 10, 13, 12, 0, 0);

test("an emailed code works for its own sign-in only", () => {
  const code = currentEmailCode(user, session, now);
  assert.match(code, /^\d{6}$/);
  assert.equal(emailCodeMatches(user, session, code, now), true);
  assert.equal(emailCodeMatches(user, "33333333-3333-4333-8333-333333333333", code, now), false);
  assert.equal(emailCodeMatches("44444444-4444-4444-8444-444444444444", session, code, now), false);
});

test("an emailed code expires after two windows", () => {
  const code = currentEmailCode(user, session, now);
  assert.equal(emailCodeMatches(user, session, code, now + 9 * 60_000), true);
  assert.equal(emailCodeMatches(user, session, code, now + 25 * 60_000), false);
});

test("the pass cookie is bound to the session and expires", () => {
  const token = emailPassToken(user, session, now);
  assert.equal(emailPassValid(token, user, session, now + 1000), true);
  assert.equal(emailPassValid(token, user, "33333333-3333-4333-8333-333333333333", now), false);
  assert.equal(emailPassValid(token + "0", user, session, now), false);
  assert.equal(emailPassValid(token, user, session, now + 4 * 24 * 3600_000), false);
  assert.equal(emailPassValid(undefined, user, session, now), false);
});
