import { z } from "zod";
import type { DataClassification } from "../ai-gateway/types.ts";

export type KnowledgeSourceType =
  "esg_record" | "document" | "brsr_indicator" | "calculation" | "decision_rule";

export type KnowledgeChunk = {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  orgUnitId?: string | null;
  reportingPeriodId?: string | null;
  dataClassification: DataClassification;
  title: string;
  content: string;
  citationLabel: string;
  metadata: Record<string, unknown>;
  isVerified: boolean;
  embedding?: number[];
  createdAt?: string;
};

export type HybridSearchResult = {
  id: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  orgUnitId: string | null;
  reportingPeriodId: string | null;
  dataClassification: DataClassification;
  title: string;
  content: string;
  citationLabel: string;
  metadata: Record<string, unknown>;
  isVerified: boolean;
  similarity: number;
  textRank: number;
  combinedScore: number;
};

export type EvidenceCitation = {
  citationLabel: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  title: string;
  confidence: number;
};

export const STANDARD_ESG_ASSISTANT_DISCLAIMER =
  "Responses are synthesized strictly from verified corporate ESG records and statutory SEBI BRSR guidelines. This advisory does not establish regulatory non-compliance or replace certified third-party assurance.";

export type EsgAssistantAnswer = {
  answer: string;
  citations: EvidenceCitation[];
  contributingRecordIds: string[];
  contributingDocIds: string[];
  confidence: "high" | "medium" | "low";
  dataClassificationUsed: DataClassification;
  providerId: string;
  model: string;
  latencyMs: number;
  disclaimer: string;
};
