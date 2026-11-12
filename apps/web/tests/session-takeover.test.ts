import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceLabel } from "../lib/auth/device-label.ts";
import {
  SIGN_IN_MARKER,
  sessionIdForNotice,
  sessionIdFromAccessToken,
  sessionIdFromAuthCookies,
  signedOutAt,
} from "../lib/auth/session-cookie.ts";
import { PERMISSION_LABELS, permissionLabel } from "../lib/roles/permission-labels.ts";

const SID = "3f1c2b7a-9d4e-4a51-8c0b-2e7f6a1d9c33";

function token(claims: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.signature`;
}

test("session id: read from an access token's claims", () => {
  assert.equal(sessionIdFromAccessToken(token({ session_id: SID })), SID);
  assert.equal(sessionIdFromAccessToken(token({ session_id: "not-a-uuid" })), null);
  assert.equal(sessionIdFromAccessToken(token({})), null);
  assert.equal(sessionIdFromAccessToken("garbage"), null);
  assert.equal(sessionIdFromAccessToken(null), null);
});

test("session id: read from the Supabase auth cookie, plain, base64 and chunked", () => {
  const json = JSON.stringify({ access_token: token({ session_id: SID }), refresh_token: "r" });
  const base64 = `base64-${Buffer.from(json).toString("base64url")}`;
  const name = "sb-abcdef-auth-token";

  assert.equal(sessionIdFromAuthCookies([{ name, value: json }]), SID);
  assert.equal(sessionIdFromAuthCookies([{ name, value: base64 }]), SID);
  // Chunks may arrive in any order; they are joined by their number.
  const cut = Math.floor(base64.length / 2);
  assert.equal(
    sessionIdFromAuthCookies([
      { name: "other", value: "x" },
      { name: `${name}.1`, value: base64.slice(cut) },
      { name: `${name}.0`, value: base64.slice(0, cut) },
    ]),
    SID,
  );
  assert.equal(sessionIdFromAuthCookies([{ name: "theme", value: "dark" }]), null);
  assert.equal(sessionIdFromAuthCookies([{ name, value: "base64-!!!" }]), null);
});

test("signed-out time: India time, and nothing for a value that is not an ISO instant", () => {
  assert.equal(signedOutAt("2026-11-07T10:15:00.000Z"), "3:45 pm on 7 Nov 2026");
  assert.equal(signedOutAt("2026-11-07"), null);
  assert.equal(signedOutAt("<script>"), null);
  assert.equal(signedOutAt(null), null);
});

test("device label: a short browser and system name", () => {
  const edge =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const android =
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  assert.equal(deviceLabel(edge), "Edge on Windows");
  assert.equal(deviceLabel(iphone), "Safari on iOS");
  assert.equal(deviceLabel(android), "Chrome on Android");
  assert.equal(deviceLabel(null), "an unknown browser");
});

test("permission labels: all 20 approved names, and no raw code for an unknown one", () => {
  assert.equal(Object.keys(PERMISSION_LABELS).length, 20);
  assert.equal(permissionLabel("document.upload"), "Upload documents");
  assert.equal(permissionLabel("record.verify"), "Check and confirm extracted values");
  assert.equal(permissionLabel("report.export"), "Report export");
  for (const label of Object.values(PERMISSION_LABELS)) assert.doesNotMatch(label, /[._]/);
});

test("notice lookup: the auth cookie while it is there, else the app's own marker", () => {
  const json = JSON.stringify({ access_token: token({ session_id: SID }) });
  const other = "11111111-2222-4333-8444-555555555555";
  assert.equal(
    sessionIdForNotice([
      { name: "sb-x-auth-token", value: json },
      { name: SIGN_IN_MARKER, value: other },
    ]),
    SID,
  );
  assert.equal(sessionIdForNotice([{ name: SIGN_IN_MARKER, value: other }]), other);
  assert.equal(sessionIdForNotice([{ name: SIGN_IN_MARKER, value: "x' or 1=1" }]), null);
});
