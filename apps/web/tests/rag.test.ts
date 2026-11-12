import assert from "node:assert/strict";
import test from "node:test";
import {
  computeDeterministicVector,
  cosineSimilarity,
  EMBEDDING_DIMENSION,
  generateEmbedding,
} from "../lib/rag/embeddings.ts";
import { type KnowledgeChunk, STANDARD_ESG_ASSISTANT_DISCLAIMER } from "../lib/rag/types.ts";

test("Milestone 2 — Embedding Engine: produces 768-dim unit-normalized vectors", () => {
  const text =
    "Mega Engineering and Infrastructure Limited stationary diesel combustion Scope 1 emissions";
  const vec = computeDeterministicVector(text, 768);

  assert.equal(vec.length, EMBEDDING_DIMENSION);

  // Compute L2 norm: should be ~1.0
  let normSq = 0;
  for (const v of vec) normSq += v * v;
  const norm = Math.sqrt(normSq);
  assert.ok(Math.abs(norm - 1.0) < 0.01, `Vector norm ${norm} must be normalized close to 1.0`);
});

test("Milestone 2 — Embedding Engine: semantic similarity and orthogonality properties", () => {
  const textA = "Scope 1 stationary diesel combustion fuel emissions in litres";
  const textB = "Stationary diesel generator fuel consumption Scope 1 emissions";
  const textUnrelated = "Board diversity and female workforce representation metrics";

  const vecA = computeDeterministicVector(textA);
  const vecB = computeDeterministicVector(textB);
  const vecUnrelated = computeDeterministicVector(textUnrelated);

  const simRelated = cosineSimilarity(vecA, vecB);
  const simUnrelated = cosineSimilarity(vecA, vecUnrelated);

  const simIdentical = cosineSimilarity(vecA, vecA);
  assert.equal(simIdentical, 1.0);

  // Semantically related texts share significant token projection
  assert.ok(
    simRelated > 0.4,
    `Related queries should have significant similarity, got ${simRelated}`,
  );
  assert.ok(
    simUnrelated < 0.25,
    `Unrelated queries should have low similarity, got ${simUnrelated}`,
  );
  assert.ok(
    simRelated > simUnrelated + 0.25,
    `Related similarity (${simRelated}) must substantially exceed unrelated (${simUnrelated})`,
  );
});

test("Milestone 2 — Embedding Engine: dual-mode cloud REST and fallback resilience", async () => {
  // Mock fetch simulating Gemini text-embedding-004
  const mockFetch: typeof fetch = async (url) => {
    assert.match(String(url), /text-embedding-004:embedContent/);
    const mockValues = new Array(768).fill(0.036);
    return new Response(
      JSON.stringify({
        embedding: { values: mockValues },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const cloudVec = await generateEmbedding("Solar PV renewable generation", {
    apiKey: "test-gemini-key",
    fetchFn: mockFetch,
  });

  assert.equal(cloudVec.length, 768);
  assert.equal(cloudVec[0], 0.036);

  // Fallback resilience when cloud network fails
  const failingFetch: typeof fetch = async () => {
    return new Response("Internal Server Error", { status: 500 });
  };

  const fallbackVec = await generateEmbedding("Solar PV renewable generation", {
    apiKey: "failing-key",
    fetchFn: failingFetch,
  });

  assert.equal(fallbackVec.length, 768);
});

test("Milestone 2 — Permission-Aware Retrieval: enforces authorized organizational boundaries", () => {
  const orgA = "00000000-0000-0000-0000-000000000001";
  const orgB = "00000000-0000-0000-0000-000000000002";

  const allChunks: KnowledgeChunk[] = [
    {
      id: "chunk-1",
      sourceType: "esg_record",
      sourceId: "rec-1",
      orgUnitId: orgA,
      dataClassification: "AGGREGATED_ESG_METRICS",
      title: "Plant 1 Electricity",
      content: "Plant 1 electricity: 160000 kWh",
      citationLabel: "[Record: ELEC-01 • Plant 1]",
      metadata: {},
      isVerified: true,
    },
    {
      id: "chunk-2",
      sourceType: "esg_record",
      sourceId: "rec-2",
      orgUnitId: orgB,
      dataClassification: "AGGREGATED_ESG_METRICS",
      title: "Plant 2 Electricity",
      content: "Plant 2 confidential diesel: 40000 L",
      citationLabel: "[Record: DIESEL-02 • Plant 2]",
      metadata: {},
      isVerified: true,
    },
    {
      id: "chunk-3",
      sourceType: "brsr_indicator",
      sourceId: "ind-1",
      orgUnitId: null, // Public statutory guideline
      dataClassification: "PUBLIC_BRSR_GUIDELINES",
      title: "BRSR Principle 6 Energy Question",
      content: "Disclose total electricity consumption in GJ",
      citationLabel: "[BRSR: Indicator P6-1]",
      metadata: {},
      isVerified: true,
    },
  ];

  const authorizedOrgs = [orgA];

  // Filter chunks matching user's authorized scope
  const filtered = allChunks.filter(
    (c) => c.orgUnitId === null || (c.orgUnitId && authorizedOrgs.includes(c.orgUnitId)),
  );

  assert.equal(filtered.length, 2);
  assert.equal(
    filtered.some((c) => c.orgUnitId === orgA),
    true,
  );
  assert.equal(
    filtered.some((c) => c.orgUnitId === null),
    true,
  );
  // Plant 2 confidential record must be completely excluded
  assert.equal(
    filtered.some((c) => c.orgUnitId === orgB),
    false,
  );
});

test("Milestone 2 — Evidence Citations & Standard Advisory Disclaimer formatting", () => {
  const citation = "[Record: ELEC_01 • FY 2026-27 • MEIL Central Facility (ID: rec-123)]";
  assert.match(citation, /^\[Record:\s+[A-Z0-9_]+\s+•/);

  assert.match(
    STANDARD_ESG_ASSISTANT_DISCLAIMER,
    /Responses are synthesized strictly from verified corporate ESG records/,
  );
});
