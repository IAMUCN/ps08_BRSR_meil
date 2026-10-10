"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileCheck2,
  FileText,
  Filter,
  Layers,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { bundlePreviewAction } from "../actions";
import type { BundlePreview } from "@/lib/reports/bundle";

export type BundleOptions = {
  orgUnits: Array<{ id: string; name: string; depth: number }>;
  periods: Array<{ id: string; label: string }>;
  financialYears: Array<{ startYear: number; label: string }>;
  defaultPeriodId: string | null;
  defaultFinancialYear: number | null;
};

const VERIFICATION_TONES: Record<string, { tone: StatusTone; label: string }> = {
  user_verified: { tone: "success", label: "Verified" },
  ocr_completed: { tone: "warning", label: "OCR Completed" },
  document_uploaded: { tone: "warning", label: "Uploaded" },
  draft: { tone: "neutral", label: "Draft" },
};

const APPROVAL_TONES: Record<string, { tone: StatusTone; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  review_pending: { tone: "warning", label: "Review Pending" },
  returned: { tone: "error", label: "Returned" },
  draft: { tone: "neutral", label: "Draft" },
};

export function BundleClient({ options }: { options: BundleOptions }) {
  const [orgUnitId, setOrgUnitId] = useState(options.orgUnits[0]?.id ?? "");
  const [scopeMode, setScopeMode] = useState<"financial_year" | "period">(
    options.financialYears.length > 0 ? "financial_year" : "period",
  );
  const [financialYear, setFinancialYear] = useState<number>(
    options.defaultFinancialYear ?? options.financialYears[0]?.startYear ?? 2026,
  );
  const [periodId, setPeriodId] = useState<string>(
    options.defaultPeriodId ?? options.periods[0]?.id ?? "",
  );

  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "missing">("all");

  const loadPreview = useCallback(async () => {
    if (!orgUnitId) return;
    setLoading(true);
    try {
      const result = await bundlePreviewAction({
        orgUnitId,
        financialYear: scopeMode === "financial_year" ? financialYear : undefined,
        periodId: scopeMode === "period" ? periodId : undefined,
      });
      if (result.ok) {
        setPreview(result.data);
      } else {
        toast.error(result.error ?? "Failed to load evidence bundle preview.");
      }
    } catch (err) {
      console.error("Preview load failed", err);
      toast.error("Failed to load evidence bundle preview.");
    } finally {
      setLoading(false);
    }
  }, [orgUnitId, scopeMode, financialYear, periodId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPreview();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPreview]);

  const handleDownload = () => {
    setGenerating(true);
    const params = new URLSearchParams({ orgUnitId });
    if (scopeMode === "financial_year") {
      params.set("financialYear", String(financialYear));
    } else if (periodId) {
      params.set("periodId", periodId);
    }

    const downloadUrl = `/api/reports/bundle?${params.toString()}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", "");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Evidence Bundle compilation started. Download will begin shortly.");
    setTimeout(() => setGenerating(false), 3000);
  };

  const records = preview?.records ?? [];
  const missingRecords = records.filter((r) => !r.hasEvidence);
  const displayedRecords = activeTab === "missing" ? missingRecords : records;

  return (
    <div className="space-y-6">
      {/* Scope Selector Card */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2 border-b border-border/60 pb-3">
          <Filter className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Select Scope & Reporting Boundary
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="bundle-org-select"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Organization Entity / Project
            </label>
            <NativeSelect
              id="bundle-org-select"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
              disabled={loading || generating}
            >
              {options.orgUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {"— ".repeat(u.depth)}
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <label
              htmlFor="bundle-scope-mode"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Scope Coverage Mode
            </label>
            <NativeSelect
              id="bundle-scope-mode"
              value={scopeMode}
              onChange={(e) => setScopeMode(e.target.value as "financial_year" | "period")}
              disabled={loading || generating}
            >
              <option value="financial_year">Annual Financial Year (BRSR)</option>
              <option value="period">Individual Reporting Period</option>
            </NativeSelect>
          </div>

          <div>
            {scopeMode === "financial_year" ? (
              <>
                <label
                  htmlFor="bundle-fy-select"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Financial Year
                </label>
                <NativeSelect
                  id="bundle-fy-select"
                  value={financialYear}
                  onChange={(e) => setFinancialYear(Number(e.target.value))}
                  disabled={loading || generating}
                >
                  {options.financialYears.map((fy) => (
                    <option key={fy.startYear} value={fy.startYear}>
                      {fy.label}
                    </option>
                  ))}
                </NativeSelect>
              </>
            ) : (
              <>
                <label
                  htmlFor="bundle-period-select"
                  className="mb-1.5 block text-xs font-medium text-muted-foreground"
                >
                  Reporting Period
                </label>
                <NativeSelect
                  id="bundle-period-select"
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                  disabled={loading || generating}
                >
                  {options.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="text-xs text-muted-foreground">
            Target:{" "}
            <strong className="font-semibold text-foreground">
              {preview?.scope.orgUnitName ?? "..."}
            </strong>{" "}
            ({preview?.scope.coverageLabel ?? "..."})
          </div>

          <Button
            type="button"
            onClick={handleDownload}
            disabled={loading || generating || (preview?.counts.totalRecords ?? 0) === 0}
            className="gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Compiling Package...
              </>
            ) : (
              <>
                <Archive className="size-4" aria-hidden />
                Generate &amp; Download Bundle (.zip)
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5 text-primary" aria-hidden />
            Total ESG Records
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : (preview?.counts.totalRecords ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">in selected scope</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-status-success" aria-hidden />
            Approved Records
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-status-success">
            {loading ? "..." : (preview?.counts.approvedRecords ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">official reporting figures</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileText className="size-3.5 text-blue-500" aria-hidden />
            Supporting Documents
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : (preview?.counts.totalDocuments ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">source bills &amp; files</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileCheck2 className="size-3.5 text-emerald-500" aria-hidden />
            Calculations
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : (preview?.counts.calculationsCount ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">deterministic outputs</div>
        </div>

        <div className="col-span-2 rounded-lg border border-border bg-card p-3.5 sm:col-span-4 lg:col-span-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle
              className={`size-3.5 ${(preview?.counts.missingEvidenceRecords ?? 0) > 0 ? "text-status-warning" : "text-muted-foreground"}`}
              aria-hidden
            />
            Missing Evidence
          </div>
          <div
            className={`mt-2 text-2xl font-bold tracking-tight ${
              (preview?.counts.missingEvidenceRecords ?? 0) > 0
                ? "text-status-warning"
                : "text-status-success"
            }`}
          >
            {loading ? "..." : (preview?.counts.missingEvidenceRecords ?? 0)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">records without files</div>
        </div>
      </div>

      {/* Traceability Table & Preview */}
      <div className="rounded-lg border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              All Records ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("missing")}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "missing"
                  ? "bg-status-warning text-status-warning-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Missing Evidence ({missingRecords.length})
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            Package includes: <span className="font-mono text-foreground">manifest.json</span>,{" "}
            <span className="font-mono text-foreground">checksums.sha256</span>, CSV ledgers &amp;
            raw files
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
            Loading traceability preview...
          </div>
        ) : displayedRecords.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {activeTab === "missing"
              ? "All records in this scope have verified supporting evidence! Complete traceability established."
              : "No records found for the selected scope."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">ESG Activity / Metric</th>
                  <th className="px-4 py-2.5">Entity / Site</th>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5 text-right">Activity Value</th>
                  <th className="px-4 py-2.5 text-right">Calculated tCO₂e</th>
                  <th className="px-4 py-2.5">Verification</th>
                  <th className="px-4 py-2.5">Approval</th>
                  <th className="px-4 py-2.5">Supporting Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayedRecords.map((r) => {
                  const verTone = VERIFICATION_TONES[r.verificationStatus] ?? {
                    tone: "neutral",
                    label: r.verificationStatus,
                  };
                  const appTone = APPROVAL_TONES[r.approvalStatus] ?? {
                    tone: "neutral",
                    label: r.approvalStatus,
                  };

                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        <div>{r.metricName}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {r.metricCode}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.orgUnitName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.periodLabel}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-foreground">
                        {r.activityValue !== null
                          ? `${r.activityValue.toLocaleString()} ${r.activityUnit ?? ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">
                        {r.calculatedValue !== null ? r.calculatedValue.toFixed(3) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={verTone.tone}>{verTone.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={appTone.tone}>{appTone.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.hasEvidence ? (
                          <div className="flex items-center gap-1.5 font-medium text-status-success">
                            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate max-w-[180px] font-mono text-[11px]">
                              {r.primaryDocumentName || `${r.documentsCount} file(s)`}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 font-medium text-status-warning">
                            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                            <span className="text-[11px]">Missing Evidence</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
