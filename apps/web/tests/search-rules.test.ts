import assert from "node:assert/strict";
import { test } from "node:test";
import {
  likePattern,
  matchPages,
  orderFor,
  scopeWords,
  searchTerms,
  sectionsFor,
} from "../lib/search/rules.ts";

// feature_enhancement.md 8.3 (requirement 19): the top-bar search's rules (lib/search/rules.ts).

test("a query is its distinct words; under two characters nothing is searched", () => {
  assert.equal(searchTerms(""), null);
  assert.equal(searchTerms(" a "), null);
  assert.deepEqual(searchTerms("  Diesel   Project  X diesel "), ["diesel", "project", "x"]);
  assert.equal(searchTerms("x".repeat(300))![0].length, 100);
  assert.equal(searchTerms("a b c d e f g h")!.length, 6);
});

test("%, _ and backslash in a word are matched literally", () => {
  assert.equal(likePattern("50%"), "%50\\%%");
  assert.equal(likePattern("a_b"), "%a\\_b%");
  assert.equal(likePattern("c:\\x"), "%c:\\\\x%");
});

test("each section is searched only for those who may open its page", () => {
  const pm = sectionsFor({ isAdmin: false, isOrgAdmin: false, permissions: ["report.generate"] });
  assert.deepEqual(pm, ["pages", "records", "audit"]);
  const orgAdmin = sectionsFor({ isAdmin: false, isOrgAdmin: true, permissions: [] });
  assert.deepEqual(orgAdmin, ["pages", "records", "people", "units", "audit"]);
  const superAdmin = sectionsFor({
    isAdmin: true,
    isOrgAdmin: false,
    permissions: ["report.generate"],
  });
  assert.deepEqual(superAdmin, ["pages", "records", "people", "units", "reports", "audit"]);
});

test("the scope is said plainly for each kind of person", () => {
  assert.equal(scopeWords("records", false, false), "records you submitted");
  assert.equal(scopeWords("records", true, false), "records in the units you administer");
  assert.equal(scopeWords("people", true, true), "people in every org unit");
  assert.equal(scopeWords("audit", false, false), "your own activity");
});

test("the section of the current page comes first", () => {
  const all = sectionsFor({ isAdmin: true, isOrgAdmin: false, permissions: ["report.generate"] });
  assert.equal(orderFor("/admin/users", all)[0], "people");
  assert.equal(orderFor("/admin/organization", all)[0], "units");
  assert.equal(orderFor("/admin/reports/abc", all)[0], "reports");
  assert.equal(orderFor("/app/activity", all)[0], "audit");
  assert.equal(orderFor("/admin/scope-2", all)[0], "records");
  assert.deepEqual(orderFor("/admin", all), all);
  // A section the caller does not have is never added by the page they are on.
  const pm = sectionsFor({ isAdmin: false, isOrgAdmin: false, permissions: [] });
  assert.deepEqual(orderFor("/admin/users", pm), pm);
});

test("pages match on every word of their name", () => {
  const items = [
    { href: "/admin/scope-1", label: "Scope 1" },
    { href: "/admin/carbon-analytics", label: "Carbon Analytics" },
  ];
  assert.deepEqual(
    matchPages(items, ["carbon"]).map((h) => h.href),
    ["/admin/carbon-analytics"],
  );
  assert.deepEqual(
    matchPages(items, ["scope", "1"]).map((h) => h.href),
    ["/admin/scope-1"],
  );
  assert.deepEqual(matchPages(items, ["scope", "carbon"]), []);
});
