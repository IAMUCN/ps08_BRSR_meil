import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import {
  CarbonIntelligenceClient,
  type CarbonIntelligenceTab,
  type OrgUnitOption,
} from "./carbon-intelligence-client";

export const metadata: Metadata = {
  title: "Carbon Intelligence · EmeilSG",
  description:
    "Unified carbon analytics, predictive trajectory forecasting, reduction simulation, and carbon markets ledger.",
};

export default async function CarbonIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string | string[]; tab?: string | string[] }>;
}) {
  const [session, caller, params] = await Promise.all([
    requireAdminAreaSession(),
    api(),
    searchParams,
  ]);

  const [
    rawUnits,
    forecastOptions,
    simulatorOptions,
    creditsOptions,
    creditsSummary,
    creditsBatches,
    creditsIcpPrices,
    creditsLinks,
  ] = await Promise.all([
    caller.analytics.units(),
    caller.forecast.options(),
    caller.simulator.options(),
    caller.carbonCredits.options(),
    caller.carbonCredits.summary(),
    caller.carbonCredits.list(),
    caller.carbonCredits.icpList(),
    caller.carbonLinks.list(),
  ]);

  const askedOrg = typeof params.org === "string" ? params.org : undefined;
  const askedTab = typeof params.tab === "string" ? params.tab : "overview";

  // Match org unit hierarchy
  const known = new Set(rawUnits.map((u) => u.id));
  const tops = rawUnits.filter((u) => !u.parentIds.some((p) => known.has(p)));
  const orgUnitId = askedOrg && known.has(askedOrg) ? askedOrg : (tops[0]?.id ?? rawUnits[0]?.id);

  if (!orgUnitId) {
    return (
      <div className="max-w-7xl space-y-6">
        <PageHeader title="Carbon Intelligence" />
        <p className="text-sm text-muted-foreground">No org unit is in your authorized scope.</p>
      </div>
    );
  }

  const targetCreditsOrgUnit =
    creditsOptions.orgUnits.find((u) => u.id === orgUnitId)?.id ??
    creditsOptions.orgUnits[0]?.id ??
    orgUnitId;

  // Load overview, alerts, settings, and credits reconciliation for the authorized unit
  const [overview, alerts, settings, creditsReconciliation] = await Promise.all([
    caller.analytics.overview({ orgUnitId }),
    caller.analytics.alerts({ orgUnitId }),
    caller.analytics.alertSettings(),
    targetCreditsOrgUnit
      ? caller.carbonCredits.reconciliation({ orgUnitId: targetCreditsOrgUnit })
      : Promise.resolve({
          gross: { scope1: 0, scope2: 0, scope3: 0, total: 0 },
          offsets: { scope1: 0, scope2: 0, scope3: 0, total: 0 },
          net: { scope1: 0, scope2: 0, scope3: 0, total: 0 },
          transferredExclusions: {
            batchesCount: 0,
            quantityTco2e: 0,
            status: "PERMANENTLY_EXCLUDED",
          },
          doubleCountingIntegrityCheck: {
            passed: true,
            claimDisclosuresValid: true,
            message: "No records found.",
          },
        }),
  ]);

  // Map units to OrgUnitOption format with depth from forecastOptions or rawUnits
  const depthMap = new Map<string, number>();
  for (const u of forecastOptions.orgUnits) {
    depthMap.set(u.id, u.depth);
  }

  const units: OrgUnitOption[] = rawUnits.map((u) => ({
    id: u.id,
    name: u.name,
    code: "",
    depth: depthMap.get(u.id) ?? 0,
  }));

  const initialTab: CarbonIntelligenceTab =
    askedTab === "forecast" ||
    askedTab === "simulator" ||
    askedTab === "credits" ||
    askedTab === "carbon-credits"
      ? askedTab === "carbon-credits"
        ? "credits"
        : askedTab
      : "overview";

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Carbon Intelligence"
        description="Unified carbon analytics, forward-looking predictive trajectory forecasting, multi-vector reduction simulations, and carbon markets ledger."
      />

      <CarbonIntelligenceClient
        units={units}
        initialOrgUnitId={orgUnitId}
        overview={overview}
        alerts={alerts}
        settings={settings}
        isSuperAdmin={session.isAdmin}
        aiAvailable={overview.aiAvailable}
        forecastOptions={forecastOptions}
        simulatorOptions={simulatorOptions}
        creditsData={{
          options: creditsOptions,
          summary: creditsSummary,
          batches: creditsBatches,
          reconciliation: creditsReconciliation,
          icpPrices: creditsIcpPrices,
          links: creditsLinks,
        }}
        initialTab={initialTab}
      />
    </div>
  );
}
