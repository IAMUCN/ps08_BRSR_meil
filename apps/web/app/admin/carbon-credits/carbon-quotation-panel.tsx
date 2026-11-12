"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Flame,
  Info,
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
  calculateOffsetShortfall,
  calculateQuotation,
  formatInrLakhs,
  formatUsdThousands,
  generateRfqDocument,
  QUOTATION_PROVIDERS,
  type QuotationProvider,
  type RfqSpecification,
} from "@/lib/carbon-credits/quotation";

type Props = {
  orgUnitName: string;
  orgUnitCode: string;
  periodLabel?: string;
  reconciliation: {
    gross: { scope1: number; scope2: number; scope3: number; total: number };
    offsets: { scope1: number; scope2: number; scope3: number; total: number };
    net: { scope1: number; scope2: number; scope3: number; total: number };
  };
  currentShadowPrice: number;
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
  currentShadowPrice,
  onInitiateMint,
}: Props) {
  const shortfall = useMemo(
    () => calculateOffsetShortfall(reconciliation.gross, reconciliation.offsets),
    [reconciliation.gross, reconciliation.offsets],
  );

  // Target procurement volume (defaults to exact net unmitigated shortfall)
  const defaultTarget = shortfall.total > 0 ? shortfall.total : 1000;
  const [targetVolume, setTargetVolume] = useState<number>(defaultTarget);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("verra_vcs");
  const [activeScopeFocus, setActiveScopeFocus] = useState<
    "ALL" | "SCOPE_1" | "SCOPE_2" | "SCOPE_3"
  >("ALL");

  const selectedProvider = useMemo(
    () => QUOTATION_PROVIDERS.find((p) => p.id === selectedProviderId) ?? QUOTATION_PROVIDERS[0]!,
    [selectedProviderId],
  );

  const quote = useMemo(
    () => calculateQuotation(targetVolume, selectedProvider, shortfall.total),
    [targetVolume, selectedProvider, shortfall.total],
  );

  // Presets
  const applyPreset = (
    preset: "100_NET_ZERO" | "50_PERCENT" | "SCOPE_1" | "SCOPE_2" | "SCOPE_3",
  ) => {
    switch (preset) {
      case "100_NET_ZERO":
        setTargetVolume(shortfall.total);
        setActiveScopeFocus("ALL");
        break;
      case "50_PERCENT":
        setTargetVolume(Math.round(shortfall.total * 0.5));
        setActiveScopeFocus("ALL");
        break;
      case "SCOPE_1":
        setTargetVolume(shortfall.scope1);
        setActiveScopeFocus("SCOPE_1");
        break;
      case "SCOPE_2":
        setTargetVolume(shortfall.scope2);
        setActiveScopeFocus("SCOPE_2");
        if (selectedProviderId !== "i_rec") {
          setSelectedProviderId("i_rec");
        }
        break;
      case "SCOPE_3":
        setTargetVolume(shortfall.scope3);
        setActiveScopeFocus("SCOPE_3");
        break;
    }
  };

  // RFQ generation
  const rfqSpec = useMemo<RfqSpecification>(() => {
    const rfqNumber = `RFQ-TRACESG-${orgUnitCode || "CORP"}-${new Date().getFullYear()}-${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
    return {
      rfqNumber,
      createdAt: new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      orgUnitName,
      orgUnitCode: orgUnitCode || "MEIL-MAIN",
      reportingPeriod: periodLabel,
      targetVolumeTco2e: targetVolume,
      scopeBreakdown: {
        scope1: activeScopeFocus === "SCOPE_1" ? targetVolume : shortfall.scope1,
        scope2: activeScopeFocus === "SCOPE_2" ? targetVolume : shortfall.scope2,
        scope3: activeScopeFocus === "SCOPE_3" ? targetVolume : shortfall.scope3,
      },
      preferredRegistries: [
        "Verra Verified Carbon Standard (VCS)",
        "Gold Standard for the Global Goals (GS-VER)",
        "Indian Carbon Credit Trading Scheme (BEE / CCTS)",
        "Carbon Trade Exchange / CarbonTradeLabs Spot",
        "I-REC International Standard (for Scope 2)",
      ],
      vintageWindow: "Vintage 2022 to 2025 (SEBI BRSR Core Third-Party Assurance Compliant)",
      additionalityClause:
        "Credits must represent permanent, verified, and additional greenhouse gas emission reductions or removals verified under recognized international/national methodologies.",
      antiDoubleCountingClause:
        "The seller covenants that credits delivered are unretired, unencumbered, not pledged to any sovereign NDC or other beneficiary, and accompanied by electronic registry transfer directly into the designated buyer registry account.",
      estimatedBudgetInr: `${formatInrLakhs(quote.minTotalInr)} – ${formatInrLakhs(quote.maxTotalInr)} (Mid: ${formatInrLakhs(quote.estimatedTotalInr)})`,
      estimatedBudgetUsd: `${formatUsdThousands(quote.minTotalUsd)} – ${formatUsdThousands(quote.maxTotalUsd)} (Mid: ${formatUsdThousands(quote.estimatedTotalUsd)})`,
    };
  }, [orgUnitCode, orgUnitName, periodLabel, targetVolume, activeScopeFocus, shortfall, quote]);

  const handleCopyRfq = () => {
    const text = generateRfqDocument(rfqSpec);
    navigator.clipboard.writeText(text);
    toast.success("Carbon procurement RFQ specification copied to clipboard!");
  };

  const handleDownloadRfq = () => {
    const text = generateRfqDocument(rfqSpec);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${rfqSpec.rfqNumber}-Procurement-Spec.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("RFQ specification document downloaded.");
  };

  const handleInitiateBatch = () => {
    let reg:
      "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW" =
      "VERRA_VCS";
    if (selectedProvider.registryType === "GOLD_STANDARD") reg = "GOLD_STANDARD";
    else if (selectedProvider.registryType === "CCTS_INDIA") reg = "CCTS_INDIA";
    else if (selectedProvider.registryType === "I_REC") reg = "I_REC";

    onInitiateMint?.({
      projectName: `${selectedProvider.name} Planned Procurement`,
      registry: reg,
      quantityTco2e: targetVolume,
      notes: `Planned procurement quotation generated on TraceESG. Indicative cost: ${formatInrLakhs(quote.estimatedTotalInr)}. Scope focus: ${activeScopeFocus}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Offset Gap Analysis */}
      <div className="rounded-xl border border-primary/20 bg-linear-to-r from-card via-card to-primary/5 p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground font-semibold">
                <Calculator className="size-3.5 mr-1" />
                Live Carbon Procurement Estimator
              </Badge>
              <Badge variant="outline" className="border-border">
                {orgUnitName} · {periodLabel}
              </Badge>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              Carbon Emission Offset Quotation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Calculate the exact volume of carbon credits required to neutralize your operational
              emissions and evaluate live procurement prices from Verra, CarbonTradeLabs, Gold
              Standard, and CCTS India.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyRfq} className="text-xs">
              <Copy className="size-3.5 mr-1.5" />
              Copy RFQ
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadRfq} className="text-xs">
              <Download className="size-3.5 mr-1.5" />
              Download Spec
            </Button>
          </div>
        </div>

        {/* 3 Metric Summary Blocks: Gross, Existing Offsets, Net Deficit */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Gross Emissions</span>
              <Flame className="size-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {reconciliation.gross.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>S1: {reconciliation.gross.scope1.toLocaleString()}</span>
              <span>·</span>
              <span>S2: {reconciliation.gross.scope2.toLocaleString()}</span>
              <span>·</span>
              <span>S3: {reconciliation.gross.scope3.toLocaleString()}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Current Retired Offsets</span>
              <ShieldCheck className="size-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-primary-text">
              {reconciliation.offsets.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Already retired in registry & accounted in BRSR
            </p>
          </div>

          <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-status-success">
              <span>Credits Needed to Buy (Deficit)</span>
              <ShoppingCart className="size-4 text-status-success" />
            </div>
            <div className="mt-2 text-2xl font-black text-status-success">
              {shortfall.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-foreground">
              <span>S1: {shortfall.scope1.toLocaleString()}</span>
              <span>·</span>
              <span>S2: {shortfall.scope2.toLocaleString()}</span>
              <span>·</span>
              <span>S3: {shortfall.scope3.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Offset Target Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                1. Select Target Offset Quantity
              </CardTitle>
              <CardDescription className="text-xs">
                Choose a pre-calculated neutralization milestone or enter custom credit volume.
              </CardDescription>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={
                  activeScopeFocus === "ALL" && targetVolume === shortfall.total
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset("100_NET_ZERO")}
              >
                <Sparkles className="size-3 mr-1" />
                100% Net Zero ({shortfall.total.toLocaleString()} t)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => applyPreset("50_PERCENT")}
              >
                50% Target ({Math.round(shortfall.total * 0.5).toLocaleString()} t)
              </Button>
              {shortfall.scope1 > 0 && (
                <Button
                  variant={activeScopeFocus === "SCOPE_1" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyPreset("SCOPE_1")}
                >
                  <Flame className="size-3 mr-1 text-amber-500" />
                  Scope 1 ({shortfall.scope1.toLocaleString()} t)
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
                  Scope 2 RECs ({shortfall.scope2.toLocaleString()} t)
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
                  Scope 3 ({shortfall.scope3.toLocaleString()} t)
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="custom-volume-input" className="text-xs font-semibold">
                Credits to Purchase (tCO₂e)
              </Label>
              <div className="relative">
                <Input
                  id="custom-volume-input"
                  type="number"
                  min="1"
                  step="10"
                  value={targetVolume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setTargetVolume(Number.isNaN(val) ? 0 : val);
                  }}
                  className="text-lg font-bold pr-16"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs font-semibold text-muted-foreground">
                  tCO₂e
                </span>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">Neutralization Coverage:</span>
                <span className="font-bold text-foreground">
                  {quote.offsetPercentage}% of unmitigated emissions
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-linear-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, quote.offsetPercentage)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0 tCO₂e</span>
                <span>
                  Post-Purchase Net:{" "}
                  <strong className="text-status-success font-semibold">
                    {quote.remainingNetEmissionsTco2e.toLocaleString()} tCO₂e
                  </strong>
                </span>
                <span>Target: {shortfall.total.toLocaleString()} tCO₂e</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Provider Quotation Matrix */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              2. Marketplace Quotation Comparison
            </h3>
            <p className="text-xs text-muted-foreground">
              Compare indicative unit prices, estimated contract value, and direct procurement
              channels.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            USD/INR = ₹84.00
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {QUOTATION_PROVIDERS.map((provider) => {
            const isSelected = selectedProviderId === provider.id;
            const pQuote = calculateQuotation(targetVolume, provider, shortfall.total);

            return (
              <div
                key={provider.id}
                onClick={() => setSelectedProviderId(provider.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-5 transition-all cursor-pointer ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-primary/40 hover:shadow-xs"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge
                        variant="secondary"
                        className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
                      >
                        {provider.registryType.replace("_", " ")}
                      </Badge>
                      <h4 className="text-sm font-bold text-foreground group-hover:text-primary">
                        {provider.name}
                      </h4>
                    </div>
                    {isSelected && (
                      <Badge className="bg-primary text-primary-foreground text-[10px] shrink-0">
                        Selected
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {provider.description}
                  </p>

                  <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Indicative Price:</span>
                      <span className="font-bold text-foreground">
                        ₹{provider.indicativePriceInr.toLocaleString()} / tCO₂e
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          (${provider.indicativePriceUsd.toFixed(2)})
                        </span>
                      </span>
                    </div>

                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Market Spread:</span>
                      <span>
                        ₹{provider.priceRangeInr.min} – ₹{provider.priceRangeInr.max}
                      </span>
                    </div>
                  </div>

                  {/* Estimated Contract Amount for Target Volume */}
                  <div className="mt-4 border-t pt-3">
                    <div className="text-[11px] font-medium uppercase text-muted-foreground">
                      Estimated Contract Value ({targetVolume.toLocaleString()} t)
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="text-xl font-black text-foreground">
                        {formatInrLakhs(pQuote.estimatedTotalInr)}
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground">
                        {formatUsdThousands(pQuote.estimatedTotalUsd)}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Range: {formatInrLakhs(pQuote.minTotalInr)} –{" "}
                      {formatInrLakhs(pQuote.maxTotalInr)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    Vintage: {provider.recommendedVintage.split(" ")[0]}
                  </span>
                  <a
                    href={provider.directRegistryUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>Direct Registry</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            );
          })}

          {/* 6. Corporate Internal Shadow Price Benchmark Card */}
          <div className="flex flex-col justify-between rounded-xl border border-blue-500/30 bg-blue-500/5 p-5">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge
                    variant="outline"
                    className="mb-1.5 border-blue-500/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold uppercase"
                  >
                    ICP Hurdle Benchmark
                  </Badge>
                  <h4 className="text-sm font-bold text-foreground">
                    Corporate Internal Carbon Price
                  </h4>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  Internal Baseline
                </Badge>
              </div>

              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Company shadow carbon price configured under MEIL Sustainability Committee
                guidelines for evaluating CapEx project feasibility.
              </p>

              <div className="mt-4 rounded-lg border bg-card/60 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shadow Hurdle Rate:</span>
                  <span className="font-bold text-foreground">
                    ₹{currentShadowPrice.toLocaleString()} / tCO₂e
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Economic Value:</span>
                  <span>{formatInrLakhs(targetVolume * currentShadowPrice)}</span>
                </div>
              </div>

              <div className="mt-4 border-t pt-3 text-xs text-muted-foreground leading-relaxed">
                If voluntary market credits can be procured below ₹{currentShadowPrice}/tCO₂e, the
                transaction delivers a positive economic arbitrage against the internal corporate
                hurdle rate.
              </div>
            </div>

            <div className="mt-4 border-t pt-3">
              <span className="text-xs font-semibold text-status-success flex items-center gap-1">
                <CheckCircle2 className="size-3.5" />
                Arbitrage Positive vs ICP
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Selected Quotation Summary & Execution Actions */}
      <Card className="border-2 border-primary/30 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShoppingCart className="size-5 text-primary" />
                3. Final Procurement Quotation Specification
              </CardTitle>
              <CardDescription className="text-xs">
                Official quotation summary ready for procurement authorization, RFP tender, or
                direct purchase.
              </CardDescription>
            </div>
            <Badge className="bg-emerald-600 text-white font-mono text-xs">
              {rfqSpec.rfqNumber}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">
                Selected Provider / Platform
              </div>
              <div className="mt-1 font-bold text-foreground">{selectedProvider.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{selectedProvider.category}</div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">Contract Volume</div>
              <div className="mt-1 text-xl font-black text-foreground">
                {targetVolume.toLocaleString()} tCO₂e
              </div>
              <div className="mt-1 text-xs text-status-success font-medium flex items-center gap-1">
                <TrendingDown className="size-3" />
                Net Zero:{" "}
                {quote.remainingNetEmissionsTco2e === 0
                  ? "100% Achieved"
                  : `${quote.offsetPercentage}% covered`}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">
                Indicative Contract Value
              </div>
              <div className="mt-1 text-xl font-black text-foreground">
                {formatInrLakhs(quote.estimatedTotalInr)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground font-semibold">
                {formatUsdThousands(quote.estimatedTotalUsd)}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs text-muted-foreground font-medium">SEBI BRSR Core Status</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-status-success">
                <ShieldCheck className="size-4" />
                Assurance Ready
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Vintages &lt;3 yrs with serial verification
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="size-4 text-blue-500 shrink-0" />
              <span>
                All purchases must be registered with dedicated cancellation letters naming{" "}
                {orgUnitName} to satisfy SEBI BRSR Principle 6 non-double-counting audits.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyRfq}>
                <Copy className="size-4 mr-1.5" />
                Copy RFP
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadRfq}>
                <Download className="size-4 mr-1.5" />
                Download RFQ (.txt)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-emerald-500/40 text-status-success hover:bg-emerald-50"
                asChild
              >
                <a
                  href={selectedProvider.directRegistryUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  <span>Procure on {selectedProvider.name.split(" ")[0]}</span>
                  <ExternalLink className="size-3.5 ml-1.5" />
                </a>
              </Button>
              {onInitiateMint && (
                <Button size="sm" onClick={handleInitiateBatch}>
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
