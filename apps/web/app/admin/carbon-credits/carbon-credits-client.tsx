"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Calculator,
  CheckCircle2,
  Coins,
  Flame,
  Leaf,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CarbonQuotationPanel } from "./carbon-quotation-panel";
import {
  evaluateCapexAction,
  getReconciliationAction,
  getSummaryAction,
  listBatchesAction,
  mintCreditAction,
  retireCreditAction,
  transferCreditAction,
} from "./actions";

export type CarbonCreditsClientProps = {
  options: {
    orgUnits: { id: string; name: string; code: string; unitType: string }[];
    periods: {
      id: string;
      label: string;
      periodStart: string;
      periodEnd: string;
      status: string;
    }[];
  };
  initialSummary: {
    totalMintedTco2e: number;
    availableTco2e: number;
    retiredTco2e: number;
    transferredTco2e: number;
    activeBatchesCount: number;
    currentShadowPrice: number;
    currency: string;
    registryBreakdown: { registry: string; quantityTco2e: number }[];
    statusBreakdown: { status: string; quantityTco2e: number }[];
  };
  initialBatches: Array<{
    id: string;
    orgUnitId: string;
    orgUnitName: string;
    projectName: string;
    registry: string;
    registryProjectId: string;
    serialNumberStart: string;
    serialNumberEnd: string;
    quantityTco2e: number;
    retiredTco2e: number;
    transferredTco2e: number;
    remainingTco2e: number;
    vintageYear: number;
    methodologyCode: string;
    creditType: string;
    status: string;
    issuanceDate: string;
    verifierName: string;
    evidenceDocumentId: string | null;
    evidenceFileName: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  initialReconciliation: {
    gross: { scope1: number; scope2: number; scope3: number; total: number };
    offsets: { scope1: number; scope2: number; scope3: number; total: number };
    net: { scope1: number; scope2: number; scope3: number; total: number };
    transferredExclusions: { batchesCount: number; quantityTco2e: number; status: string };
    doubleCountingIntegrityCheck: {
      passed: boolean;
      claimDisclosuresValid: boolean;
      message: string;
    };
  };
  initialIcpPrices: Array<{
    id: string;
    orgUnitId: string;
    orgUnitName: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    shadowPricePerTco2e: number;
    currency: string;
    priceType: string;
    appliesToScopes: string[];
    sourceRational: string;
    isActive: boolean;
  }>;
  initialOrgUnitId?: string;
  onOrgChange?: (id: string) => void;
};

export function CarbonCreditsClient({
  options,
  initialSummary,
  initialBatches,
  initialReconciliation,
  initialIcpPrices,
  initialOrgUnitId,
  onOrgChange,
}: CarbonCreditsClientProps) {
  const searchParams = useSearchParams();
  const subtabParam = searchParams?.get("subtab");

  const [activeTab, setActiveTab] = useState<"inventory" | "reconciliation" | "icp" | "quotation">(
    subtabParam === "inventory" ||
      subtabParam === "reconciliation" ||
      subtabParam === "icp" ||
      subtabParam === "quotation"
      ? subtabParam
      : "quotation",
  );

  useEffect(() => {
    if (
      subtabParam === "inventory" ||
      subtabParam === "reconciliation" ||
      subtabParam === "icp" ||
      subtabParam === "quotation"
    ) {
      setActiveTab(subtabParam);
    }
  }, [subtabParam]);
  const [summary, setSummary] = useState(initialSummary);
  const [batches, setBatches] = useState(initialBatches);
  const [reconciliation, setReconciliation] = useState(initialReconciliation);
  const [isPending, startTransition] = useTransition();

  // Filters
  const [selectedOrgUnit, setSelectedOrgUnit] = useState(
    initialOrgUnitId ?? options.orgUnits[0]?.id ?? "",
  );
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [registryFilter, setRegistryFilter] = useState<string>("ALL");

  const activePeriodLabel =
    selectedPeriod === "FY_2025_26"
      ? "FY 2025-26 (Apr 2025 – Mar 2026)"
      : selectedPeriod === "FY_2026_27"
        ? "FY 2026-27 (Apr 2026 – Sep 2026)"
        : (options.periods.find((p) => p.id === selectedPeriod)?.label ??
          "All-Time Cumulative (Apr 2025 – Present)");

  useEffect(() => {
    if (initialOrgUnitId && initialOrgUnitId !== selectedOrgUnit) {
      setSelectedOrgUnit(initialOrgUnitId);
      startTransition(async () => {
        const res = await getReconciliationAction({
          orgUnitId: initialOrgUnitId,
          periodFilter: selectedPeriod,
        });
        if (res.ok) setReconciliation(res.data);
      });
    }
  }, [initialOrgUnitId, selectedPeriod, selectedOrgUnit]);

  // Modals
  const [isMintOpen, setIsMintOpen] = useState(false);
  const [isRetireOpen, setIsRetireOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [activeCredit, setActiveCredit] = useState<(typeof batches)[0] | null>(null);

  // Mint Form State
  const [mintForm, setMintForm] = useState({
    orgUnitId: options.orgUnits[0]?.id ?? "",
    projectName: "",
    registry: "VERRA_VCS" as
      "CCTS_INDIA" | "VERRA_VCS" | "GOLD_STANDARD" | "I_REC" | "BEE_ESCERT" | "INTERNAL_SHADOW",
    registryProjectId: "",
    serialNumberStart: "",
    serialNumberEnd: "",
    quantityTco2e: 1000,
    vintageYear: 2025,
    methodologyCode: "ACM0016",
    creditType: "AVOIDANCE",
    issuanceDate: new Date().toISOString().split("T")[0]!,
    verifierName: "TÜV Rheinland",
    notes: "",
  });

  // Retire Form State
  const [retireForm, setRetireForm] = useState({
    quantityTco2e: 100,
    reportingPeriodId: options.periods[0]?.id ?? "",
    beneficiaryOrgUnitId: options.orgUnits[0]?.id ?? "",
    targetScope: "SCOPE_1" as "SCOPE_1" | "SCOPE_2" | "SCOPE_3",
    retirementReason: "Offsetting operational emissions for SEBI BRSR reporting",
  });

  // Transfer Form State
  const [transferForm, setTransferForm] = useState({
    quantityTco2e: 100,
    counterpartyName: "",
    counterpartyRegistryAccount: "",
    notes: "External carbon credit sale and transfer",
  });

  // CapEx Evaluator Form State
  const [capexForm, setCapexForm] = useState({
    projectName: "Solar Microgrid & Energy Storage at Plant A",
    capexAmount: 6500000,
    operationalAnnualSavings: 950000,
    baselineAnnualEmissionsTco2e: 520,
    projectedAnnualEmissionsTco2e: 140,
    projectLifespanYears: 10,
    discountRatePercent: 8,
  });

  const [capexResult, setCapexResult] = useState<{
    projectName: string;
    shadowPricePerTco2e: number;
    annualEmissionCutTco2e: number;
    annualCarbonValue: number;
    traditionalPaybackYears: number | null;
    carbonAdjustedPaybackYears: number | null;
    paybackAccelerationYears: number | null;
    traditionalNpv: number;
    carbonAdjustedNpv: number;
    lifetimeCarbonAvoidedTco2e: number;
  } | null>(null);

  // Refresh data
  const refreshAll = () => {
    startTransition(async () => {
      try {
        const [sumRes, batchRes, reconRes] = await Promise.all([
          getSummaryAction({ orgUnitId: selectedOrgUnit || undefined }),
          listBatchesAction({ orgUnitId: selectedOrgUnit || undefined }),
          getReconciliationAction({
            orgUnitId: selectedOrgUnit,
            reportingPeriodId: selectedPeriod,
          }),
        ]);

        if (sumRes.ok) setSummary(sumRes.data);
        if (batchRes.ok) setBatches(batchRes.data);
        if (reconRes.ok) setReconciliation(reconRes.data);
        toast.success("Carbon ledger refreshed.");
      } catch {
        toast.error("Failed to refresh carbon ledger.");
      }
    });
  };

  // Submit Mint
  const handleMintSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await mintCreditAction(mintForm);
      if (res.ok) {
        toast.success("Carbon credit batch registered in inventory.");
        setIsMintOpen(false);
        refreshAll();
      } else {
        toast.error(res.error ?? "Failed to mint credit batch.");
      }
    });
  };

  // Submit Retire
  const handleRetireSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCredit) return;

    startTransition(async () => {
      const res = await retireCreditAction({
        creditId: activeCredit.id,
        quantityTco2e: Number(retireForm.quantityTco2e),
        reportingPeriodId: retireForm.reportingPeriodId,
        beneficiaryOrgUnitId: retireForm.beneficiaryOrgUnitId,
        targetScope: retireForm.targetScope,
        retirementReason: retireForm.retirementReason,
      });

      if (res.ok) {
        toast.success("Credits retired successfully for BRSR offset claim.");
        setIsRetireOpen(false);
        refreshAll();
      } else {
        toast.error(res.error ?? "Retirement failed.");
      }
    });
  };

  // Submit Transfer
  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCredit) return;

    startTransition(async () => {
      const res = await transferCreditAction({
        creditId: activeCredit.id,
        quantityTco2e: Number(transferForm.quantityTco2e),
        counterpartyName: transferForm.counterpartyName,
        counterpartyRegistryAccount: transferForm.counterpartyRegistryAccount,
        notes: transferForm.notes,
      });

      if (res.ok) {
        toast.success("Transfer logged. Credits permanently excluded from internal claims.");
        setIsTransferOpen(false);
        refreshAll();
      } else {
        toast.error(res.error ?? "Transfer failed.");
      }
    });
  };

  // Run CapEx Evaluation
  const handleCapexEvaluate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await evaluateCapexAction({
        orgUnitId: selectedOrgUnit,
        projectName: capexForm.projectName,
        capexAmount: Number(capexForm.capexAmount),
        operationalAnnualSavings: Number(capexForm.operationalAnnualSavings),
        baselineAnnualEmissionsTco2e: Number(capexForm.baselineAnnualEmissionsTco2e),
        projectedAnnualEmissionsTco2e: Number(capexForm.projectedAnnualEmissionsTco2e),
        projectLifespanYears: Number(capexForm.projectLifespanYears),
        discountRatePercent: Number(capexForm.discountRatePercent),
      });

      if (res.ok) {
        setCapexResult(res.data);
        toast.success("CapEx carbon economics calculated.");
      } else {
        toast.error(res.error ?? "CapEx evaluation failed.");
      }
    });
  };

  // Filter batches
  const filteredBatches = batches.filter((b) => {
    if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
    if (registryFilter !== "ALL" && b.registry !== registryFilter) return false;
    if (
      searchTerm &&
      !b.projectName.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !b.serialNumberStart.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !b.registryProjectId.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Header Metric KPI Cards: Highlighting Carbon Equivalents and Deficit */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-500/20 bg-amber-500/5 [&_.text-muted-foreground]:text-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Flame className="size-4 text-amber-500" />
              Gross Carbon Equivalent
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {reconciliation.gross.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            S1: {reconciliation.gross.scope1.toLocaleString()} · S2:{" "}
            {reconciliation.gross.scope2.toLocaleString()} · S3:{" "}
            {reconciliation.gross.scope3.toLocaleString()} tCO₂e
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-purple-500/5 [&_.text-muted-foreground]:text-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="size-4 text-purple-500" />
              Retired Offsets (BRSR)
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {reconciliation.offsets.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">Credits (tCO₂e)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Applied to Principle 6 carbon neutrality
          </CardContent>
        </Card>

        <Card className="border-emerald-500/40 bg-emerald-500/10 [&_.text-muted-foreground]:text-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-bold text-status-success">
              <ShoppingCart className="size-4 text-status-success" />
              Carbon Credits to Purchase
            </CardDescription>
            <CardTitle className="text-2xl font-black tracking-tight text-status-success">
              {reconciliation.net.total.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">Credits</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground font-medium">
            1 Credit = 1 tCO₂e Carbon Equivalent Deficit
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5 [&_.text-muted-foreground]:text-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Coins className="size-4 text-blue-500" />
              Internal Shadow Price
            </CardDescription>
            <CardTitle className="text-2xl font-bold tracking-tight">
              ₹{summary.currentShadowPrice.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">/ tCO₂e</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Registry inventory: {summary.availableTco2e.toLocaleString()} tCO₂e available
          </CardContent>
        </Card>
      </div>

      {/* Shared Entity Scope & Reporting Period Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs font-semibold uppercase text-muted-foreground">
            Entity Scope:
          </Label>
          <div className="w-56">
            <NativeSelect
              value={selectedOrgUnit}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedOrgUnit(newId);
                onOrgChange?.(newId);
                startTransition(async () => {
                  const res = await getReconciliationAction({
                    orgUnitId: newId,
                    reportingPeriodId: selectedPeriod,
                  });
                  if (res.ok) setReconciliation(res.data);
                });
              }}
            >
              {options.orgUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          <Label className="ml-2 text-xs font-semibold uppercase text-muted-foreground">
            Period:
          </Label>
          <div className="w-56">
            <NativeSelect
              value={selectedPeriod ?? ""}
              onChange={(e) => {
                const p = e.target.value || undefined;
                setSelectedPeriod(p);
                startTransition(async () => {
                  const res = await getReconciliationAction({
                    orgUnitId: selectedOrgUnit,
                    periodFilter: p,
                  });
                  if (res.ok) setReconciliation(res.data);
                });
              }}
            >
              <option value="">All-Time Cumulative (Apr 2025 – Present)</option>
              <option value="FY_2025_26">Full FY 2025-26 (Apr 2025 – Mar 2026)</option>
              <option value="FY_2026_27">FY 2026-27 YTD (Apr 2026 – Sep 2026)</option>
              <optgroup label="Monthly Reporting Periods">
                {options.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </div>
        </div>

        <Badge
          variant="outline"
          className="text-xs border-emerald-500/40 text-status-success bg-emerald-500/5"
        >
          <ShieldCheck className="size-3.5 mr-1" />1 Carbon Credit = 1 tCO₂e Carbon Equivalent
        </Badge>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeTab === "quotation" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("quotation")}
          >
            <ShoppingCart className="size-4" />
            Carbon Equivalents & Credits to Purchase
          </Button>
          <Button
            variant={activeTab === "reconciliation" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("reconciliation")}
          >
            <ShieldCheck className="size-4" />
            Anti-Double-Counting Reconciliation
          </Button>
          <Button
            variant={activeTab === "inventory" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("inventory")}
          >
            <Award className="size-4" />
            Registry Ledger ({batches.length})
          </Button>
          <Button
            variant={activeTab === "icp" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("icp")}
          >
            <Coins className="size-4" />
            CapEx Carbon Evaluator (ICP)
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isPending}>
            <RefreshCw className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {activeTab === "inventory" && (
            <Button size="sm" onClick={() => setIsMintOpen(true)}>
              <Plus className="size-4" />
              Register Verified Batch
            </Button>
          )}
        </div>
      </div>

      {/* TAB 1: REGISTRY INVENTORY LEDGER */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search batches by project, registry ID or serial range"
                placeholder="Search by project, registry ID, or serial range..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-44">
              <NativeSelect
                aria-label="Batch status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="MINTED">Minted (In Stock)</option>
                <option value="RETIRED">Retired (Claimed)</option>
                <option value="TRANSFERRED">Transferred (Sold)</option>
              </NativeSelect>
            </div>
            <div className="w-48">
              <NativeSelect
                aria-label="Registry"
                value={registryFilter}
                onChange={(e) => setRegistryFilter(e.target.value)}
              >
                <option value="ALL">All Registries</option>
                <option value="VERRA_VCS">Verra VCS</option>
                <option value="CCTS_INDIA">India CCTS / BEE</option>
                <option value="GOLD_STANDARD">Gold Standard</option>
                <option value="I_REC">I-REC Registry</option>
              </NativeSelect>
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-table-header text-xs font-medium text-table-header-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">Project / Origin</th>
                    <th className="px-4 py-3">Registry & ID</th>
                    <th className="px-4 py-3">Serial Number Block</th>
                    <th className="px-4 py-3">Vintage</th>
                    <th className="px-4 py-3 text-right">Available / Total</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        No carbon credit batches match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-foreground">{b.projectName}</div>
                          <div className="text-xs text-muted-foreground">{b.orgUnitName}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className="text-xs">
                            {b.registry}
                          </Badge>
                          <div className="mt-0.5 text-xs font-mono text-muted-foreground">
                            {b.registryProjectId}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-mono text-xs">{b.serialNumberStart}</div>
                          <div className="text-[11px] text-muted-foreground">
                            to {b.serialNumberEnd}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-medium">{b.vintageYear}</td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="font-bold text-status-success">
                            {b.remainingTco2e.toLocaleString()} tCO₂e
                          </div>
                          <div className="text-xs text-muted-foreground">
                            of {b.quantityTco2e.toLocaleString()} tCO₂e
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {b.status === "MINTED" && (
                            <Badge className="bg-emerald-600 text-white">Active Stock</Badge>
                          )}
                          {b.status === "RETIRED" && (
                            <Badge className="bg-purple-600 text-white">Retired (Offset)</Badge>
                          )}
                          {b.status === "TRANSFERRED" && (
                            <Badge className="bg-amber-600 text-white">Transferred (Sold)</Badge>
                          )}
                          {b.status === "HELD" && <Badge variant="secondary">Held</Badge>}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {b.remainingTco2e > 0 && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-purple-500/40 text-primary-text hover:bg-purple-50"
                                  onClick={() => {
                                    setActiveCredit(b);
                                    setRetireForm((prev) => ({
                                      ...prev,
                                      quantityTco2e: b.remainingTco2e,
                                    }));
                                    setIsRetireOpen(true);
                                  }}
                                >
                                  Retire
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs border-amber-500/40 text-status-warning hover:bg-amber-50"
                                  onClick={() => {
                                    setActiveCredit(b);
                                    setTransferForm((prev) => ({
                                      ...prev,
                                      quantityTco2e: b.remainingTco2e,
                                    }));
                                    setIsTransferOpen(true);
                                  }}
                                >
                                  Transfer
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: ANTI-DOUBLE-COUNTING RECONCILIATION */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                Entity Scope:
              </Label>
              <div className="w-56">
                <NativeSelect
                  value={selectedOrgUnit}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedOrgUnit(newId);
                    onOrgChange?.(newId);
                    startTransition(async () => {
                      const res = await getReconciliationAction({
                        orgUnitId: newId,
                        reportingPeriodId: selectedPeriod,
                      });
                      if (res.ok) setReconciliation(res.data);
                    });
                  }}
                >
                  {options.orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code})
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <Label className="ml-2 text-xs font-semibold uppercase text-muted-foreground">
                Period:
              </Label>
              <div className="w-48">
                <NativeSelect
                  value={selectedPeriod ?? ""}
                  onChange={(e) => {
                    const p = e.target.value || undefined;
                    setSelectedPeriod(p);
                    startTransition(async () => {
                      const res = await getReconciliationAction({
                        orgUnitId: selectedOrgUnit,
                        reportingPeriodId: p,
                      });
                      if (res.ok) setReconciliation(res.data);
                    });
                  }}
                >
                  <option value="">All Historical Periods</option>
                  {options.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <Badge
              variant="outline"
              className="border-emerald-500/50 text-status-success bg-emerald-50 dark:bg-emerald-950/20"
            >
              <ShieldCheck className="size-3.5 mr-1" />
              GHG Protocol & SEBI BRSR Compliant
            </Badge>
          </div>

          {/* Visual Flow Reconciliation: Gross - Offsets = Net */}
          <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-7">
            {/* 1. Gross Emissions */}
            <Card className="lg:col-span-2 border-primary/20">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase">
                  1. Gross Carbon Equivalent
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-foreground">
                  {reconciliation.gross.total.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Scope 1 (Fuels & Fleet):</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.gross.scope1.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scope 2 (Electricity):</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.gross.scope2.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scope 3 (Value Chain):</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.gross.scope3.toLocaleString()} tCO₂e
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Minus Sign */}
            <div className="flex justify-center text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
                <Minus className="size-5" />
              </div>
            </div>

            {/* 2. Retired Offsets */}
            <Card className="lg:col-span-2 border-purple-500/30 bg-purple-500/5 [&_.text-muted-foreground]:text-foreground">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase text-primary-text">
                  2. Verified Retired Offsets
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-primary-text">
                  {reconciliation.offsets.total.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">tCO₂e</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Scope 1 Retired Offsets:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.offsets.scope1.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scope 2 Retired Offsets (RECs):</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.offsets.scope2.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scope 3 Offsets:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.offsets.scope3.toLocaleString()} tCO₂e
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Equals Sign */}
            <div className="flex justify-center text-muted-foreground">
              <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
                <span className="text-xl font-bold">=</span>
              </div>
            </div>

            {/* 3. Net Carbon Position */}
            <Card className="lg:col-span-2 border-emerald-500/30 bg-emerald-500/5">
              <CardHeader className="pb-3">
                <CardDescription className="text-xs font-semibold uppercase text-status-success">
                  3. Net Carbon Deficit (Credits Needed)
                </CardDescription>
                <CardTitle className="text-2xl font-bold text-status-success">
                  {reconciliation.net.total.toLocaleString()}{" "}
                  <span className="text-sm font-normal text-muted-foreground">Credits (tCO₂e)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Net Scope 1 Emissions:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.net.scope1.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Scope 2 Emissions:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.net.scope2.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Scope 3 Emissions:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.net.scope3.toLocaleString()} tCO₂e
                  </span>
                </div>
              </CardContent>
              <div className="border-t border-emerald-500/20 px-6 py-3 bg-emerald-500/5">
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold"
                  onClick={() => setActiveTab("quotation")}
                >
                  <ShoppingCart className="size-3.5 mr-1.5" />
                  Calculate Credits to Offset {reconciliation.net.total.toLocaleString()} tCO₂e
                </Button>
              </div>
            </Card>
          </div>

          {/* Audit Integrity & Transferred Exclusions Assurance */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-status-success">
                  <CheckCircle2 className="size-5" />
                  Anti-Double-Counting Guard Rail Verified
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                <p>{reconciliation.doubleCountingIntegrityCheck.message}</p>
                <div className="rounded border bg-muted/40 p-2.5">
                  <div className="font-semibold text-foreground">
                    SEBI Principle 6 Reporting Mandate:
                  </div>
                  Gross emissions are reported unaltered in SEBI BRSR Core tables. Retired offsets
                  are disclosed in secondary verification schedules without inflating gross numbers.
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-status-warning">
                  <ShieldAlert className="size-5" />
                  Transferred Credits Isolation Guard
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>External Transactions Count:</span>
                  <span className="font-semibold text-foreground">
                    {reconciliation.transferredExclusions.batchesCount} transfers
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Volume Surrendered & Sold:</span>
                  <span className="font-bold text-status-warning">
                    {reconciliation.transferredExclusions.quantityTco2e.toLocaleString()} tCO₂e
                  </span>
                </div>
                <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2.5 text-status-warning">
                  Status: <strong>PERMANENTLY EXCLUDED</strong>. Title to these environmental
                  attributes has passed to the external buyers. The system guarantees 0% double
                  claiming.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: INTERNAL CARBON PRICING & CAPEX EVALUATOR */}
      {activeTab === "icp" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Input Form (5 cols) */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-lg">CapEx Carbon Evaluator</CardTitle>
                <CardDescription className="text-xs">
                  Model payback acceleration and NPV factoring in MEIL’s internal shadow price of
                  carbon.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCapexEvaluate} className="space-y-3.5 text-xs">
                  <div>
                    <Label className="text-xs">Project Name</Label>
                    <Input
                      value={capexForm.projectName}
                      onChange={(e) => setCapexForm({ ...capexForm, projectName: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">CapEx Investment (₹)</Label>
                      <Input
                        type="number"
                        value={capexForm.capexAmount}
                        onChange={(e) =>
                          setCapexForm({ ...capexForm, capexAmount: Number(e.target.value) })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Annual Savings (₹)</Label>
                      <Input
                        type="number"
                        value={capexForm.operationalAnnualSavings}
                        onChange={(e) =>
                          setCapexForm({
                            ...capexForm,
                            operationalAnnualSavings: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Baseline Emissions (tCO₂e/yr)</Label>
                      <Input
                        type="number"
                        value={capexForm.baselineAnnualEmissionsTco2e}
                        onChange={(e) =>
                          setCapexForm({
                            ...capexForm,
                            baselineAnnualEmissionsTco2e: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Projected Emissions (tCO₂e/yr)</Label>
                      <Input
                        type="number"
                        value={capexForm.projectedAnnualEmissionsTco2e}
                        onChange={(e) =>
                          setCapexForm({
                            ...capexForm,
                            projectedAnnualEmissionsTco2e: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Lifespan (Years)</Label>
                      <Input
                        type="number"
                        value={capexForm.projectLifespanYears}
                        onChange={(e) =>
                          setCapexForm({
                            ...capexForm,
                            projectLifespanYears: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Discount Rate (%)</Label>
                      <Input
                        type="number"
                        value={capexForm.discountRatePercent}
                        onChange={(e) =>
                          setCapexForm({
                            ...capexForm,
                            discountRatePercent: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full mt-2" disabled={isPending}>
                    <TrendingUp className="size-4" />
                    Calculate Carbon-Adjusted Economics
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Results Grid (7 cols) */}
            <div className="space-y-4 lg:col-span-7">
              {capexResult ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Card className="border-blue-500/20 bg-blue-500/5">
                      <CardHeader className="pb-1.5">
                        <CardDescription className="text-xs">
                          Annual Carbon Value Generated
                        </CardDescription>
                        <CardTitle className="text-xl font-bold text-primary-text">
                          ₹{capexResult.annualCarbonValue.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-muted-foreground">/ yr</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">
                        {capexResult.annualEmissionCutTco2e} tCO₂e cut × ₹
                        {capexResult.shadowPricePerTco2e}/tCO₂e
                      </CardContent>
                    </Card>

                    <Card className="border-emerald-500/20 bg-emerald-500/5">
                      <CardHeader className="pb-1.5">
                        <CardDescription className="text-xs">
                          Lifetime Carbon Avoided
                        </CardDescription>
                        <CardTitle className="text-xl font-bold text-status-success">
                          {capexResult.lifetimeCarbonAvoidedTco2e.toLocaleString()}{" "}
                          <span className="text-xs font-normal text-muted-foreground">tCO₂e</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">
                        Over {capexForm.projectLifespanYears} years of operational life
                      </CardContent>
                    </Card>
                  </div>

                  {/* Payback comparison */}
                  <Card className="p-4 border-emerald-500/30">
                    <div className="flex items-center justify-between pb-3 border-b">
                      <div>
                        <div className="text-xs font-semibold uppercase text-muted-foreground">
                          Payback Acceleration
                        </div>
                        <div className="text-lg font-bold text-foreground">
                          {capexResult.carbonAdjustedPaybackYears} Years{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            (vs {capexResult.traditionalPaybackYears} yrs standard)
                          </span>
                        </div>
                      </div>
                      {capexResult.paybackAccelerationYears &&
                        capexResult.paybackAccelerationYears > 0 && (
                          <Badge className="bg-emerald-600 text-white text-xs">
                            <Zap aria-hidden />
                            {capexResult.paybackAccelerationYears} Years Faster Payback
                          </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
                      <div>
                        <div className="text-muted-foreground">Traditional NPV:</div>
                        <div className="text-sm font-semibold text-foreground">
                          ₹{capexResult.traditionalNpv.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Carbon-Adjusted NPV:</div>
                        <div className="text-sm font-bold text-status-success">
                          ₹{capexResult.carbonAdjustedNpv.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <Coins className="size-10 mb-2 opacity-50" />
                  <div className="font-medium text-foreground">Run a CapEx Evaluation</div>
                  <div className="text-xs max-w-sm mt-1">
                    Fill in the project investment parameters to the left to model payback periods
                    and carbon-adjusted Net Present Value.
                  </div>
                </Card>
              )}

              {/* Active Internal Carbon Prices Table */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">
                    Active Corporate Shadow Prices
                  </CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-table-header text-table-header-foreground">
                      <tr>
                        <th className="px-3 py-2">Entity</th>
                        <th className="px-3 py-2">Shadow Price</th>
                        <th className="px-3 py-2">Scopes</th>
                        <th className="px-3 py-2">Source Benchmark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {initialIcpPrices.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-medium">{p.orgUnitName}</td>
                          <td className="px-3 py-2 font-bold text-primary-text">
                            ₹{p.shadowPricePerTco2e.toLocaleString()} / tCO₂e
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {p.appliesToScopes.join(", ")}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{p.sourceRational}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CARBON OFFSET QUOTATION & PROCUREMENT */}
      {activeTab === "quotation" && (
        <CarbonQuotationPanel
          orgUnitName={options.orgUnits.find((u) => u.id === selectedOrgUnit)?.name ?? "MEIL"}
          orgUnitCode={options.orgUnits.find((u) => u.id === selectedOrgUnit)?.code ?? ""}
          periodLabel={activePeriodLabel}
          reconciliation={reconciliation}
          currentShadowPrice={summary.currentShadowPrice}
          onInitiateMint={(prefill) => {
            setMintForm((prev) => ({
              ...prev,
              projectName: prefill.projectName,
              registry: prefill.registry,
              quantityTco2e: prefill.quantityTco2e,
              notes: prefill.notes,
            }));
            setIsMintOpen(true);
          }}
        />
      )}

      {/* MODAL: MINT / REGISTER BATCH */}
      <Dialog open={isMintOpen} onOpenChange={setIsMintOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register Carbon Credit Batch</DialogTitle>
            <DialogDescription className="text-xs">
              Record a verified carbon credit issuance from an official registry statement.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMintSubmit} className="space-y-3 text-xs">
            <div>
              <Label className="text-xs">Project Name</Label>
              <Input
                value={mintForm.projectName}
                onChange={(e) => setMintForm({ ...mintForm, projectName: e.target.value })}
                placeholder="e.g. Olectra Electric Bus Fleet Phase 1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Registry Standard</Label>
                <NativeSelect
                  value={mintForm.registry}
                  onChange={(e) =>
                    setMintForm({
                      ...mintForm,
                      registry: e.target.value as (typeof mintForm)["registry"],
                    })
                  }
                >
                  <option value="VERRA_VCS">Verra VCS</option>
                  <option value="CCTS_INDIA">India CCTS / BEE</option>
                  <option value="GOLD_STANDARD">Gold Standard</option>
                  <option value="I_REC">I-REC Registry</option>
                  <option value="BEE_ESCERT">BEE ESCerts</option>
                </NativeSelect>
              </div>
              <div>
                <Label className="text-xs">Registry Project ID</Label>
                <Input
                  value={mintForm.registryProjectId}
                  onChange={(e) => setMintForm({ ...mintForm, registryProjectId: e.target.value })}
                  placeholder="e.g. VCS-2940"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Serial Block Start</Label>
                <Input
                  value={mintForm.serialNumberStart}
                  onChange={(e) => setMintForm({ ...mintForm, serialNumberStart: e.target.value })}
                  placeholder="e.g. 12450-000001"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Serial Block End</Label>
                <Input
                  value={mintForm.serialNumberEnd}
                  onChange={(e) => setMintForm({ ...mintForm, serialNumberEnd: e.target.value })}
                  placeholder="e.g. 12450-012500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Total Quantity (tCO₂e)</Label>
                <Input
                  type="number"
                  value={mintForm.quantityTco2e}
                  onChange={(e) =>
                    setMintForm({ ...mintForm, quantityTco2e: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Vintage Year</Label>
                <Input
                  type="number"
                  value={mintForm.vintageYear}
                  onChange={(e) =>
                    setMintForm({ ...mintForm, vintageYear: Number(e.target.value) })
                  }
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Methodology Code</Label>
                <Input
                  value={mintForm.methodologyCode}
                  onChange={(e) => setMintForm({ ...mintForm, methodologyCode: e.target.value })}
                  placeholder="e.g. ACM0016"
                  required
                />
              </div>
              <div>
                <Label className="text-xs">Validation / Verifier</Label>
                <Input
                  value={mintForm.verifierName}
                  onChange={(e) => setMintForm({ ...mintForm, verifierName: e.target.value })}
                  placeholder="e.g. TÜV Rheinland"
                  required
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMintOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                Register Batch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: RETIRE CREDITS */}
      <Dialog open={isRetireOpen} onOpenChange={setIsRetireOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Retire Credits for BRSR Offset</DialogTitle>
            <DialogDescription className="text-xs">
              Permanently extinguish credits against a specific reporting period and scope.
            </DialogDescription>
          </DialogHeader>

          {activeCredit && (
            <form onSubmit={handleRetireSubmit} className="space-y-3 text-xs">
              <div className="rounded border bg-muted/40 p-2 text-xs">
                <div>
                  <strong>Selected Batch:</strong> {activeCredit.projectName}
                </div>
                <div>
                  <strong>Available Balance:</strong> {activeCredit.remainingTco2e.toLocaleString()}{" "}
                  tCO₂e
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Volume to Retire (tCO₂e)</Label>
                  <Input
                    type="number"
                    max={activeCredit.remainingTco2e}
                    value={retireForm.quantityTco2e}
                    onChange={(e) =>
                      setRetireForm({ ...retireForm, quantityTco2e: Number(e.target.value) })
                    }
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Target Scope</Label>
                  <NativeSelect
                    value={retireForm.targetScope}
                    onChange={(e) =>
                      setRetireForm({
                        ...retireForm,
                        targetScope: e.target.value as (typeof retireForm)["targetScope"],
                      })
                    }
                  >
                    <option value="SCOPE_1">Scope 1 (Direct)</option>
                    <option value="SCOPE_2">Scope 2 (Electricity / RECs)</option>
                    <option value="SCOPE_3">Scope 3 (Value Chain)</option>
                  </NativeSelect>
                </div>
              </div>

              <div>
                <Label className="text-xs">Reporting Period</Label>
                <NativeSelect
                  value={retireForm.reportingPeriodId}
                  onChange={(e) =>
                    setRetireForm({ ...retireForm, reportingPeriodId: e.target.value })
                  }
                >
                  {options.periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <Label className="text-xs">Retirement Reason / Purpose</Label>
                <Input
                  value={retireForm.retirementReason}
                  onChange={(e) =>
                    setRetireForm({ ...retireForm, retirementReason: e.target.value })
                  }
                  placeholder="e.g. Offset Scope 1 emissions for FY25-26"
                  required
                />
              </div>

              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRetireOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={isPending}
                >
                  Confirm Permanent Retirement
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: TRANSFER CREDITS */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log External Credit Transfer (Sale)</DialogTitle>
            <DialogDescription className="text-xs">
              Record credit sale to a third party. These serial numbers will be permanently locked
              out of internal claims.
            </DialogDescription>
          </DialogHeader>

          {activeCredit && (
            <form onSubmit={handleTransferSubmit} className="space-y-3 text-xs">
              <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-900">
                <strong>Anti-Double-Counting Notice:</strong> Once transferred, this volume cannot
                be counted in MEIL or subsidiary emissions reduction claims.
              </div>

              <div>
                <Label className="text-xs">Volume to Transfer (tCO₂e)</Label>
                <Input
                  type="number"
                  max={activeCredit.remainingTco2e}
                  value={transferForm.quantityTco2e}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, quantityTco2e: Number(e.target.value) })
                  }
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Counterparty (Buyer Name)</Label>
                <Input
                  value={transferForm.counterpartyName}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, counterpartyName: e.target.value })
                  }
                  placeholder="e.g. AeroGlobal Airlines Corp"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Buyer Registry Account ID</Label>
                <Input
                  value={transferForm.counterpartyRegistryAccount}
                  onChange={(e) =>
                    setTransferForm({
                      ...transferForm,
                      counterpartyRegistryAccount: e.target.value,
                    })
                  }
                  placeholder="e.g. VA-AIR-ACC-9821"
                  required
                />
              </div>

              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTransferOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={isPending}
                >
                  Execute Transfer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
