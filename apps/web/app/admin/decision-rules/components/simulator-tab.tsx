"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Coins,
  Droplet,
  Flame,
  Layers,
  Leaf,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
  Zap,
} from "lucide-react";
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
import type { MultiVectorBaseline, MultiVectorSimulationResult } from "@/lib/simulator/engine";
import {
  comparePathwaysAction,
  getMultiVectorBaselineAction,
  listSavedScenariosAction,
  runSimulationAction,
  saveScenarioAction,
} from "../actions";

type Props = {
  orgUnits: Array<{ id: string; name: string; code: string }>;
  periods: Array<{ id: string; label: string; start_date: string }>;
  selectedUnit: string;
  selectedPeriod: string;
  onSelectUnit: (id: string) => void;
  onSelectPeriod: (id: string) => void;
};

export function SimulatorTab({
  orgUnits,
  periods,
  selectedUnit,
  selectedPeriod,
  onSelectUnit,
  onSelectPeriod,
}: Props) {
  const [baseline, setBaseline] = useState<MultiVectorBaseline | null>(null);
  const [simulation, setSimulation] = useState<MultiVectorSimulationResult | null>(null);
  const [pathways, setPathways] = useState<any | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<any[]>([]);

  // Simulation Levers
  const [targetRenewableSharePct, setTargetRenewableSharePct] = useState<number>(50);
  const [fuelSwitchPct, setFuelSwitchPct] = useState<number>(25);
  const [targetCleanFuel, setTargetCleanFuel] = useState<
    "EV" | "GRID_ELECTRICITY" | "BIOMASS" | "SOLAR_BATTERY"
  >("EV");
  const [waterRecycledPct, setWaterRecycledPct] = useState<number>(30);
  const [wasteDivertedPct, setWasteDivertedPct] = useState<number>(50);
  const [capexAmount, setCapexAmount] = useState<number>(2000000); // 20 Lakhs
  const [shadowPrice, setShadowPrice] = useState<number>(2500);

  // Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveScenarioName, setSaveScenarioName] = useState("MEIL Clean Energy & Water Pathway");
  const [isSaving, setIsSaving] = useState(false);

  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadBaselineAndSimulate = () => {
    if (!selectedUnit || !selectedPeriod) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const baseRes = await getMultiVectorBaselineAction({
          orgUnitId: selectedUnit,
          periodId: selectedPeriod,
        });

        if (baseRes.ok) {
          const baseData = baseRes.data;
          setBaseline(baseData);
          setShadowPrice(baseData.shadowPricePerTco2e || 2500);

          // Run initial simulation
          const simRes = await runSimulationAction({
            orgUnitId: selectedUnit,
            periodId: selectedPeriod,
            targetRenewableSharePct,
            fuelSwitchPct,
            targetCleanFuel,
            waterRecycledPct,
            wasteDivertedPct,
            capexAmount,
            shadowPriceOverride: baseData.shadowPricePerTco2e || 2500,
          });

          if (simRes.ok) {
            setSimulation(simRes.data);
          }

          // Fetch comparative pathways
          const compRes = await comparePathwaysAction({
            orgUnitId: selectedUnit,
            periodId: selectedPeriod,
            customInput: {
              targetRenewableSharePct,
              fuelSwitchPct,
              waterRecycledPct,
              wasteDivertedPct,
              capexAmount,
            },
          });
          if (compRes.ok) {
            setPathways(compRes.data);
          }

          // Fetch saved scenarios
          const savedRes = await listSavedScenariosAction({
            orgUnitId: selectedUnit,
            reportingPeriodId: selectedPeriod,
          });
          if (savedRes.ok) {
            setSavedScenarios(savedRes.data);
          }
        } else {
          setErrorMessage(baseRes.error || "Failed to load multi-vector baseline.");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Simulation execution failed.");
      }
    });
  };

  const recomputeCustomSimulation = () => {
    if (!selectedUnit || !selectedPeriod) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const simRes = await runSimulationAction({
          orgUnitId: selectedUnit,
          periodId: selectedPeriod,
          scenarioName: saveScenarioName,
          targetRenewableSharePct,
          fuelSwitchPct,
          targetCleanFuel,
          waterRecycledPct,
          wasteDivertedPct,
          capexAmount,
          shadowPriceOverride: shadowPrice,
        });

        if (simRes.ok) {
          setSimulation(simRes.data);
        } else {
          setErrorMessage(simRes.error || "Simulation failed to compute.");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Simulation failed.");
      }
    });
  };

  const handleSaveScenario = async () => {
    if (!simulation || !selectedUnit || !selectedPeriod) return;
    setIsSaving(true);
    try {
      const res = await saveScenarioAction({
        orgUnitId: selectedUnit,
        reportingPeriodId: selectedPeriod,
        scenarioName: saveScenarioName,
        scenarioType: "BLENDED_PATHWAY",
        parameters: {
          targetRenewableSharePct,
          fuelSwitchPct,
          targetCleanFuel,
          waterRecycledPct,
          wasteDivertedPct,
          capexAmount,
          shadowPrice,
        },
        simulationResult: simulation,
      });

      if (res.ok) {
        setIsSaveModalOpen(false);
        // Refresh saved list
        const savedRes = await listSavedScenariosAction({
          orgUnitId: selectedUnit,
          reportingPeriodId: selectedPeriod,
        });
        if (savedRes.ok && savedRes.data) {
          setSavedScenarios(savedRes.data);
        }
      } else {
        alert(res.error || "Failed to save scenario.");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to save scenario.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadBaselineAndSimulate();
  }, [selectedUnit, selectedPeriod]);

  return (
    <div className="space-y-6">
      {/* 1. SELECTION & CONTROL HEADER */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-cyan-500" />
                What-If Decarbonization &amp; Circularity Simulator
              </CardTitle>
              <CardDescription className="text-xs">
                Interactive modeling of solar PPAs, fleet electrification, water recycling, landfill
                diversion, and carbon-adjusted ROI.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadBaselineAndSimulate}
                disabled={isPending}
                className="text-xs h-8"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Reset to Baseline
              </Button>
              <Button
                size="sm"
                onClick={() => setIsSaveModalOpen(true)}
                disabled={!simulation}
                className="text-xs h-8 bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                <BookmarkCheck className="mr-1.5 h-3.5 w-3.5" />
                Save Scenario
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Organizational Unit</Label>
              <NativeSelect
                value={selectedUnit}
                onChange={(e) => onSelectUnit(e.target.value)}
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
              <Label className="text-xs text-muted-foreground">Reporting Period</Label>
              <NativeSelect
                value={selectedPeriod}
                onChange={(e) => onSelectPeriod(e.target.value)}
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

          {errorMessage && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. VERIFIED BASELINE CHIPS */}
      {baseline && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">Grid Electricity</span>
            <span className="text-xs font-bold text-foreground font-mono">
              {baseline.gridElectricityKwh.toLocaleString()} kWh
            </span>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">Renewable Power</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {baseline.renewableSharePct}% RE
            </span>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">Diesel Consumption</span>
            <span className="text-xs font-bold text-foreground font-mono">
              {baseline.fuelDieselL.toLocaleString()} L
            </span>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">Water Withdrawal</span>
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 font-mono">
              {baseline.waterKl.toLocaleString()} kL
            </span>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">Solid Waste Disposed</span>
            <span className="text-xs font-bold text-foreground font-mono">
              {baseline.wasteTonnes.toLocaleString()} Tonnes
            </span>
          </div>

          <div className="p-2.5 rounded-lg border border-border bg-card text-center">
            <span className="text-[10px] text-muted-foreground block">
              Total Baseline Footprint
            </span>
            <span className="text-xs font-bold text-primary font-mono">
              {baseline.totalTco2e} tCO2e
            </span>
          </div>
        </div>
      )}

      {/* 3. INTERACTIVE SIMULATION LEVERS */}
      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-cyan-900 dark:text-cyan-200">
            <SlidersHorizontal className="h-4 w-4 text-cyan-500" />
            Configurable Decarbonization &amp; Circularity Levers
          </CardTitle>
          <CardDescription className="text-xs">
            Adjust scenario targets to recalculate avoided emissions, utility bill savings, and
            carbon-adjusted payback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Lever 1: Renewables */}
            <div className="p-3 rounded-lg border border-border bg-card/70 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Renewable Share
                </Label>
                <span className="text-xs font-bold text-amber-500 font-mono">
                  {targetRenewableSharePct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={targetRenewableSharePct}
                onChange={(e) => setTargetRenewableSharePct(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
              <span className="text-[10px] text-muted-foreground block">
                Displaces grid tariff (₹7.50) with solar PPA (₹3.80/kWh)
              </span>
            </div>

            {/* Lever 2: Fuel Switch */}
            <div className="p-3 rounded-lg border border-border bg-card/70 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-orange-500" /> Fuel Switch %
                </Label>
                <span className="text-xs font-bold text-orange-500 font-mono">
                  {fuelSwitchPct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={fuelSwitchPct}
                onChange={(e) => setFuelSwitchPct(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500"
              />
              <NativeSelect
                value={targetCleanFuel}
                onChange={(e) => setTargetCleanFuel(e.target.value as any)}
                className="text-[11px] h-7"
              >
                <option value="EV">Switch to Electric Vehicles (EV)</option>
                <option value="GRID_ELECTRICITY">Switch to Grid Power</option>
                <option value="BIOMASS">Switch to Biomass Pellets</option>
                <option value="SOLAR_BATTERY">Solar Microgrid + BESS</option>
              </NativeSelect>
            </div>

            {/* Lever 3: Water Recycling */}
            <div className="p-3 rounded-lg border border-border bg-card/70 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Droplet className="h-3.5 w-3.5 text-sky-500" /> Water Recycled
                </Label>
                <span className="text-xs font-bold text-sky-500 font-mono">
                  {waterRecycledPct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={waterRecycledPct}
                onChange={(e) => setWaterRecycledPct(parseInt(e.target.value, 10))}
                className="w-full accent-sky-500"
              />
              <span className="text-[10px] text-muted-foreground block">
                Effluent recycling &amp; rainwater harvesting (₹40/kL)
              </span>
            </div>

            {/* Lever 4: Waste Diversion */}
            <div className="p-3 rounded-lg border border-border bg-card/70 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Trash2 className="h-3.5 w-3.5 text-emerald-500" /> Waste Diverted
                </Label>
                <span className="text-xs font-bold text-emerald-500 font-mono">
                  {wasteDivertedPct}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={wasteDivertedPct}
                onChange={(e) => setWasteDivertedPct(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500"
              />
              <span className="text-[10px] text-muted-foreground block">
                Composting / coprocessing avoids landfill methane
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border/40">
            <div>
              <Label className="text-xs text-muted-foreground">CapEx Investment Budget (INR)</Label>
              <Input
                type="number"
                value={capexAmount}
                onChange={(e) => setCapexAmount(parseFloat(e.target.value) || 0)}
                className="mt-1 text-xs font-mono"
                placeholder="2000000"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Shadow Carbon Price (INR / tCO2e)
              </Label>
              <Input
                type="number"
                value={shadowPrice}
                onChange={(e) => setShadowPrice(parseFloat(e.target.value) || 2500)}
                className="mt-1 text-xs font-mono"
                placeholder="2500"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={recomputeCustomSimulation}
                disabled={isPending}
                className="w-full text-xs h-9 bg-primary hover:bg-primary/90"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Apply &amp; Recalculate Scenario
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. SIMULATION RESULTS & ROI DASHBOARD */}
      {simulation && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 block">
                Avoided GHG Emissions
              </span>
              <div className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-200">
                {simulation.avoided.totalTco2e} tCO2e
              </div>
              <Badge
                variant="outline"
                className="mt-2 text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 font-mono"
              >
                -{simulation.avoided.overallReductionPercent}% Org Footprint
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Annual Operational OPEX Savings
              </span>
              <div className="mt-1 text-xl font-bold text-foreground">
                ₹{simulation.financialImpact.operationalAnnualSavings.toLocaleString()}
              </div>
              <span className="mt-2 text-[11px] text-muted-foreground block">
                Electricity, fuel &amp; water bill cuts
              </span>
            </CardContent>
          </Card>

          <Card className="border-sky-500/30 bg-sky-500/5">
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-sky-800 dark:text-sky-300 block">
                Avoided Carbon Value (ICP)
              </span>
              <div className="mt-1 text-xl font-bold text-sky-700 dark:text-sky-200">
                ₹{simulation.financialImpact.carbonRiskAvoidedAnnual.toLocaleString()}
              </div>
              <span className="mt-2 text-[11px] text-muted-foreground block font-mono">
                @ ₹{shadowPrice}/tCO2e Internal Price
              </span>
            </CardContent>
          </Card>

          <Card className="border-indigo-500/30 bg-indigo-500/5">
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-indigo-800 dark:text-indigo-300 block">
                Carbon-Adjusted Payback
              </span>
              <div className="mt-1 text-xl font-bold text-indigo-700 dark:text-indigo-200">
                {simulation.financialImpact.carbonAdjustedPaybackYears ?? "N/A"}{" "}
                <span className="text-xs font-normal">Years</span>
              </div>
              {simulation.financialImpact.paybackAccelerationYears && (
                <span className="mt-2 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold block">
                  ⚡ Accelerated by {simulation.financialImpact.paybackAccelerationYears} Years
                </span>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5. NARRATIVE PATHWAY SUMMARY */}
      {simulation && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
              Simulated Pathway Executive Narrative
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-relaxed text-foreground">{simulation.pathwaySummary}</p>
          </CardContent>
        </Card>
      )}

      {/* 6. COMPARATIVE PATHWAYS MATRIX */}
      {pathways && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Decarbonization Pathways Benchmark Matrix
            </CardTitle>
            <CardDescription className="text-xs">
              Comparative impact across Baseline, Conservative, Moderate, Ambitious, and Active
              Custom strategies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="py-2 px-3">Pathway</th>
                    <th className="py-2 px-3 text-right">Avoided tCO2e</th>
                    <th className="py-2 px-3 text-right">Reduction %</th>
                    <th className="py-2 px-3 text-right">Operational Savings</th>
                    <th className="py-2 px-3 text-right">Carbon Value</th>
                    <th className="py-2 px-3 text-right">Total Benefit / yr</th>
                    <th className="py-2 px-3 text-right">Adjusted Payback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {/* Baseline */}
                  <tr className="text-muted-foreground">
                    <td className="py-2 px-3 font-semibold">{pathways.baseline.scenarioName}</td>
                    <td className="py-2 px-3 text-right font-mono">0.0</td>
                    <td className="py-2 px-3 text-right font-mono">0.0%</td>
                    <td className="py-2 px-3 text-right font-mono">₹0</td>
                    <td className="py-2 px-3 text-right font-mono">₹0</td>
                    <td className="py-2 px-3 text-right font-mono">₹0</td>
                    <td className="py-2 px-3 text-right font-mono">—</td>
                  </tr>

                  {/* Conservative */}
                  <tr>
                    <td className="py-2 px-3 font-semibold text-foreground">
                      {pathways.conservative.scenarioName}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 font-bold">
                      {pathways.conservative.avoided.totalTco2e}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      -{pathways.conservative.avoided.overallReductionPercent}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹
                      {pathways.conservative.financialImpact.operationalAnnualSavings.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹
                      {pathways.conservative.financialImpact.carbonRiskAvoidedAnnual.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                      ₹{pathways.conservative.financialImpact.totalAnnualBenefit.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {pathways.conservative.financialImpact.carbonAdjustedPaybackYears ?? "—"} yrs
                    </td>
                  </tr>

                  {/* Moderate */}
                  <tr>
                    <td className="py-2 px-3 font-semibold text-foreground">
                      {pathways.moderate.scenarioName}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 font-bold">
                      {pathways.moderate.avoided.totalTco2e}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      -{pathways.moderate.avoided.overallReductionPercent}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹{pathways.moderate.financialImpact.operationalAnnualSavings.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹{pathways.moderate.financialImpact.carbonRiskAvoidedAnnual.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                      ₹{pathways.moderate.financialImpact.totalAnnualBenefit.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {pathways.moderate.financialImpact.carbonAdjustedPaybackYears ?? "—"} yrs
                    </td>
                  </tr>

                  {/* Ambitious */}
                  <tr className="bg-emerald-500/5">
                    <td className="py-2 px-3 font-semibold text-emerald-700 dark:text-emerald-300">
                      {pathways.ambitious.scenarioName}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 font-bold">
                      {pathways.ambitious.avoided.totalTco2e}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600">
                      -{pathways.ambitious.avoided.overallReductionPercent}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹
                      {pathways.ambitious.financialImpact.operationalAnnualSavings.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      ₹{pathways.ambitious.financialImpact.carbonRiskAvoidedAnnual.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                      ₹{pathways.ambitious.financialImpact.totalAnnualBenefit.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {pathways.ambitious.financialImpact.carbonAdjustedPaybackYears ?? "—"} yrs
                    </td>
                  </tr>

                  {/* Active Custom */}
                  {simulation && (
                    <tr className="bg-primary/5 font-semibold text-foreground">
                      <td className="py-2 px-3 flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[9px] uppercase font-mono">
                          Active
                        </Badge>
                        {simulation.scenarioName}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-primary font-bold">
                        {simulation.avoided.totalTco2e}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-primary">
                        -{simulation.avoided.overallReductionPercent}%
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        ₹{simulation.financialImpact.operationalAnnualSavings.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        ₹{simulation.financialImpact.carbonRiskAvoidedAnnual.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                        ₹{simulation.financialImpact.totalAnnualBenefit.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {simulation.financialImpact.carbonAdjustedPaybackYears ?? "—"} yrs
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. SAVED SCENARIOS LIBRARY */}
      {savedScenarios.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookmarkCheck className="h-4 w-4 text-cyan-500" />
              Saved Organization Scenarios
            </CardTitle>
            <CardDescription className="text-xs">
              Persisted what-if pathways with immutable audit records in
              public.what_if_scenario_simulations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedScenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="p-3 rounded-lg border border-border bg-card/60 flex items-center justify-between text-xs"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      {sc.scenarioName}
                      <Badge variant="outline" className="text-[10px]">
                        {sc.scenarioType}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Avoided: {sc.simulatedMetrics?.avoided?.totalTco2e ?? 0} tCO2e • Annual
                      Benefit: ₹
                      {Number(sc.financialImpact?.totalAnnualBenefit || 0).toLocaleString()}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Date(sc.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL: SAVE SCENARIO */}
      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <BookmarkCheck className="h-4 w-4 text-cyan-500" />
              Save Scenario Snapshot
            </DialogTitle>
            <DialogDescription className="text-xs">
              Persists this what-if simulation into the organizational database with immutable audit
              trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Scenario Name</Label>
              <Input
                value={saveScenarioName}
                onChange={(e) => setSaveScenarioName(e.target.value)}
                className="mt-1 text-xs"
                placeholder="e.g. FY27 Solar Rooftop + 50% EV Fleet"
              />
            </div>

            {simulation && (
              <div className="p-3 rounded bg-muted/30 border border-border/50 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Avoided Emissions:</span>
                  <span className="font-mono font-bold text-foreground">
                    {simulation.avoided.totalTco2e} tCO2e (-
                    {simulation.avoided.overallReductionPercent}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Annual Benefit:</span>
                  <span className="font-mono font-bold text-foreground">
                    ₹{simulation.financialImpact.totalAnnualBenefit.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Carbon-Adjusted Payback:</span>
                  <span className="font-mono font-bold text-foreground">
                    {simulation.financialImpact.carbonAdjustedPaybackYears ?? "N/A"} Years
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveScenario}
              disabled={isSaving}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {isSaving ? "Saving..." : "Save Scenario Snapshot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
