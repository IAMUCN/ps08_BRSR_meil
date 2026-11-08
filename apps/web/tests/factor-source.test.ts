import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkLink,
  findCandidates,
  fyLabel,
  fyOf,
  fyRange,
  htmlToText,
  isPrivateAddress,
  officialHost,
  reliability,
} from "../lib/factors/source-text.ts";

// feature_enhancement.md Phase 6: the pure parts of reading a factor's source (lib/factors/source-text.ts).

const HOSTS = [
  { host: "cea.nic.in", publisher: "Central Electricity Authority" },
  { host: "ipcc-nggip.iges.or.jp", publisher: "IPCC NGGIP" },
];

test("private, loopback, link-local and reserved addresses are refused", () => {
  for (const a of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "not-an-address",
  ]) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ["164.100.1.1", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateAddress(a), false, a);
  }
});

test("only plain https links to a named site are accepted", () => {
  assert.equal(checkLink("https://cea.nic.in/report.pdf").ok, true);
  for (const bad of [
    "http://cea.nic.in/",
    "ftp://cea.nic.in/",
    "file:///etc/passwd",
    "https://user:pw@cea.nic.in/",
    "https://cea.nic.in:8443/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://localhost/",
    "javascript:alert(1)",
    "not a link",
  ]) {
    assert.equal(checkLink(bad).ok, false, bad);
  }
});

test("a link is official when its host or a parent domain is on the list", () => {
  assert.equal(
    officialHost("https://cea.nic.in/x", HOSTS)?.publisher,
    "Central Electricity Authority",
  );
  assert.equal(officialHost("https://www.cea.nic.in/x", HOSTS)?.host, "cea.nic.in");
  assert.equal(officialHost("https://CEA.NIC.IN/x", HOSTS)?.host, "cea.nic.in");
  // A look-alike name is not a subdomain.
  assert.equal(officialHost("https://fakecea.nic.in/x", HOSTS), null);
  assert.equal(officialHost("https://cea.nic.in.evil.example/x", HOSTS), null);
  assert.equal(officialHost("not a link", HOSTS), null);
  assert.equal(reliability("https://cea.nic.in/a", HOSTS), "official");
  assert.equal(reliability("https://example.org/a", HOSTS), "other");
  assert.equal(reliability(null, HOSTS), "none");
});

test("page text leaves out scripts and styles and decodes entities", () => {
  const text = htmlToText(
    "<html><head><style>p{color:red}</style><script>var x = 9.99;</script></head>" +
      "<body><p>Grid factor&nbsp;0.727 tCO<sub>2</sub>/MWh &amp; more</p><!-- 1.23 --></body></html>",
  );
  assert.match(text, /Grid factor 0\.727 tCO 2 \/MWh & more/);
  assert.doesNotMatch(text, /9\.99|1\.23|color/);
});

test("the number next to an emission unit and the activity's words comes first", () => {
  const text =
    "CO2 Baseline Database for the Indian Power Sector, Version 20, December 2024. Table 1: " +
    "Weighted average emission factor of the grid for FY 2023-24 is 0.727 tCO2/MWh. " +
    "Page 12 of 60. Installed capacity 446,190 MW. Build margin 0.88 tCO2/MWh.";
  const found = findCandidates(text, { metricUnit: "kWh", keywords: ["Grid Electricity"] });
  assert.equal(found[0].value, 0.727);
  assert.equal(found[0].unit, "tCO2/MWh");
  assert.ok(found.some((c) => c.value === 0.88));
  // Years, page numbers and plain counts are not offered.
  assert.ok(!found.some((c) => [2024, 2023, 20, 12, 60, 446190].includes(c.value)));
  assert.ok(found.every((c) => c.context.includes(c.printed)));
});

test("a page with no factor-looking numbers offers nothing, and at most 25 are offered", () => {
  assert.deepEqual(
    findCandidates("Annual report 2024. Page 3.", { metricUnit: "L", keywords: [] }),
    [],
  );
  const many = Array.from({ length: 60 }, (_, i) => `value ${i}.5 kgCO2e/L`).join(". ");
  assert.equal(findCandidates(many, { metricUnit: "L", keywords: ["diesel"] }).length, 25);
});

test("Indian financial years run from 1 April to 31 March", () => {
  assert.equal(fyLabel(2025), "2025-26");
  assert.equal(fyLabel(2099), "2099-00");
  assert.equal(fyOf("2026-03-31"), 2025);
  assert.equal(fyOf("2026-04-01"), 2026);
  assert.deepEqual(fyRange("2025-26"), { from: "2025-04-01", to: "2026-03-31", start: 2025 });
  assert.equal(fyRange("2025-27"), null);
  assert.equal(fyRange("25-26"), null);
});
