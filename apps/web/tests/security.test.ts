import assert from "node:assert/strict";
import { test } from "node:test";
import { sameOriginRequest } from "../lib/security/origin.ts";

const req = (over: Partial<Parameters<typeof sameOriginRequest>[0]>) =>
  sameOriginRequest({
    method: "POST",
    origin: null,
    secFetchSite: null,
    host: "traceesg.example.com",
    forwardedHost: null,
    ...over,
  });

test("CSRF: a mutation from the app's own pages is allowed", () => {
  assert.equal(req({ origin: "https://traceesg.example.com", secFetchSite: "same-origin" }), true);
  assert.equal(
    req({ origin: "https://TraceESG.example.com" }),
    true,
    "hosts compare case-insensitively",
  );
  assert.equal(
    req({ origin: "https://app.meil.in", host: "internal:3000", forwardedHost: "app.meil.in" }),
    true,
    "behind a proxy the forwarded host is the app's host",
  );
});

test("CSRF: a mutation from another site — including a sibling subdomain — is refused", () => {
  assert.equal(req({ origin: "https://evil.example" }), false);
  assert.equal(
    req({ origin: "https://other.example.com" }),
    false,
    "SameSite=Lax would allow this one",
  );
  assert.equal(req({ origin: "null" }), false, "sandboxed frames send Origin: null");
  assert.equal(
    req({ secFetchSite: "cross-site" }),
    false,
    "a browser without Origin but cross-site",
  );
});

test("CSRF: reads and non-browser clients are not affected", () => {
  assert.equal(req({ method: "GET", origin: "https://evil.example" }), true);
  assert.equal(req({}), true, "no Origin and no Sec-Fetch-Site: not a browser, no ambient cookies");
});
