import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Database safety rule 1: No automatic or direct modification of verified ESG data by AI/Feature engines", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  const aiEngineServices = [
    "../lib/features/service.ts",
    "../lib/features/engine.ts",
    "../lib/rules/service.ts",
    "../lib/rules/engine.ts",
    "../lib/suggestions/service.ts",
    "../lib/suggestions/engine.ts",
    "../lib/risks/service.ts",
    "../lib/risks/engine.ts",
    "../lib/recommendations/service.ts",
    "../lib/recommendations/engine.ts",
  ];

  for (const file of aiEngineServices) {
    const code = read(file);
    // Asserts that no engine or service attempts to INSERT, UPDATE, DELETE, or TRUNCATE esg_records
    assert.doesNotMatch(
      code,
      /\b(insert\s+into\s+public\.esg_records|update\s+public\.esg_records|delete\s+from\s+public\.esg_records|truncate\s+public\.esg_records)\b/i,
      `Safety violation: ${file} must NEVER write to or alter public.esg_records!`,
    );
  }
});

test("Database safety rule 2: AI / LLM layer has ZERO direct database modification access", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  // Pure engines must have no connection to postgres, SQL queries or process.env
  const pureEngines = [
    "../lib/features/engine.ts",
    "../lib/rules/engine.ts",
    "../lib/suggestions/engine.ts",
    "../lib/risks/engine.ts",
    "../lib/recommendations/engine.ts",
    "../lib/chat/nim.ts",
  ];

  for (const file of pureEngines) {
    const code = read(file);
    assert.doesNotMatch(
      code,
      /\b(postgres|db\(|new\s+Function|eval\(|child_process)\b/i,
      `Safety violation: ${file} must remain pure with no direct DB execution or shell execution!`,
    );
  }
});

test("Database safety rule 3: AI recommendations and risk findings retain strict traceability to source records", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  // Rules engine must retain traceableRecordIds
  const rulesEngine = read("../lib/rules/engine.ts");
  assert.match(rulesEngine, /traceableRecordIds:\s*string\[\]/);

  // Rules service must query contributing verified records and persist them into audit evaluations
  const rulesService = read("../lib/rules/service.ts");
  assert.match(rulesService, /contributing_record_ids/);

  // Suggestions engine must retain targetFeature and triggeredByRuleCode
  const suggestionsEngine = read("../lib/suggestions/engine.ts");
  assert.match(suggestionsEngine, /triggeredByRuleCode:\s*string\s*\|\s*null/);
  assert.match(suggestionsEngine, /targetFeature:\s*string/);

  // Risk engine must retain contributingRecordIds and detectionMethod
  const risksEngine = read("../lib/risks/engine.ts");
  assert.match(risksEngine, /contributingRecordIds:\s*string\[\]/);
  assert.match(risksEngine, /detectionMethod:\s*string/);
});

test("Database safety rule 4: Separate migrations for AI functionality with RLS and organization-level isolation", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  const aiMigrations = [
    "../../../supabase/migrations/0047_decision_rules_engine.sql",
    "../../../supabase/migrations/0048_decarbonization_suggestions.sql",
    "../../../supabase/migrations/0049_risk_evaluations.sql",
    "../../../supabase/migrations/0050_database_safety_invariants.sql",
    "../../../supabase/migrations/0051_recommendation_engine_and_ranking.sql",
    "../../../supabase/migrations/0052_ai_security_and_privacy_architecture.sql",
    "../../../supabase/migrations/0053_pgvector_and_rag_indexes.sql",
  ];

  for (const mig of aiMigrations) {
    const sql = read(mig);
    // Asserts RLS is explicitly enabled
    assert.match(sql, /enable\s+row\s+level\s+security/i, `${mig} must enable row level security!`);
    // Asserts no existing foreign keys or core tables are dropped or broken
    assert.doesNotMatch(sql, /drop\s+table\s+public\.esg_records/i);
    assert.doesNotMatch(sql, /alter\s+table\s+public\.esg_records\s+drop\s+constraint/i);
  }

  // 0047 must enforce append-only evaluations
  const mig0047 = read("../../../supabase/migrations/0047_decision_rules_engine.sql");
  assert.match(mig0047, /prevent_decision_evaluations_change/);
  assert.match(mig0047, /before\s+update\s+or\s+delete\s+on\s+public\.decision_rule_evaluations/i);
  assert.match(mig0047, /before\s+truncate\s+on\s+public\.decision_rule_evaluations/i);

  // All AI tables must be isolated by org_unit_id
  const mig0048 = read("../../../supabase/migrations/0048_decarbonization_suggestions.sql");
  assert.match(mig0048, /org_unit_id\s+uuid\s+not\s+null\s+references\s+public\.org_units\(id\)/i);

  const mig0049 = read("../../../supabase/migrations/0049_risk_evaluations.sql");
  assert.match(mig0049, /org_unit_id\s+uuid\s+not\s+null\s+references\s+public\.org_units\(id\)/i);
});

test("Database safety rule 5: No changes to existing calculation formulas, units, or validation triggers", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  // Core calculation engine must remain untouched by AI/rules code
  const calcEngine = read("../lib/calculation/engine.ts");
  assert.doesNotMatch(calcEngine, /decision_rules|decarbonization_suggestions|risk_evaluations/);

  // Core validation engine checks must remain untouched
  const valChecks = read("../lib/validation/checks.ts");
  assert.doesNotMatch(valChecks, /decision_rules|decarbonization_suggestions|risk_evaluations/);
});
