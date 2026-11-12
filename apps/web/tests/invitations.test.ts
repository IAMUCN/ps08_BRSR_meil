// Invitation links: the token, its hash, the link and the validity rules (lib/auth/invitation-token.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashInvitationToken,
  invitationLink,
  invitationState,
  invitationValidHours,
  isInvitationToken,
  newInvitationToken,
  validityLabel,
} from "../lib/auth/invitation-token.ts";

test("a token is 32 random bytes in URL-safe base64, different every time", () => {
  const tokens = Array.from({ length: 500 }, () => newInvitationToken());
  assert.equal(new Set(tokens).size, tokens.length);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.ok(isInvitationToken(token));
  }
});

test("anything that is not shaped like a token is refused before the database is asked", () => {
  for (const value of [
    "",
    "short",
    "a".repeat(42),
    "a".repeat(44),
    `${"a".repeat(42)}/`,
    `${"a".repeat(42)}'`,
    `${"a".repeat(40)}%27;`,
    null,
    undefined,
    42,
    { token: "a".repeat(43) },
  ]) {
    assert.equal(isInvitationToken(value), false);
  }
});

test("only a SHA-256 of the token is kept, and it does not reveal the token", () => {
  const token = newInvitationToken();
  const hash = hashInvitationToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashInvitationToken(token), hash);
  assert.notEqual(hashInvitationToken(newInvitationToken()), hash);
  assert.ok(!hash.includes(token));
});

test("the link carries the token after the #, which a browser never sends to a server", () => {
  const token = newInvitationToken();
  const link = new URL(invitationLink("https://app.example/", token));
  assert.equal(link.origin, "https://app.example");
  assert.equal(link.pathname, "/invite");
  assert.equal(link.search, "");
  assert.equal(link.hash, `#${token}`);
});

test("validity comes from the setting, inside 1 hour to 7 days, else 24 hours", () => {
  assert.equal(invitationValidHours(24), 24);
  assert.equal(invitationValidHours(1), 1);
  assert.equal(invitationValidHours(168), 168);
  for (const bad of [0, -5, 169, 1.5, "24", null, undefined, Number.NaN, {}]) {
    assert.equal(invitationValidHours(bad), 24);
  }
  assert.equal(validityLabel(24), "24 hours");
  assert.equal(validityLabel(1), "1 hour");
  assert.equal(validityLabel(72), "3 days");
});

test("a link is pending, expired, revoked or used", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  const later = new Date("2026-10-14T12:00:00Z");
  const earlier = new Date("2026-10-13T11:59:59Z");
  const open = { consumedAt: null, revokedAt: null };
  assert.equal(invitationState({ ...open, expiresAt: later }, now), "pending");
  assert.equal(invitationState({ ...open, expiresAt: earlier }, now), "expired");
  assert.equal(invitationState({ ...open, expiresAt: now }, now), "expired");
  assert.equal(
    invitationState({ consumedAt: null, revokedAt: earlier, expiresAt: later }, now),
    "revoked",
  );
  assert.equal(
    invitationState({ consumedAt: earlier, revokedAt: null, expiresAt: later }, now),
    "used",
  );
});
