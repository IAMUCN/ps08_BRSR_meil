"use client";

import { BarChart3, Coins, Sliders, TrendingUp } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import type { AlertSettings } from "@/lib/analytics/alerts";
import type { AnalyticsOverview } from "@/lib/analytics/service";
import type { EmissionAlert } from "@/lib/trpc/routers/analytics";
import type { CarbonLink } from "@/lib/trpc/routers/carbon-links";
import {
  CarbonCreditsClient,
  type CarbonCreditsClientProps,
} from "../carbon-credits/carbon-credits-client";
import { CreditLinksPanel } from "../carbon-credits/credit-links-panel";
import { ForecastClient, type ForecastOptions } from "../forecast/forecast-client";
import { SimulatorClient, type SimulatorOptions } from "../simulator/simulator-client";
import { OverviewTab } from "./overview-tab";

export type OrgUnitOption = {
  id: string;
  name: string;
  code: string;
  depth: number;
};

export type CarbonIntelligenceTab = "overview" | "forecast" | "simulator" | "credits";

export type CarbonIntelligenceClientProps = {
  units: OrgUnitOption[];
  initialOrgUnitId: string;
  overview: AnalyticsOverview;
  alerts: EmissionAlert[];
  settings: AlertSettings;
  isSuperAdmin: boolean;
  canAcknowledge?: boolean;
  aiAvailable: boolean;
  forecastOptions: ForecastOptions;
  simulatorOptions: SimulatorOptions;
  creditsData: {
    options: CarbonCreditsClientProps["options"];
    summary: CarbonCreditsClientProps["initialSummary"];
    batches: CarbonCreditsClientProps["initialBatches"];
    reconciliation: CarbonCreditsClientProps["initialReconciliation"];
    icpPrices: CarbonCreditsClientProps["initialIcpPrices"];
    links: CarbonLink[];
  } | null;
  initialTab?: CarbonIntelligenceTab;
};

export function CarbonIntelligenceClient({
  units,
  initialOrgUnitId,
  overview,
  alerts,
  settings,
  isSuperAdmin,
  canAcknowledge,
  aiAvailable,
  forecastOptions,
  simulatorOptions,
  creditsData,
  initialTab = "overview",
}: CarbonIntelligenceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active tab state derived directly from URL
  const paramTab = searchParams.get("tab");
  const requestedTab: CarbonIntelligenceTab =
    paramTab === "forecast" ||
    paramTab === "simulator" ||
    paramTab === "overview" ||
    paramTab === "credits" ||
    paramTab === "carbon-credits"
      ? paramTab === "carbon-credits"
        ? "credits"
        : paramTab
      : initialTab;

  const activeTab: CarbonIntelligenceTab =
    requestedTab === "credits" && !creditsData ? "overview" : requestedTab;

  // Active org unit state derived directly from URL
  const paramOrg = searchParams.get("org");
  const orgUnitId = paramOrg ?? initialOrgUnitId;

  // Navigate to updated query string
  const updateUrl = useCallback(
    (newTab: CarbonIntelligenceTab, newOrg: string) => {
      const params = new URLSearchParams();
      params.set("tab", newTab);
      params.set("org", newOrg);
      router.push(`/admin/carbon-intelligence?${params.toString()}`);
    },
    [router],
  );

  const handleTabChange = (tab: CarbonIntelligenceTab) => {
    updateUrl(tab, orgUnitId);
  };

  const handleOrgChange = (newOrg: string) => {
    updateUrl(activeTab, newOrg);
  };

  return (
    <div className="space-y-6">
      {/* Top Shared Filter Bar & Tab Navigation */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        {/* Unified Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "overview"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="size-3.5 text-primary-text" aria-hidden />
            <span>Overview & Trends</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("forecast")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "forecast"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="size-3.5 text-amber-500" aria-hidden />
            <span>Emissions Forecast</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("simulator")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "simulator"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="size-3.5 text-blue-500" aria-hidden />
            <span>Reduction Simulator</span>
          </button>

          {creditsData && (
            <button
              type="button"
              onClick={() => handleTabChange("credits")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeTab === "credits"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Coins className="size-3.5 text-emerald-500" aria-hidden />
              <span>Carbon Credits & Offsets</span>
            </button>
          )}
        </div>

        {/* Shared Organization Unit Selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="shared-org-picker"
            className="text-xs font-medium text-muted-foreground shrink-0"
          >
            Organization Unit:
          </label>
          <NativeSelect
            id="shared-org-picker"
            value={orgUnitId}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="h-8.5 min-w-[220px] text-xs font-medium"
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {"—".repeat(u.depth)} {u.name} {u.code ? `(${u.code})` : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <OverviewTab
          overview={overview}
          alerts={alerts}
          settings={settings}
          isSuperAdmin={isSuperAdmin}
          canAcknowledge={canAcknowledge}
          aiAvailable={aiAvailable}
        />
      )}

      {activeTab === "forecast" && (
        <ForecastClient
          options={forecastOptions}
          initialOrgUnitId={orgUnitId}
          onOrgChange={handleOrgChange}
        />
      )}

      {activeTab === "simulator" && (
        <SimulatorClient
          options={simulatorOptions}
          initialOrgUnitId={orgUnitId}
          onOrgChange={handleOrgChange}
        />
      )}

      {activeTab === "credits" && creditsData && (
        <div className="space-y-6">
          <CreditLinksPanel links={creditsData.links} canEdit={isSuperAdmin} />
          <CarbonCreditsClient
            options={creditsData.options}
            initialSummary={creditsData.summary}
            initialBatches={creditsData.batches}
            initialReconciliation={creditsData.reconciliation}
            initialIcpPrices={creditsData.icpPrices}
            initialOrgUnitId={orgUnitId}
            onOrgChange={handleOrgChange}
          />
        </div>
      )}
    </div>
  );
}
