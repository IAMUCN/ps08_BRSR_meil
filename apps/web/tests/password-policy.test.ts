import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PASSWORD_RULES,
  passwordMeetsPolicy,
  passwordPolicyMessage,
  passwordStrength,
} from "../lib/auth/password-policy.ts";

test("every rule must pass, not just length", () => {
  assert.equal(passwordMeetsPolicy("short"), false);
  assert.equal(passwordMeetsPolicy("alllowercase12345"), false, "no uppercase");
  assert.equal(passwordMeetsPolicy("ALLUPPERCASE12345"), false, "no lowercase");
  assert.equal(passwordMeetsPolicy("NoDigitsHereAtAll!"), false, "no number");
  assert.equal(passwordMeetsPolicy("NoSpecialChar1234"), false, "no special character");
  assert.equal(passwordMeetsPolicy("Valid@Password123"), true);
});

test("the missing-rules message names only what's actually missing", () => {
  assert.equal(passwordPolicyMessage("Valid@Password123"), "");
  assert.match(passwordPolicyMessage("short"), /12 characters/);
  // Has length, uppercase, lowercase and a number — missing only a special character.
  const message = passwordPolicyMessage("Password123456");
  assert.match(message, /special character/);
  assert.doesNotMatch(message, /12 characters|uppercase|lowercase|number/);
});

test("strength grows with the number of rules met", () => {
  assert.deepEqual(passwordStrength(""), { score: 0, label: "empty" });
  assert.equal(passwordStrength("abc").label, "weak");
  assert.equal(passwordStrength("abcdefghijkl").score, 2); // length + lowercase only
  assert.equal(passwordStrength("Abcdefghijkl").score, 3); // + uppercase
  assert.equal(passwordStrength("Abcdefghijk1").score, 4); // + number
  assert.equal(passwordStrength("Abcdefghijk1!").label, "strong");
  assert.equal(PASSWORD_RULES.length, 5);
});
