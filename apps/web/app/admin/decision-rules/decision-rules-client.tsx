"use client";

import { useState, useTransition } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  History,
  Plus,
  RefreshCw,
  ExternalLink,
  Info,
  Clock,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Leaf,
  ChevronRight,
  Zap,
  AlertOctagon,
  Target,
  Scale,
  SlidersHorizontal,
  Bot,
  Search,
  Database,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DecisionRule,
  RuleCategory,
  RuleOperator,
  RuleSeverity,
  RuleEvaluationSummary,
} from "@/lib/rules/engine";
import type {
  StrategicRoadmap,
  DecarbonizationSuggestion,
  SuggestionCategory,
  SuggestionPriority,
  InvestmentTier,
} from "@/lib/suggestions/engine";
import type { SuggestionStatus } from "@/lib/suggestions/service";
import type { RiskAssessmentReport, CategoryRiskAssessment } from "@/lib/risks/engine";
import type {
  Recommendation,
  RecommendationsReport,
  RecommendationCategory,
  RecommendationPriority,
  RankingWeights,
} from "@/lib/recommendations/engine";
import type { EsgAssistantAnswer, EvidenceCitation } from "@/lib/rag/types";
import {
  createRuleAction,
  updateRuleAction,
  evaluateRulesAction,
  getAuditHistoryAction,
  listRulesAction,
  getRoadmapAction,
  generateRoadmapAction,
  updateSuggestionStatusAction,
  getRiskReportAction,
  evaluateRisksAction,
  getRecommendationsAction,
  generateRecommendationsAction,
  updateRecommendationStatusAction,
  askEsgAssistantAction,
  searchEvidenceAction,
  reindexKnowledgeBaseAction,
  getKnowledgeStatsAction,
} from "./actions";
import { PredictiveTab } from "./components/predictive-tab";
import { SimulatorTab } from "./components/simulator-tab";

type Props = {
  initialRules: DecisionRule[];
  orgUnits: Array<{ id: string; name: string; code: string }>;
  periods: Array<{ id: string; label: string; start_date: string }>;
};

