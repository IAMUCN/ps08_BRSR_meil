"use client";

import { useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Copy,
  Download,
  Flame,
  Info,
  Layers,
  Link2,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateCreditProcurementPlan,
  calculateOffsetShortfall,
  generateProcurementBriefDocument,
  type ProcurementBrief,
  type ScopeEmissions,
} from "@/lib/carbon-credits/quotation";

type Props = {
  orgUnitName: string;
  orgUnitCode: string;
  periodLabel?: string;
  reconciliation: {
    gross: ScopeEmissions;
    offsets: ScopeEmissions;
    net: ScopeEmissions;
  };
  currentShadowPrice?: number;
  onInitiateMint?: (prefill: {
    projectName: string;
    registry:
      "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW";
    quantityTco2e: number;
    notes: string;
  }) => void;
};

export function CarbonQuotationPanel({
  orgUnitName,
  orgUnitCode,
  periodLabel = "FY 2025-26",
  reconciliation,
  onInitiateMint,
}: Props) {
  const shortfall = useMemo(
    () => calculateOffsetShortfall(reconciliation.gross, reconciliation.offsets),
    [reconciliation.gross, reconciliation.offsets],
  );

  // Default target is the exact net unmitigated shortfall to achieve Net Zero
  const defaultTarget = shortfall.total > 0 ? shortfall.total : 1000;
  const [targetCredits, setTargetCredits] = useState<number>(defaultTarget);
  const [activeScopeFocus, setActiveScopeFocus] = useState<
    "ALL" | "SCOPE_1" | "SCOPE_2" | "SCOPE_3"
  >("ALL");

  const plan = useMemo(
    () =>
      calculateCreditProcurementPlan(
        targetCredits,
        reconciliation.gross,
        reconciliation.offsets,
        activeScopeFocus,
      ),
    [targetCredits, reconciliation.gross, reconciliation.offsets, activeScopeFocus],
  );

  const applyPreset = (
    preset: "100_NET_ZERO" | "50_PERCENT" | "SCOPE_1" | "SCOPE_2" | "SCOPE_3",
  ) => {
    switch (preset) {
      case "100_NET_ZERO":
        setTargetCredits(shortfall.total);
        setActiveScopeFocus("ALL");
        break;
      case "50_PERCENT":
        setTargetCredits(Math.round(shortfall.total * 0.5));
        setActiveScopeFocus("ALL");
        break;
      case "SCOPE_1":
        setTargetCredits(shortfall.scope1);
        setActiveScopeFocus("SCOPE_1");
        break;
      case "SCOPE_2":
        setTargetCredits(shortfall.scope2);
        setActiveScopeFocus("SCOPE_2");
        break;
      case "SCOPE_3":
        setTargetCredits(shortfall.scope3);
        setActiveScopeFocus("SCOPE_3");
        break;
    }
  };

  const procurementBrief = useMemo<ProcurementBrief>(() => {
    // Generate deterministic identifier to prevent SSR/client hydration mismatch
    const cleanCode = (orgUnitCode || "CORP").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const seedStr = `${cleanCode}-${periodLabel}-${targetCredits}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (Math.imul(31, hash) + seedStr.charCodeAt(i)) | 0;
    }
    const seedNumber = Math.abs(hash % 9000) + 1000;
    const yearMatch = periodLabel.match(/\d{4}/);
    const planYear = yearMatch ? yearMatch[0] : "2026";
    const planId = `PLAN-${cleanCode}-${planYear}-${seedNumber}`;

    return {
      planId,
      createdAt: new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      orgUnitName,
      orgUnitCode: orgUnitCode || "MEIL",
      reportingPeriod: periodLabel,
      grossEmissionsTco2e: reconciliation.gross.total,
      existingOffsetsTco2e: reconciliation.offsets.total,
      unmitigatedNetEmissionsTco2e: shortfall.total,
      creditsToPurchase: targetCredits,
      scopeAllocation: plan.scopeBreakdown,
      postProcurementResidualTco2e: plan.projectedNetEmissionsTco2e,
      complianceStandard: "SEBI BRSR Core (Principle 6) / GHG Protocol Corporate Standard",
    };
  }, [orgUnitCode, orgUnitName, periodLabel, reconciliation, shortfall, targetCredits, plan]);

  const handleCopyPlan = () => {
    const text = generateProcurementBriefDocument(procurementBrief);
    navigator.clipboard.writeText(text);
    toast.success("Carbon credit procurement plan copied to clipboard!");
  };

  const handleDownloadPlan = () => {
    const text = generateProcurementBriefDocument(procurementBrief);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${procurementBrief.planId}-Carbon-Procurement-Plan.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Procurement plan document downloaded.");
  };

  const handleRecordBatch = () => {
    let reg:
      "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW" =
      "VERRA_VCS";
    if (activeScopeFocus === "SCOPE_2") reg = "I_REC";

    onInitiateMint?.({
      projectName: `${orgUnitName} Offset Procurement (${activeScopeFocus === "ALL" ? "Total Deficit" : activeScopeFocus})`,
      registry: reg,
      quantityTco2e: targetCredits,
      notes: `Targeted carbon credit procurement planned from verified website emissions data. ${targetCredits} credits to neutralize residual emissions. Scope focus: ${activeScopeFocus}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Carbon Emission & Offset Gap Summary Header */}
      <div className="rounded-xl border border-primary/20 bg-linear-to-r from-card via-card to-primary/5 p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground font-semibold">
                <Calculator className="size-3.5 mr-1" />
                Carbon Equivalents & Credits
              </Badge>
              <Badge variant="outline" className="border-border">
                {orgUnitName} · {periodLabel}
              </Badge>
              <Badge
                variant="secondary"
                className="border-emerald-500/30 bg-emerald-500/10 text-status-success font-medium text-xs"
              >
                1 Carbon Credit = 1 tCO₂e Carbon Equivalent
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              Carbon Equivalent & Required Credits Calculator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Directly derived from your organization&apos;s verified emission data. 1 Carbon Credit
              offsets exactly 1 metric tonne of CO₂ equivalent (1 tCO₂e) of greenhouse gas
              emissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyPlan} className="text-xs">
              <Copy className="size-3.5 mr-1.5" />
              Copy Plan
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPlan} className="text-xs">
              <Download className="size-3.5 mr-1.5" />
              Download Plan (.txt)
            </Button>
          </div>
        </div>

        {/* 3 Metric Blocks: Gross, Existing Offsets, Required Credits to Buy */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Gross Carbon Equivalent (Footprint)</span>
              <Flame className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {reconciliation.gross.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>Scope 1: {reconciliation.gross.scope1.toLocaleString()}</span>
              <span>·</span>
              <span>Scope 2: {reconciliation.gross.scope2.toLocaleString()}</span>
              <span>·</span>
              <span>Scope 3: {reconciliation.gross.scope3.toLocaleString()}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Existing Retired Offsets</span>
              <ShieldCheck className="size-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-primary-text">
              {reconciliation.offsets.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                Credits (tCO₂e Equivalent)
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Already retired in registry & applied to SEBI BRSR
            </p>
          </div>

          <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-status-success">
              <span>Carbon Credits to Purchase (Deficit)</span>
              <ShoppingCart className="size-4 text-status-success" />
            </div>
            <div className="mt-2 text-2xl font-black text-status-success">
              {shortfall.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">Credits</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-foreground">
              <span>1 Credit = 1 tCO₂e Carbon Equivalent</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Procurement Target Configurator */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                1. Select Target Credits to Purchase
              </CardTitle>
              <CardDescription className="text-xs">
                Select a carbon neutrality milestone or specify exact volume to purchase.
              </CardDescription>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={
                  activeScopeFocus === "ALL" && targetCredits === shortfall.total
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset("100_NET_ZERO")}
              >
                <Sparkles className="size-3 mr-1" />
                100% Net Zero ({shortfall.total.toLocaleString()} Credits)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset("50_PERCENT")}
              >
                50% Milestone ({Math.round(shortfall.total * 0.5).toLocaleString()} Credits)
              </Button>
              {shortfall.scope1 > 0 && (
                <Button
                  variant={activeScopeFocus === "SCOPE_1" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyPreset("SCOPE_1")}
                >
                  <Flame className="size-3 mr-1 text-amber-500" />
                  Scope 1 Deficit ({shortfall.scope1.toLocaleString()})
                </Button>
              )}
              {shortfall.scope2 > 0 && (
                <Button
                  variant={activeScopeFocus === "SCOPE_2" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyPreset("SCOPE_2")}
                >
                  <Zap className="size-3 mr-1 text-blue-500" />
                  Scope 2 Deficit ({shortfall.scope2.toLocaleString()})
                </Button>
              )}
              {shortfall.scope3 > 0 && (
                <Button
                  variant={activeScopeFocus === "SCOPE_3" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyPreset("SCOPE_3")}
                >
                  <Link2 className="size-3 mr-1 text-purple-500" />
                  Scope 3 Deficit ({shortfall.scope3.toLocaleString()})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="custom-credits-input" className="text-xs font-semibold">
                Credits to Purchase (1 Credit = 1 tCO₂e)
              </Label>
              <div className="relative">
                <Input
                  id="custom-credits-input"
                  type="number"
                  min="0"
                  step="10"
                  value={targetCredits}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTargetCredits(Number.isNaN(val) ? 0 : val);
                  }}
                  className="text-lg font-bold pr-20"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs font-semibold text-muted-foreground">
                  Credits
                </span>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">Offset Coverage:</span>
                <span className="font-bold text-foreground">
                  {plan.offsetPercentage}% of unmitigated emissions
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, plan.offsetPercentage)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0 tCO₂e</span>
                <span>
                  Post-Purchase Net Emissions:{" "}
                  <strong className="text-status-success font-semibold">
                    {plan.projectedNetEmissionsTco2e.toLocaleString()} tCO₂e
                  </strong>
                </span>
                <span>Net Zero: {shortfall.total.toLocaleString()} Credits</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Scope-by-Scope Carbon Equivalent Breakdown Table */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            2. Scope-by-Scope Carbon Equivalent & Credit Allocation
          </CardTitle>
          <CardDescription className="text-xs">
            Direct conversion of greenhouse gas emissions to required carbon offset credits.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-table-header text-table-header-foreground border-y">
              <tr>
                <th className="px-4 py-3 font-semibold">Emission Scope</th>
                <th className="px-4 py-3 font-semibold text-right">
                  Gross Carbon Equivalent (tCO₂e)
                </th>
                <th className="px-4 py-3 font-semibold text-right">Existing Retired Offsets</th>
                <th className="px-4 py-3 font-semibold text-right">Carbon Deficit (tCO₂e)</th>
                <th className="px-4 py-3 font-semibold text-right text-status-success font-bold">
                  Credits to Purchase (1:1)
                </th>
                <th className="px-4 py-3 font-semibold text-right">Projected Net Emissions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Flame className="size-4 text-amber-500 shrink-0" />
                    <div>
                      <div>Scope 1 Direct Emissions</div>
                      <div className="text-[11px] text-muted-foreground">
                        Stationary & Mobile Combustion
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {reconciliation.gross.scope1.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {reconciliation.offsets.scope1.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {shortfall.scope1.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right font-bold text-status-success">
                  {plan.scopeBreakdown.scope1.toLocaleString()} Credits
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {Math.max(0, shortfall.scope1 - plan.scopeBreakdown.scope1).toLocaleString()}{" "}
                  tCO₂e
                </td>
              </tr>

              <tr className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Zap className="size-4 text-blue-500 shrink-0" />
                    <div>
                      <div>Scope 2 Indirect Electricity</div>
                      <div className="text-[11px] text-muted-foreground">
                        Purchased Grid Electricity (Eligible for I-RECs)
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {reconciliation.gross.scope2.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {reconciliation.offsets.scope2.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {shortfall.scope2.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right font-bold text-status-success">
                  {plan.scopeBreakdown.scope2.toLocaleString()} Credits
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {Math.max(0, shortfall.scope2 - plan.scopeBreakdown.scope2).toLocaleString()}{" "}
                  tCO₂e
                </td>
              </tr>

              <tr className="hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Link2 className="size-4 text-purple-500 shrink-0" />
                    <div>
                      <div>Scope 3 Value Chain</div>
                      <div className="text-[11px] text-muted-foreground">
                        Upstream Fuel, Travel, Logistics & Waste
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {reconciliation.gross.scope3.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {reconciliation.offsets.scope3.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {shortfall.scope3.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3 text-right font-bold text-status-success">
                  {plan.scopeBreakdown.scope3.toLocaleString()} Credits
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {Math.max(0, shortfall.scope3 - plan.scopeBreakdown.scope3).toLocaleString()}{" "}
                  tCO₂e
                </td>
              </tr>

              {/* Total Row */}
              <tr className="bg-muted/40 font-bold border-t-2">
                <td className="px-4 py-3.5 text-foreground">Total Operational Footprint</td>
                <td className="px-4 py-3.5 text-right text-foreground">
                  {reconciliation.gross.total.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3.5 text-right text-primary-text">
                  {reconciliation.offsets.total.toLocaleString()}
                </td>
                <td className="px-4 py-3.5 text-right text-foreground">
                  {shortfall.total.toLocaleString()} tCO₂e
                </td>
                <td className="px-4 py-3.5 text-right text-status-success text-sm font-black">
                  {plan.targetCreditsToBuy.toLocaleString()} Credits
                </td>
                <td className="px-4 py-3.5 text-right text-status-success font-black">
                  {plan.projectedNetEmissionsTco2e.toLocaleString()} tCO₂e
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Final Procurement Specification & Action Summary */}
      <Card className="border-2 border-primary/30 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <CheckCircle2 className="size-5 text-status-success" />
                3. Final Carbon Credit Procurement Specification
              </CardTitle>
              <CardDescription className="text-xs">
                Official credit purchase quantity ready for internal procurement requisition or
                ledger planning.
              </CardDescription>
            </div>
            <Badge className="bg-emerald-600 text-white font-mono text-xs">
              {procurementBrief.planId}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">Issuing Entity Scope</div>
              <div className="mt-1 font-bold text-foreground">{orgUnitName}</div>
              <div className="mt-1 text-xs text-muted-foreground">{periodLabel}</div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">Credits to Purchase</div>
              <div className="mt-1 text-xl font-black text-status-success">
                {targetCredits.toLocaleString()} Credits
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Equivalent to {targetCredits.toLocaleString()} tCO₂e
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">
                Post-Procurement Position
              </div>
              <div className="mt-1 text-xl font-black text-foreground">
                {plan.projectedNetEmissionsTco2e.toLocaleString()} tCO₂e
              </div>
              <div className="mt-1 text-xs font-semibold text-status-success flex items-center gap-1">
                <TrendingDown className="size-3" />
                {plan.isNetZeroAchieved
                  ? "100% Net Zero Achieved"
                  : `${plan.offsetPercentage}% Emissions Offset`}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">SEBI BRSR Principle 6</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-status-success">
                <ShieldCheck className="size-4" />
                Audit Assurance Ready
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                1 Credit = 1 tCO₂e Cancellation
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-4 text-blue-500 shrink-0" />
              <span>
                Based strictly on website activity records. When credits are purchased, record them
                in the Registry Ledger with cancellation letters for audit integrity.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyPlan}>
                <Copy className="size-4 mr-1.5" />
                Copy Procurement Plan
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPlan}>
                <Download className="size-4 mr-1.5" />
                Download Plan (.txt)
              </Button>
              {onInitiateMint && (
                <Button size="sm" onClick={handleRecordBatch}>
                  <Plus className="size-4 mr-1.5" />
                  Record as Planned Batch
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