export default function DecisionRulesClient({ initialRules, orgUnits, periods }: Props) {
  const [activeTab, setActiveTab] = useState<
    | "rules"
    | "evaluation"
    | "risks"
    | "recommendations"
    | "roadmap"
    | "predictive"
    | "simulator"
    | "assistant"
    | "audit"
  >("rules");
  const [rules, setRules] = useState<DecisionRule[]>(initialRules);
  const [isPending, startTransition] = useTransition();

  // Assistant (RAG) state
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState<EsgAssistantAnswer | null>(null);
  const [assistantProvider, setAssistantProvider] = useState<
    "gemini" | "groq" | "nvidia_nim" | undefined
  >(undefined);
  const [isAsking, setIsAsking] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<Array<{
    source_type: string;
    data_classification: string;
    count: number | string;
  }> | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);
  const [selectedCitationModal, setSelectedCitationModal] = useState<EvidenceCitation | null>(null);

  // Evaluation state
  const [selectedUnit, setSelectedUnit] = useState(orgUnits[0]?.id ?? "");
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.id ?? "");
  const [evalSummary, setEvalSummary] = useState<RuleEvaluationSummary | null>(null);

  // Risk Engine state
  const [riskReport, setRiskReport] = useState<RiskAssessmentReport | null>(null);

  // Ranked Recommendations state
  const [recsReport, setRecsReport] = useState<RecommendationsReport | null>(null);
  const [rankingWeights, setRankingWeights] = useState<RankingWeights>({
    impact: 0.35,
    urgency: 0.25,
    feasibility: 0.2,
    confidence: 0.2,
  });
  const [showWeightCalibrator, setShowWeightCalibrator] = useState(false);
  const [selectedRecCategoryFilter, setSelectedRecCategoryFilter] = useState<string>("ALL");

  // Roadmap & Suggestion state
  const [roadmap, setRoadmap] = useState<StrategicRoadmap | null>(null);
  const [shadowPrice, setShadowPrice] = useState<number>(2000);
  const [useAi, setUseAi] = useState<boolean>(true);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");

  // Audit state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Modals
  const [isTuneOpen, setIsTuneOpen] = useState(false);
  const [activeRuleForTune, setActiveRuleForTune] = useState<DecisionRule | null>(null);
  const [newThreshold, setNewThreshold] = useState<number>(0);
  const [newTemplate, setNewTemplate] = useState<string>("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: "RULE_CUSTOM_THRESHOLD",
    name: "Custom Growth Threshold Guard",
    description: "Monitors operational parameter growth threshold.",
    category: "ENERGY" as RuleCategory,
    severity: "WARNING" as RuleSeverity,
    targetFeature: "electricity_growth",
    operator: ">" as RuleOperator,
    thresholdValue: 0.15,
    advisoryMessageTemplate:
      "Parameter grew by {actual_pct}, exceeding threshold of {threshold_pct}.",
  });

  const refreshRules = () => {
    startTransition(async () => {
      const res = await listRulesAction();
      if (res.ok && res.data) {
        setRules(res.data);
      }
    });
  };

  const handleTuneSubmit = () => {
    if (!activeRuleForTune) return;
    startTransition(async () => {
      const res = await updateRuleAction({
        ruleId: activeRuleForTune.id,
        thresholdValue: Number(newThreshold),
        advisoryMessageTemplate: newTemplate,
      });
      if (res.ok) {
        setIsTuneOpen(false);
        refreshRules();
      } else {
        alert(res.error || "Failed to update rule");
      }
    });
  };

  const handleCreateSubmit = () => {
    startTransition(async () => {
      const res = await createRuleAction(createForm);
      if (res.ok) {
        setIsCreateOpen(false);
        refreshRules();
      } else {
        alert(res.error || "Failed to create rule");
      }
    });
  };

  const handleRunEvaluation = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await evaluateRulesAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
      });
      if (res.ok) {
        setEvalSummary(res.data);
      } else {
        alert(res.error || "Evaluation failed");
      }
    });
  };

  const handleLoadAudit = () => {
    if (!selectedUnit) return;
    startTransition(async () => {
      const res = await getAuditHistoryAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod || undefined,
      });
      if (res.ok && res.data) {
        setAuditLogs(res.data);
      }
    });
  };

  const handleLoadRoadmap = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await getRoadmapAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
      });
      if (res.ok) {
        setRoadmap(res.data);
      } else {
        alert(res.error || "Failed to load roadmap");
      }
    });
  };

  const handleGenerateRoadmap = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await generateRoadmapAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
        useAi,
        shadowPricePerTco2e: shadowPrice,
      });
      if (res.ok) {
        setRoadmap(res.data);
      } else {
        alert(res.error || "Failed to generate roadmap");
      }
    });
  };

  const handleUpdateStatus = (suggestionDbId?: string, status: SuggestionStatus = "OPEN") => {
    if (!suggestionDbId) return;
    startTransition(async () => {
      const res = await updateSuggestionStatusAction({
        suggestionDbId,
        status,
      });
      if (res.ok) {
        setRoadmap((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            suggestions: prev.suggestions.map((s) =>
              s.dbId === suggestionDbId ? { ...s, status } : s,
            ),
          };
        });
      } else {
        alert(res.error || "Failed to update suggestion status");
      }
    });
  };

  const handleLoadRiskReport = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await getRiskReportAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
      });
      if (res.ok) {
        setRiskReport(res.data);
      } else {
        alert(res.error || "Failed to load risk report");
      }
    });
  };

  const handleRunRiskEvaluation = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await evaluateRisksAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
      });
      if (res.ok) {
        setRiskReport(res.data);
      } else {
        alert(res.error || "Failed to run risk evaluation");
      }
    });
  };

  const handleLoadRecommendations = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await getRecommendationsAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
        weights: rankingWeights,
      });
      if (res.ok) {
        setRecsReport(res.data);
      } else {
        alert(res.error || "Failed to load recommendations");
      }
    });
  };

  const handleGenerateRecommendations = () => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await generateRecommendationsAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
        weights: rankingWeights,
      });
      if (res.ok) {
        setRecsReport(res.data);
      } else {
        alert(res.error || "Failed to generate recommendations");
      }
    });
  };

  const handleUpdateRecStatus = (
    recId: string,
    status: "open" | "in_review" | "approved" | "implemented" | "dismissed",
  ) => {
    if (!selectedUnit || !selectedPeriod) return;
    startTransition(async () => {
      const res = await updateRecommendationStatusAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
        recommendationId: recId,
        status,
      });
      if (res.ok) {
        setRecsReport((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            recommendations: prev.recommendations.map((r) =>
              r.id === recId ? { ...r, status } : r,
            ),
          };
        });
      } else {
        alert(res.error || "Failed to update recommendation status");
      }
    });
  };

  const handleAskAssistant = (overrideQuery?: string) => {
    const q = (overrideQuery || assistantQuery).trim();
    if (!q || !selectedUnit) return;
    if (overrideQuery) setAssistantQuery(overrideQuery);

    setIsAsking(true);
    startTransition(async () => {
      const res = await askEsgAssistantAction({
        query: q,
        orgUnitId: selectedUnit,
        preferredProviderId: assistantProvider,
        maxEvidenceChunks: 5,
      });
      setIsAsking(false);
      if (res.ok) {
        setAssistantAnswer(res.data);
      } else {
        alert(res.error || "Failed to query ESG assistant");
      }
    });
  };

  const handleLoadKnowledgeStats = () => {
    startTransition(async () => {
      const res = await getKnowledgeStatsAction();
      if (res.ok) {
        setKnowledgeStats(res.data as any);
      }
    });
  };

  const handleReindexKnowledgeBase = () => {
    setIsReindexing(true);
    setReindexMessage(null);
    startTransition(async () => {
      const res = await reindexKnowledgeBaseAction({
        orgUnitId: selectedUnit || undefined,
        recordsLimit: 200,
        docsLimit: 200,
      });
      setIsReindexing(false);
      if (res.ok) {
        setReindexMessage(
          `Indexed ${res.data.indexedBrsrIndicators} BRSR indicators, ${res.data.indexedRecords} ESG records, and ${res.data.indexedDocuments} documents (${res.data.totalChunks} total) in ${(res.data.latencyMs / 1000).toFixed(1)}s.`,
        );
        handleLoadKnowledgeStats();
      } else {
        alert(res.error || "Failed to reindex knowledge base");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-border text-sm font-medium">
        <button
          onClick={() => setActiveTab("rules")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "rules"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Configurable Rules ({rules.filter((r) => r.status === "ACTIVE").length} Active)
        </button>

        <button
          onClick={() => {
            setActiveTab("evaluation");
            if (!evalSummary) handleRunEvaluation();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "evaluation"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Live Rule Evaluation & Alerts
        </button>

        <button
          onClick={() => {
            setActiveTab("risks");
            if (!riskReport) handleLoadRiskReport();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "risks"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertOctagon className="h-4 w-4 text-amber-500" />
          Multi-Vector Risk Engine
        </button>

        <button
          onClick={() => {
            setActiveTab("recommendations");
            if (!recsReport) handleLoadRecommendations();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "recommendations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="h-4 w-4 text-sky-500" />
          Ranked Recommendations
          {recsReport && (
            <Badge variant="secondary" className="ml-1 text-[10px] font-mono">
              {recsReport.recommendations.length}
            </Badge>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab("roadmap");
            if (!roadmap) handleLoadRoadmap();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "roadmap"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4 text-emerald-500" />
          Decarbonization Roadmap & AI Suggestions
        </button>

        <button
          onClick={() => setActiveTab("predictive")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "predictive"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <TrendingUp className="h-4 w-4 text-blue-500" />
          Predictive ML &amp; Anomaly Center
          <Badge
            variant="outline"
            className="ml-1 text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30 font-mono"
          >
            GBDT
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "simulator"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4 text-cyan-500" />
          What-If Scenario Simulator
          <Badge
            variant="outline"
            className="ml-1 text-[10px] bg-cyan-500/10 text-cyan-600 border-cyan-500/30 font-mono"
          >
            Multi-Vector
          </Badge>
        </button>

        <button
          onClick={() => {
            setActiveTab("assistant");
            if (!knowledgeStats) handleLoadKnowledgeStats();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "assistant"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="h-4 w-4 text-violet-500" />
          ESG Evidence Assistant (RAG)
          <Badge
            variant="outline"
            className="ml-1 text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/30 font-mono"
          >
            pgvector
          </Badge>
        </button>

        <button
          onClick={() => {
            setActiveTab("audit");
            handleLoadAudit();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 transition-colors ${
            activeTab === "audit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" />
          Immutable Audit Log
        </button>
      </div>

      {/* TAB 1: RULES INVENTORY & VERSIONING */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Operational Rule Inventory
              </h2>
              <p className="text-xs text-muted-foreground">
                All threshold adjustments create a new version and mark previous versions as
                superseded.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={refreshRules} disabled={isPending}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Rule
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            {rules.map((rule) => {
              const isActive = rule.status === "ACTIVE";
              return (
                <Card
                  key={rule.id}
                  className={`border transition-all ${
                    isActive
                      ? "border-border/80 bg-card hover:border-border"
                      : "border-border/40 bg-muted/20 opacity-70"
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {rule.code}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          v{rule.version}
                        </Badge>
                        <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
                          {rule.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            rule.severity === "CRITICAL_REVIEW"
                              ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
                              : rule.severity === "ACTION_REQUIRED"
                                ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                : "border-blue-500/30 text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          {rule.severity}
                        </Badge>
                      </div>

                      {isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setActiveRuleForTune(rule);
                            setNewThreshold(rule.thresholdValue);
                            setNewTemplate(rule.advisoryMessageTemplate);
                            setIsTuneOpen(true);
                          }}
                        >
                          <Sliders className="h-3 w-3 mr-1" />
                          Adjust Threshold
                        </Button>
                      )}
                    </div>
                    <CardTitle className="mt-1 text-sm font-semibold">{rule.name}</CardTitle>
                    <CardDescription className="text-xs">{rule.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-xs">
                    <div className="grid grid-cols-2 gap-4 rounded-md bg-muted/40 p-2.5 sm:grid-cols-4">
                      <div>
                        <span className="text-muted-foreground">Category:</span>
                        <div className="font-medium text-foreground">{rule.category}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Target Feature:</span>
                        <div className="font-mono text-foreground">{rule.targetFeature}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Threshold Trigger:</span>
                        <div className="font-mono font-semibold text-foreground">
                          {rule.operator} {rule.thresholdValue}
                          {rule.thresholdValue < 1
                            ? ` (${(rule.thresholdValue * 100).toFixed(1)}%)`
                            : ""}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Version Audit:</span>
                        <div className="text-muted-foreground">
                          {rule.updatedAt
                            ? new Date(rule.updatedAt).toLocaleDateString()
                            : rule.createdAt
                              ? new Date(rule.createdAt).toLocaleDateString()
                              : "Active"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs italic text-muted-foreground">
                      Template: &ldquo;{rule.advisoryMessageTemplate}&rdquo;
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE RULE EVALUATION & ALERTS */}
      {activeTab === "evaluation" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 max-w-xl">
                <div>
                  <Label className="text-xs">Organization Unit</Label>
                  <NativeSelect
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="mt-1"
                  >
                    {orgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div>
                  <Label className="text-xs">Reporting Period</Label>
                  <NativeSelect
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="mt-1"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <Button onClick={handleRunEvaluation} disabled={isPending}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
                Evaluate Active Rules
              </Button>
            </div>
          </Card>

          {evalSummary && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Rules Evaluated</div>
                  <div className="mt-1 text-2xl font-bold">{evalSummary.rulesEvaluated}</div>
                </Card>

                <Card className="p-3 border-amber-500/20 bg-amber-500/5">
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    Triggered Thresholds
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-300">
                    {evalSummary.triggeredCount}
                  </div>
                </Card>

                <Card className="p-3 border-rose-500/20 bg-rose-500/5">
                  <div className="text-xs text-rose-700 dark:text-rose-400">Critical Reviews</div>
                  <div className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-300">
                    {evalSummary.bySeverity.CRITICAL_REVIEW}
                  </div>
                </Card>

                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Clean Baselines</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {evalSummary.rulesEvaluated - evalSummary.triggeredCount}
                  </div>
                </Card>
              </div>

              {/* Evaluation Results List */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Rule Findings & Diagnostic Traces
                </h3>

                {evalSummary.results.map((res) => {
                  return (
                    <Card
                      key={res.ruleId}
                      className={`border p-4 transition-all ${
                        res.triggered
                          ? res.severity === "CRITICAL_REVIEW"
                            ? "border-rose-500/30 bg-rose-500/5"
                            : "border-amber-500/30 bg-amber-500/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {res.triggered ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span className="font-semibold text-sm">{res.ruleName}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            ({res.ruleCode} v{res.ruleVersion})
                          </span>
                          <Badge
                            variant={res.triggered ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {res.triggered ? "TRIGGERED" : "NORMAL"}
                          </Badge>
                        </div>

                        <div className="text-xs font-mono text-muted-foreground">
                          Observed:{" "}
                          <span className="font-bold text-foreground">
                            {res.observedValue !== null ? res.observedValue : "None"}
                          </span>{" "}
                          | Threshold: {res.operator} {res.thresholdValue}
                        </div>
                      </div>

                      <div className="mt-2 text-sm text-foreground">{res.advisoryMessage}</div>

                      {/* Required Disclaimer */}
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/50 rounded p-1.5 border border-border/50">
                        <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span>{res.disclaimer}</span>
                      </div>

                      {/* Traceability to input records */}
                      {res.traceableRecordIds.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          <span>
                            Traceable to {res.traceableRecordIds.length} verified input records for
                            this period.
                          </span>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: IMMUTABLE AUDIT RECEIPTS */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Evaluation Audit History</h3>
              <p className="text-xs text-muted-foreground">
                Append-only execution receipts stored in PostgreSQL with input record snapshots.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLoadAudit} disabled={isPending}>
              <RefreshCw className={`h-3 w-3 mr-1 ${isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="rounded-md border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Rule Code</th>
                    <th className="p-3">Version</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Observed</th>
                    <th className="p-3">Threshold</th>
                    <th className="p-3">Advisory Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-muted-foreground">
                        No evaluation audit receipts found. Run an evaluation from the evaluation
                        tab.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="p-3 font-mono text-muted-foreground">
                          {new Date(log.evaluated_at).toLocaleString()}
                        </td>
                        <td className="p-3 font-mono font-medium">{log.rule_code}</td>
                        <td className="p-3 font-mono">v{log.rule_version}</td>
                        <td className="p-3">
                          <Badge
                            variant={log.triggered ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            {log.triggered ? "TRIGGERED" : "PASS"}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono">{log.observed_feature_value ?? "—"}</td>
                        <td className="p-3 font-mono">{log.threshold_value}</td>
                        <td className="p-3 max-w-xs truncate text-muted-foreground">
                          {log.advisory_message}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: MULTI-VECTOR RISK ENGINE */}
      {activeTab === "risks" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <Card className="p-4 border-border">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 max-w-xl">
                <div>
                  <Label className="text-xs">Organization Unit</Label>
                  <NativeSelect
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {orgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div>
                  <Label className="text-xs">Reporting Period</Label>
                  <NativeSelect
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadRiskReport}
                  disabled={isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={handleRunRiskEvaluation} disabled={isPending}>
                  <AlertOctagon className="h-3.5 w-3.5 mr-1 text-amber-300" />
                  {isPending ? "Evaluating Risks..." : "Run Risk Assessment"}
                </Button>
              </div>
            </div>
          </Card>

          {!riskReport ? (
            <Card className="p-8 text-center border-dashed border-border">
              <AlertOctagon className="mx-auto h-8 w-8 text-amber-500 mb-2 opacity-80" />
              <h3 className="text-sm font-semibold text-foreground">No Risk Assessment Found</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Execute a comprehensive risk assessment evaluating all 6 risk vectors: Emissions
                increase, Unusual consumption, Missing BRSR evidence, Duplicate invoices, Incomplete
                reporting, and Unusual water usage.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={handleRunRiskEvaluation}
                disabled={isPending}
              >
                <AlertOctagon className="h-3.5 w-3.5 mr-1" />
                Run Risk Assessment
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Executive Summary Card */}
              <Card
                className={`p-4 border ${
                  riskReport.overallRiskLevel === "CRITICAL"
                    ? "border-rose-500/40 bg-rose-500/5"
                    : riskReport.overallRiskLevel === "HIGH"
                      ? "border-amber-500/40 bg-amber-500/5"
                      : riskReport.overallRiskLevel === "MEDIUM"
                        ? "border-yellow-500/40 bg-yellow-500/5"
                        : "border-emerald-500/30 bg-emerald-500/5"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <AlertOctagon
                      className={`h-4 w-4 ${
                        riskReport.overallRiskLevel === "CRITICAL"
                          ? "text-rose-500"
                          : riskReport.overallRiskLevel === "HIGH"
                            ? "text-amber-500"
                            : "text-emerald-500"
                      }`}
                    />
                    <span className="text-sm font-semibold text-foreground">
                      Executive Risk Assessment Summary
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs font-bold font-mono ${
                        riskReport.overallRiskLevel === "CRITICAL"
                          ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
                          : riskReport.overallRiskLevel === "HIGH"
                            ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                            : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {riskReport.overallRiskLevel} RISK ({riskReport.overallRiskScore}/100)
                    </Badge>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-foreground/90">
                  {riskReport.executiveSummary.split("Audit Disclaimer:")[0]}
                </p>
              </Card>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Aggregate Risk Score</div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {riskReport.overallRiskScore}
                    <span className="text-xs font-normal text-muted-foreground ml-1">/ 100</span>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Risk Classification</div>
                  <div
                    className={`mt-1 text-2xl font-bold font-mono ${
                      riskReport.overallRiskLevel === "CRITICAL"
                        ? "text-rose-600 dark:text-rose-400"
                        : riskReport.overallRiskLevel === "HIGH"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {riskReport.overallRiskLevel}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">High / Critical Vectors</div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {riskReport.highOrCriticalCount}
                    <span className="text-xs font-normal text-muted-foreground ml-1">of 6</span>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Subsystems Integrated</div>
                  <div className="mt-1 text-xs font-semibold text-foreground">
                    Validation • BRSR • Submissions
                  </div>
                </Card>
              </div>

              {/* 6 Category Risk Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {riskReport.assessmentsList.map((item) => {
                  const isCrit = item.level === "CRITICAL";
                  const isHigh = item.level === "HIGH";
                  const isMed = item.level === "MEDIUM";

                  return (
                    <Card
                      key={item.category}
                      className={`border p-4 transition-all ${
                        isCrit
                          ? "border-rose-500/40 bg-rose-500/5"
                          : isHigh
                            ? "border-amber-500/30 bg-amber-500/5"
                            : isMed
                              ? "border-yellow-500/20 bg-yellow-500/5"
                              : "border-border bg-card"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {item.categoryLabel}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                isCrit
                                  ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
                                  : isHigh
                                    ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                    : isMed
                                      ? "border-yellow-500/30 text-yellow-600 dark:text-yellow-400"
                                      : "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {item.level} ({item.score}/100)
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            Method: <strong>{item.detectionMethod}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Findings list */}
                      <div className="mt-2 space-y-1">
                        <span className="text-[11px] font-semibold text-foreground block">
                          Detection Findings:
                        </span>
                        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                          {item.findings.map((f, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Remediation */}
                      <div className="mt-3 text-[11px] bg-muted/30 p-2 rounded border border-border/50">
                        <span className="font-semibold text-foreground mr-1">Remediation:</span>
                        <span className="text-muted-foreground">{item.recommendedRemediation}</span>
                      </div>

                      {/* Contributing records count */}
                      {item.contributingRecordIds.length > 0 && (
                        <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                          Traceable to {item.contributingRecordIds.length} flagged validation
                          records.
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Master Disclaimer */}
              <div className="rounded border border-border/50 bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
                <strong>Internal Audit Disclaimer:</strong> {riskReport.disclaimer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: TRANSPARENT RANKED RECOMMENDATIONS */}
      {activeTab === "recommendations" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <Card className="p-4 border-border">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <Label className="text-xs">Organization Unit</Label>
                  <NativeSelect
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {orgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div>
                  <Label className="text-xs">Reporting Period</Label>
                  <NativeSelect
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="pt-5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWeightCalibrator(!showWeightCalibrator)}
                    className="text-xs"
                  >
                    <Scale className="h-3.5 w-3.5 mr-1 text-sky-500" />
                    {showWeightCalibrator ? "Hide Weight Calibrator" : "Expert Weight Calibrator"}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadRecommendations}
                  disabled={isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={handleGenerateRecommendations} disabled={isPending}>
                  <Target className="h-3.5 w-3.5 mr-1 text-sky-300" />
                  {isPending ? "Evaluating Recommendations..." : "Run Recommendation Engine"}
                </Button>
              </div>
            </div>
          </Card>

          {/* Domain Expert Weight Calibration Drawer / Card */}
          {showWeightCalibrator && (
            <Card className="border-sky-500/30 bg-sky-500/5 p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-semibold text-sm">
                    <Scale className="h-4 w-4" />
                    Domain Expert Weight Calibration Panel
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Calibrate the transparent scoring formula weights. All component scores ($I, U,
                    F, D$) are normalized to 0–100.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-sky-500/30 text-sky-600 dark:text-sky-400 font-mono text-[11px]"
                  >
                    Formula: Score = 0.35I + 0.25U + 0.20F + 0.20D
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() =>
                      setRankingWeights({
                        impact: 0.35,
                        urgency: 0.25,
                        feasibility: 0.2,
                        confidence: 0.2,
                      })
                    }
                  >
                    Reset Defaults
                  </Button>
                </div>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-background/60 p-3 rounded-lg border border-border/50">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="font-semibold text-foreground">Impact Weight (I)</Label>
                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                      {(rankingWeights.impact * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rankingWeights.impact}
                    onChange={(e) =>
                      setRankingWeights((prev) => ({
                        ...prev,
                        impact: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-2 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Potential emission or resource abatement
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="font-semibold text-foreground">Urgency Weight (U)</Label>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                      {(rankingWeights.urgency * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rankingWeights.urgency}
                    onChange={(e) =>
                      setRankingWeights((prev) => ({
                        ...prev,
                        urgency: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-2 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Threshold breaches & operational anomalies
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="font-semibold text-foreground">Feasibility Weight (F)</Label>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {(rankingWeights.feasibility * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rankingWeights.feasibility}
                    onChange={(e) =>
                      setRankingWeights((prev) => ({
                        ...prev,
                        feasibility: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-2 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Operational friction & deployment barrier
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="font-semibold text-foreground">Confidence Weight (D)</Label>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {(rankingWeights.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rankingWeights.confidence}
                    onChange={(e) =>
                      setRankingWeights((prev) => ({
                        ...prev,
                        confidence: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-2 cursor-pointer"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Evidence completeness & verification level
                  </span>
                </div>
              </div>

              {/* Calibration Notice Box */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-muted/40 p-2.5 rounded border border-border/50">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                  <Info className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span>
                    <strong>Calibration Notice:</strong> These are proposed starting weights, not
                    scientifically validated ESG standards. Calibrate them with domain experts and
                    user feedback.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateRecommendations}
                  disabled={isPending}
                  className="h-7 text-xs"
                >
                  Apply & Re-Rank
                </Button>
              </div>
            </Card>
          )}

          {!recsReport ? (
            <Card className="p-8 text-center border-dashed border-border">
              <Target className="mx-auto h-8 w-8 text-sky-500 mb-2 opacity-80" />
              <h3 className="text-sm font-semibold text-foreground">
                No Recommendations Generated Yet
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Generate transparent, data-grounded recommendations ranked via the weighted scoring
                formula:
                <br />
                <strong className="font-mono">Score = 0.35I + 0.25U + 0.20F + 0.20D</strong>
                <br />
                All recommendations are traceable to verified ESG records. Financial savings and
                reductions are never fabricated.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={handleGenerateRecommendations}
                disabled={isPending}
              >
                <Target className="h-3.5 w-3.5 mr-1" />
                Run Recommendation Engine
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Executive KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Recommendations</span>
                    <Target className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {recsReport.totalCount}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">High / Critical Priority</span>
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    {
                      recsReport.recommendations.filter(
                        (r) => r.priority === "high" || r.priority === "critical",
                      ).length
                    }
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Highest Ranked Score</span>
                    <Scale className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {recsReport.recommendations[0]?.ranking.score.toFixed(1) ?? "0.0"}
                    <span className="text-xs font-normal text-muted-foreground ml-1">/ 100</span>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Data Invariant</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-1 text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    100% VERIFIED DATA
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Strict Database Safety Rules
                  </div>
                </Card>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground mr-1">Filter Category:</span>
                {[
                  "ALL",
                  "energy_efficiency",
                  "renewable_energy",
                  "fuel_and_fleet",
                  "materials_and_process",
                  "water_management",
                  "waste_management",
                  "data_governance",
                ].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedRecCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                      selectedRecCategoryFilter === cat
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cat === "ALL" ? "ALL" : cat.replace(/_/g, " ").toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Ranked Recommendation Cards Stack */}
              <div className="space-y-4">
                {recsReport.recommendations
                  .filter(
                    (r) =>
                      selectedRecCategoryFilter === "ALL" ||
                      r.category === selectedRecCategoryFilter,
                  )
                  .map((rec) => {
                    const isCrit = rec.priority === "critical";
                    const isHigh = rec.priority === "high";
                    const isMed = rec.priority === "medium";

                    return (
                      <Card
                        key={rec.id}
                        className={`border p-4 transition-all ${
                          isCrit
                            ? "border-rose-600/50 bg-rose-500/10"
                            : isHigh
                              ? "border-rose-500/40 bg-rose-500/5"
                              : isMed
                                ? "border-amber-500/30 bg-amber-500/5"
                                : "border-border bg-card"
                        }`}
                      >
                        {/* Header: Rank, Title, Badges, Status dropdown */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              className={`text-xs font-mono font-bold ${
                                rec.ranking.rank === 1
                                  ? "bg-amber-500 text-white"
                                  : rec.ranking.rank === 2
                                    ? "bg-slate-400 text-white"
                                    : "bg-muted text-foreground"
                              }`}
                            >
                              #{rec.ranking.rank}
                            </Badge>
                            <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                isCrit
                                  ? "border-rose-600/40 text-rose-700 dark:text-rose-300 font-bold"
                                  : isHigh
                                    ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
                                    : isMed
                                      ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                      : "border-slate-500/30 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {rec.priority.toUpperCase()} PRIORITY
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                              {rec.category.replace(/_/g, " ")}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              Confidence: {rec.confidence}
                            </Badge>
                            {rec.requires_approval && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-mono"
                              >
                                <ShieldAlert className="h-3 w-3 mr-1 inline" /> Approval Required
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Workflow:</Label>
                            <NativeSelect
                              value={rec.status ?? "open"}
                              onChange={(e) =>
                                handleUpdateRecStatus(
                                  rec.id,
                                  e.target.value as
                                    "open" | "in_review" | "approved" | "implemented" | "dismissed",
                                )
                              }
                              className="h-7 text-xs w-32 font-mono"
                            >
                              <option value="open">open</option>
                              <option value="in_review">in_review</option>
                              <option value="approved">approved</option>
                              <option value="implemented">implemented</option>
                              <option value="dismissed">dismissed</option>
                            </NativeSelect>
                          </div>
                        </div>

                        {/* Operational Reason */}
                        <div className="mt-2.5 text-xs text-foreground bg-muted/30 p-2.5 rounded border border-border/50">
                          <strong className="text-foreground">Operational Reason: </strong>
                          <span className="text-muted-foreground">{rec.reason}</span>
                        </div>

                        {/* Evidence IDs Traceability */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <Layers className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <span className="font-medium text-foreground">Traceable Evidence:</span>
                          {rec.evidence_ids.length > 0 ? (
                            rec.evidence_ids.map((id) => (
                              <Badge key={id} variant="secondary" className="font-mono text-[10px]">
                                {id}
                              </Badge>
                            ))
                          ) : (
                            <span className="italic text-[11px]">
                              Synthesized from verified organizational baseline features
                            </span>
                          )}
                        </div>

                        {/* Grounding & Anti-Hallucination Guardrail */}
                        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            <span className="flex items-center gap-1">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              ESG Grounding & Database Safety Rule Enforcement
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[9px] border-amber-500/30 font-mono"
                            >
                              No Fabricated Financials
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-muted-foreground">Expected Impact:</span>{" "}
                              <span className="font-mono font-semibold text-foreground">
                                {rec.expected_impact === null
                                  ? `null (${rec.impact_unit})`
                                  : `${rec.expected_impact} ${rec.impact_unit}`}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Estimated Cost:</span>{" "}
                              <span className="font-mono font-semibold text-foreground">
                                {rec.estimated_cost === null
                                  ? "null (not_estimated)"
                                  : `₹${rec.estimated_cost.toLocaleString()}`}
                              </span>
                            </div>
                          </div>

                          {rec.missing_inputs_explanation && (
                            <div className="mt-1 text-[11px] text-muted-foreground italic bg-background/50 p-1.5 rounded border border-border/40">
                              <span className="font-semibold text-foreground not-italic mr-1">
                                Missing Inputs:
                              </span>
                              {rec.missing_inputs_explanation}
                            </div>
                          )}
                        </div>

                        {/* Transparent Weighted Score Breakdown */}
                        <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3 text-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                            <span className="font-semibold text-foreground flex items-center gap-1">
                              <Scale className="h-3.5 w-3.5 text-sky-500" />
                              Transparent Weighted Score Breakdown:
                            </span>
                            <Badge
                              variant="outline"
                              className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 border-sky-500/30"
                            >
                              Composite Score: {rec.ranking.score.toFixed(1)} / 100
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                            <div className="bg-background/80 p-2 rounded border border-border/40">
                              <span className="text-muted-foreground block text-[10px]">
                                Impact (I • {(rec.ranking.weights.impact * 100).toFixed(0)}%)
                              </span>
                              <span className="font-mono font-bold text-foreground text-sm">
                                {rec.ranking.components.impact}
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  /100
                                </span>
                              </span>
                            </div>
                            <div className="bg-background/80 p-2 rounded border border-border/40">
                              <span className="text-muted-foreground block text-[10px]">
                                Urgency (U • {(rec.ranking.weights.urgency * 100).toFixed(0)}%)
                              </span>
                              <span className="font-mono font-bold text-foreground text-sm">
                                {rec.ranking.components.urgency}
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  /100
                                </span>
                              </span>
                            </div>
                            <div className="bg-background/80 p-2 rounded border border-border/40">
                              <span className="text-muted-foreground block text-[10px]">
                                Feasibility (F •{" "}
                                {(rec.ranking.weights.feasibility * 100).toFixed(0)}%)
                              </span>
                              <span className="font-mono font-bold text-foreground text-sm">
                                {rec.ranking.components.feasibility}
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  /100
                                </span>
                              </span>
                            </div>
                            <div className="bg-background/80 p-2 rounded border border-border/40">
                              <span className="text-muted-foreground block text-[10px]">
                                Confidence (D • {(rec.ranking.weights.confidence * 100).toFixed(0)}
                                %)
                              </span>
                              <span className="font-mono font-bold text-foreground text-sm">
                                {rec.ranking.components.confidence}
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  /100
                                </span>
                              </span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-muted/80 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-sky-500 h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(0, rec.ranking.score))}%`,
                              }}
                            />
                          </div>

                          <div className="text-[10px] font-mono text-muted-foreground text-right">
                            Calculation: Score = {rec.ranking.weights.impact.toFixed(2)}I +{" "}
                            {rec.ranking.weights.urgency.toFixed(2)}U +{" "}
                            {rec.ranking.weights.feasibility.toFixed(2)}F +{" "}
                            {rec.ranking.weights.confidence.toFixed(2)}D
                          </div>
                        </div>

                        {/* Card Footer: Calibration Notice & Regulatory Disclaimer */}
                        <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <span className="italic">{rec.ranking.calibrationNote}</span>
                          <span className="italic">
                            Standard Disclaimer: Operational planning only; does not establish
                            regulatory non-compliance.
                          </span>
                        </div>
                      </Card>
                    );
                  })}
              </div>

              {/* Master Disclaimer Footer */}
              <div className="rounded border border-border/50 bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
                <strong>Standard Regulatory Disclaimer:</strong> {recsReport.calibrationDisclaimer}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: DECARBONIZATION ROADMAP & AI SUGGESTIONS */}
      {activeTab === "roadmap" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <Card className="p-4 border-border">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <Label className="text-xs">Organization Unit</Label>
                  <NativeSelect
                    value={selectedUnit}
                    onChange={(e) => setSelectedUnit(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {orgUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div>
                  <Label className="text-xs">Reporting Period</Label>
                  <NativeSelect
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="mt-1 text-xs"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div>
                  <Label className="text-xs">Shadow Carbon Price (₹/tCO2e)</Label>
                  <Input
                    type="number"
                    step="100"
                    value={shadowPrice}
                    onChange={(e) => setShadowPrice(parseFloat(e.target.value) || 2000)}
                    className="mt-1 w-28 font-mono text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="toggleAi"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <Label
                    htmlFor="toggleAi"
                    className="text-xs cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                    AI Rationale (NIM/Groq)
                  </Label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadRoadmap}
                  disabled={isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={handleGenerateRoadmap} disabled={isPending}>
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-emerald-300" />
                  {isPending ? "Evaluating AI Roadmap..." : "Generate AI Roadmap"}
                </Button>
              </div>
            </div>
          </Card>

          {!roadmap ? (
            <Card className="p-8 text-center border-dashed border-border">
              <Sparkles className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
              <h3 className="text-sm font-semibold text-foreground">
                No Decarbonization Roadmap Generated
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Generate a data-driven decarbonization roadmap for the selected facility and period.
                The engine will evaluate verified features and active decision rules, calculating
                carbon-adjusted payback and prioritized action steps.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={handleGenerateRoadmap}
                disabled={isPending}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Generate Strategic Roadmap
              </Button>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* AI Strategic Rationale Banner */}
              {roadmap.aiRationale && (
                <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                      <Sparkles className="h-4 w-4" />
                      Executive Decarbonization Advisory (NIM LLM Synthesis)
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 font-mono"
                    >
                      Verified Data Input Only
                    </Badge>
                  </div>
                  <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap font-sans">
                    {roadmap.aiRationale}
                  </div>
                </Card>
              )}

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Abatement Potential</span>
                    <TrendingDown className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {roadmap.totalPotentialReductionTco2e.toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground ml-1">tCO2e</span>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Abatement Ratio</span>
                    <Leaf className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {roadmap.overallReductionPotentialPct}%
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Strategic Initiatives</span>
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-foreground">
                    {roadmap.totalSuggestions}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Critical Interventions</span>
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="mt-1 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    {roadmap.byPriority.CRITICAL}
                  </div>
                </Card>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground mr-1">Filter Domain:</span>
                {[
                  "ALL",
                  "RENEWABLE_POWER",
                  "ENERGY_EFFICIENCY",
                  "FLEET_AND_FUELS",
                  "PROCESS_AND_MATERIALS",
                  "WATER_CONSERVATION",
                  "CIRCULAR_WASTE",
                  "GOVERNANCE_DATA_QUALITY",
                ].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                      selectedCategoryFilter === cat
                        ? "bg-primary text-primary-foreground font-medium"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {cat.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {/* Suggestions Cards List */}
              <div className="space-y-4">
                {roadmap.suggestions
                  .filter(
                    (s) =>
                      selectedCategoryFilter === "ALL" || s.category === selectedCategoryFilter,
                  )
                  .map((s) => {
                    const isCritical = s.priority === "CRITICAL";
                    const isHigh = s.priority === "HIGH";

                    return (
                      <Card
                        key={s.id}
                        className={`border p-4 transition-all ${
                          isCritical
                            ? "border-rose-500/40 bg-rose-500/5"
                            : isHigh
                              ? "border-amber-500/30 bg-amber-500/5"
                              : "border-border bg-card"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-foreground">
                              {s.id}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                isCritical
                                  ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
                                  : isHigh
                                    ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                                    : "border-border text-muted-foreground"
                              }`}
                            >
                              {s.priority} PRIORITY
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {s.category.replace(/_/g, " ")}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {s.investmentTier.replace(/_/g, " ")}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <Label className="text-[11px] text-muted-foreground">
                              Workflow Status:
                            </Label>
                            <NativeSelect
                              value={s.status ?? "OPEN"}
                              onChange={(e) =>
                                handleUpdateStatus(s.dbId, e.target.value as SuggestionStatus)
                              }
                              className="text-xs h-7 py-0 font-medium"
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="IN_REVIEW">IN REVIEW</option>
                              <option value="ACCEPTED">ACCEPTED</option>
                              <option value="IMPLEMENTED">IMPLEMENTED</option>
                              <option value="DISMISSED">DISMISSED</option>
                            </NativeSelect>
                          </div>
                        </div>

                        <div className="mt-2">
                          <h4 className="text-sm font-semibold text-foreground">{s.title}</h4>
                          <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
                        </div>

                        {/* Metric Strip */}
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 rounded border border-border/60 bg-muted/30 p-2 text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px]">
                              Potential Abatement
                            </span>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {s.potentialEmissionSavingsTco2e > 0
                                ? `+${s.potentialEmissionSavingsTco2e} tCO2e (${s.potentialPercentageReduction}%)`
                                : "Assurance Governance"}
                            </span>
                          </div>

                          <div>
                            <span className="text-muted-foreground block text-[10px]">
                              Financial Payback
                            </span>
                            <span className="font-mono font-semibold">
                              {s.estimatedPaybackYears
                                ? `${s.estimatedPaybackYears} yrs`
                                : "Immediate / OpEx"}
                            </span>
                          </div>

                          <div>
                            <span className="text-muted-foreground block text-[10px]">
                              Carbon-Adjusted Payback
                            </span>
                            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {s.carbonAdjustedPaybackYears
                                ? `${s.carbonAdjustedPaybackYears} yrs (ICP ₹${shadowPrice})`
                                : "N/A"}
                            </span>
                          </div>

                          <div>
                            <span className="text-muted-foreground block text-[10px]">Horizon</span>
                            <span className="font-mono font-semibold">
                              {s.paybackHorizon.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>

                        {/* Action Steps */}
                        {s.actionSteps.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <span className="text-[11px] font-semibold text-foreground block">
                              Operational Implementation Protocol:
                            </span>
                            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5 pl-1">
                              {s.actionSteps.map((step, idx) => (
                                <li key={idx}>{step}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Technical Prerequisites */}
                        {s.technicalPrerequisites.length > 0 && (
                          <div className="mt-2 text-[11px] text-muted-foreground/90 bg-muted/20 p-2 rounded border border-border/40">
                            <span className="font-semibold text-foreground mr-1">
                              Engineering Prerequisites:
                            </span>
                            {s.technicalPrerequisites.join(" • ")}
                          </div>
                        )}

                        {/* Card Footer: Trigger & Mandatory Disclaimer */}
                        <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <div>
                            {s.triggeredByRuleCode ? (
                              <span>
                                Triggered by decision rule:{" "}
                                <strong className="font-mono">{s.triggeredByRuleCode}</strong>
                              </span>
                            ) : (
                              <span>Baseline operational intensity trigger</span>
                            )}
                          </div>
                          <span className="italic">{s.regulatoryDisclaimer}</span>
                        </div>
                      </Card>
                    );
                  })}
              </div>

              {/* Master Disclaimer */}
              <div className="rounded border border-border/50 bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
                <strong>Standard Regulatory Disclaimer:</strong>{" "}
                {roadmap.executiveSummary.split("Standard Disclaimer: ")[1] ||
                  "This recommendation is generated for operational planning and decarbonization strategy. It does not establish regulatory non-compliance."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PREDICTIVE CONSUMPTION INTELLIGENCE (GBDT) */}
      {activeTab === "predictive" && (
        <PredictiveTab
          orgUnits={orgUnits}
          periods={periods}
          selectedUnit={selectedUnit}
          selectedPeriod={selectedPeriod}
          onSelectUnit={setSelectedUnit}
          onSelectPeriod={setSelectedPeriod}
        />
      )}

      {/* TAB: WHAT-IF SCENARIO SIMULATOR (MULTI-VECTOR) */}
      {activeTab === "simulator" && (
        <SimulatorTab
          orgUnits={orgUnits}
          periods={periods}
          selectedUnit={selectedUnit}
          selectedPeriod={selectedPeriod}
          onSelectUnit={setSelectedUnit}
          onSelectPeriod={setSelectedPeriod}
        />
      )}

      {/* TAB: ESG EVIDENCE ASSISTANT (RAG) */}
      {activeTab === "assistant" && (
        <div className="space-y-6">
          {/* Header Card */}
          <Card className="border-border/80 bg-gradient-to-r from-violet-500/5 via-card to-sky-500/5">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-5 w-5 text-violet-500" />
                      TraceESG Intelligence & Grounded Evidence Assistant
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="text-xs font-mono bg-violet-500/10 text-violet-600 border-violet-500/30"
                    >
                      pgvector 768-dim HNSW
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Answers synthesized strictly from verified MEIL records, utility invoices, and
                    statutory SEBI BRSR guidelines with hybrid cosine + lexical search. Zero
                    hallucination guard enforced.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReindexKnowledgeBase}
                    disabled={isReindexing || isPending}
                    className="text-xs"
                  >
                    <Database
                      className={`h-3.5 w-3.5 mr-1.5 ${isReindexing ? "animate-spin text-violet-500" : ""}`}
                    />
                    {isReindexing ? "Indexing Vector DB..." : "Re-Index Vector DB"}
                  </Button>
                </div>
              </div>

              {/* Guarantees Badges */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Badge
                  variant="secondary"
                  className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Grounded in Verified Records Only
                </Badge>
                <Badge
                  variant="secondary"
                  className="gap-1 bg-sky-500/10 text-sky-600 border-sky-500/20"
                >
                  <Layers className="h-3 w-3" />
                  Minimal Field Projection (Golden Rule)
                </Badge>
                <Badge
                  variant="secondary"
                  className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/20"
                >
                  <ShieldAlert className="h-3 w-3" />
                  PII Masking & Prompt Injection Isolation
                </Badge>
                {knowledgeStats && knowledgeStats.length > 0 && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    Indexed: {knowledgeStats.map((k) => `${k.source_type}: ${k.count}`).join(" | ")}
                  </Badge>
                )}
              </div>

              {reindexMessage && (
                <div className="mt-3 p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
                  ✓ {reindexMessage}
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Inquiry Form Card */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                Ask an ESG or Statutory Compliance Inquiry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Query Suggestions */}
              <div>
                <Label className="text-xs text-muted-foreground block mb-1.5">
                  Frequently Verified Inquiries:
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "What are our Scope 1 and Scope 2 emissions and electricity trends?",
                    "Which SEBI BRSR Section A and C indicators are mandatory for infrastructure?",
                    "What verified evidence documents or invoices support our energy metrics?",
                    "What operational anomalies or data quality issues require review?",
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAskAssistant(preset)}
                      className="text-[11px] text-left px-2.5 py-1 rounded-md bg-muted/50 hover:bg-muted text-foreground border border-border/60 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inquiry Input */}
              <div className="space-y-2">
                <Label className="text-xs">Your Question</Label>
                <textarea
                  rows={3}
                  value={assistantQuery}
                  onChange={(e) => setAssistantQuery(e.target.value)}
                  placeholder="Ask anything about MEIL ESG performance, SEBI BRSR indicators, verified energy invoices, emissions, or audit checks..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Controls: Org Unit, Provider, Action */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Facility / Unit:</Label>
                    <NativeSelect
                      value={selectedUnit}
                      onChange={(e) => setSelectedUnit(e.target.value)}
                      className="w-48 text-xs"
                    >
                      {orgUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </NativeSelect>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">AI Provider:</Label>
                    <NativeSelect
                      value={assistantProvider || ""}
                      onChange={(e) =>
                        setAssistantProvider(
                          (e.target.value as "gemini" | "groq" | "nvidia_nim") || undefined,
                        )
                      }
                      className="w-44 text-xs"
                    >
                      <option value="">Auto-Route (Best Approved)</option>
                      <option value="gemini">Google Gemini 2.5 Flash</option>
                      <option value="groq">Groq Cloud LPU</option>
                      <option value="nvidia_nim">NVIDIA NIM Infrastructure</option>
                    </NativeSelect>
                  </div>
                </div>

                <Button
                  onClick={() => handleAskAssistant()}
                  disabled={isAsking || !assistantQuery.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5"
                >
                  <Bot className={`h-4 w-4 ${isAsking ? "animate-spin" : ""}`} />
                  {isAsking ? "Grounding in Evidence..." : "Query ESG Assistant"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Response Display */}
          {assistantAnswer && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <Card className="border-violet-500/30 bg-card shadow-sm">
                <CardHeader className="p-4 pb-2 border-b border-border/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        Grounded Synthesis
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          assistantAnswer.confidence === "high"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : assistantAnswer.confidence === "medium"
                              ? "bg-sky-500/10 text-sky-600 border-sky-500/30"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        }`}
                      >
                        Confidence: {assistantAnswer.confidence.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {assistantAnswer.model}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>Latency: {assistantAnswer.latencyMs}ms</span>
                      <span>•</span>
                      <span>Classification: {assistantAnswer.dataClassificationUsed}</span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Formatted Answer */}
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-foreground whitespace-pre-line bg-muted/20 p-3.5 rounded-md border border-border/50">
                    {assistantAnswer.answer}
                  </div>

                  {/* Evidence Citations */}
                  {assistantAnswer.citations.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Direct Evidence Citations ({assistantAnswer.citations.length} Grounded
                        Chunks):
                      </Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {assistantAnswer.citations.map((c, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedCitationModal(c)}
                            className="cursor-pointer p-2.5 rounded-md border border-border/70 hover:border-violet-500/60 bg-muted/10 hover:bg-violet-500/5 transition-all text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Badge
                                variant="outline"
                                className="font-mono text-[10px] bg-primary/5 text-primary"
                              >
                                {c.citationLabel}
                              </Badge>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                Match: {(c.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {c.title}
                            </p>
                            <span className="text-[10px] text-muted-foreground block font-mono">
                              Source: {c.sourceType} • ID: {c.sourceId.substring(0, 8)}...
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit Trail & Regulatory Notice */}
                  <div className="pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="italic flex items-center gap-1">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      {assistantAnswer.disclaimer}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] font-mono text-emerald-600 bg-emerald-500/5"
                    >
                      ✓ Audit Logged to public.audit_logs
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
      <Dialog open={isTuneOpen} onOpenChange={setIsTuneOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Adjust Rule Threshold (Create v{activeRuleForTune ? activeRuleForTune.version + 1 : 2}
              )
            </DialogTitle>
            <DialogDescription>
              Modifying this parameter will supersede version {activeRuleForTune?.version} and
              activate version {activeRuleForTune ? activeRuleForTune.version + 1 : 2} to maintain
              complete audit traceability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Rule Code</Label>
              <Input
                value={activeRuleForTune?.code ?? ""}
                disabled
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">
                Threshold Value ({activeRuleForTune?.operator} threshold)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={newThreshold}
                onChange={(e) => setNewThreshold(parseFloat(e.target.value))}
                className="mt-1 font-mono text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                For growth percentages, 0.15 represents 15%, 0.20 represents 20%.
              </span>
            </div>

            <div>
              <Label className="text-xs">Advisory Message Template</Label>
              <Input
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                className="mt-1 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Placeholders: &#123;actual_pct&#125;, &#123;threshold_pct&#125;, &#123;actual&#125;,
                &#123;threshold&#125;
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTuneOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTuneSubmit} disabled={isPending}>
              {isPending ? "Versioning..." : "Apply & Create New Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CREATE CUSTOM RULE */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Operational Decision Rule</DialogTitle>
            <DialogDescription>
              Define a new threshold guard evaluated against verified ESG features.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2 text-xs">
            <div className="col-span-2">
              <Label className="text-xs">Rule Code</Label>
              <Input
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                className="mt-1 font-mono text-xs"
              />
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Rule Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Category</Label>
              <NativeSelect
                value={createForm.category}
                onChange={(e) =>
                  setCreateForm({ ...createForm, category: e.target.value as RuleCategory })
                }
                className="mt-1"
              >
                <option value="ENERGY">ENERGY</option>
                <option value="EMISSIONS">EMISSIONS</option>
                <option value="WATER">WATER</option>
                <option value="WASTE">WASTE</option>
                <option value="INTENSITY">INTENSITY</option>
                <option value="DATA_QUALITY">DATA_QUALITY</option>
              </NativeSelect>
            </div>

            <div>
              <Label className="text-xs">Severity</Label>
              <NativeSelect
                value={createForm.severity}
                onChange={(e) =>
                  setCreateForm({ ...createForm, severity: e.target.value as RuleSeverity })
                }
                className="mt-1"
              >
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ACTION_REQUIRED">ACTION_REQUIRED</option>
                <option value="CRITICAL_REVIEW">CRITICAL_REVIEW</option>
              </NativeSelect>
            </div>

            <div>
              <Label className="text-xs">Target Feature</Label>
              <NativeSelect
                value={createForm.targetFeature}
                onChange={(e) => setCreateForm({ ...createForm, targetFeature: e.target.value })}
                className="mt-1"
              >
                <option value="electricity_growth">electricity_growth</option>
                <option value="renewable_share">renewable_share</option>
                <option value="emissions_growth">emissions_growth</option>
                <option value="water_consumption_growth">water_consumption_growth</option>
                <option value="waste_growth">waste_growth</option>
                <option value="production_intensity_growth">production_intensity_growth</option>
                <option value="missing_evidence_count">missing_evidence_count</option>
                <option value="data_quality_score">data_quality_score</option>
              </NativeSelect>
            </div>

            <div>
              <Label className="text-xs">Operator & Threshold</Label>
              <div className="flex gap-2 mt-1">
                <NativeSelect
                  value={createForm.operator}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, operator: e.target.value as RuleOperator })
                  }
                  className="w-20"
                >
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                  <option value="==">==</option>
                  <option value="!=">!=</option>
                </NativeSelect>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.thresholdValue}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, thresholdValue: parseFloat(e.target.value) })
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">Advisory Message Template</Label>
              <Input
                value={createForm.advisoryMessageTemplate}
                onChange={(e) =>
                  setCreateForm({ ...createForm, advisoryMessageTemplate: e.target.value })
                }
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmit} disabled={isPending}>
              {isPending ? "Creating..." : "Create Rule v1"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CITATION DETAILS INSPECTOR */}
      <Dialog
        open={Boolean(selectedCitationModal)}
        onOpenChange={(open) => !open && setSelectedCitationModal(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-violet-500" />
              Verified Evidence Inspection
            </DialogTitle>
            <DialogDescription className="text-xs">
              Audit inspection of citation {selectedCitationModal?.citationLabel}
            </DialogDescription>
          </DialogHeader>

          {selectedCitationModal && (
            <div className="space-y-3 py-2 text-xs">
              <div>
                <Label className="text-xs text-muted-foreground">Citation Label</Label>
                <div className="font-mono font-bold text-foreground mt-0.5">
                  {selectedCitationModal.citationLabel}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <div className="text-foreground mt-0.5">{selectedCitationModal.title}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-muted/30 border border-border/50">
                  <span className="text-muted-foreground block">Source Type</span>
                  <span className="font-mono font-semibold">
                    {selectedCitationModal.sourceType}
                  </span>
                </div>
                <div className="p-2 rounded bg-muted/30 border border-border/50">
                  <span className="text-muted-foreground block">Cosine Match Confidence</span>
                  <span className="font-mono font-semibold">
                    {(selectedCitationModal.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Source ID</Label>
                <div className="font-mono text-[11px] p-1.5 rounded bg-muted/40 text-foreground break-all">
                  {selectedCitationModal.sourceId}
                </div>
              </div>

              <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                ✓ Verified and Approved in organizational database with append-only audit trail.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" onClick={() => setSelectedCitationModal(null)}>
              Close Inspector
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
