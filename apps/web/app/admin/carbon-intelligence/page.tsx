import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { CarbonIntelligenceClient, type OrgUnitOption } from "./carbon-intelligence-client";

export const metadata: Metadata = {
  title: "Carbon Intelligence · EmeilSG",
  description:
    "Unified carbon analytics, predictive trajectory forecasting, and reduction simulation.",
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

  const [rawUnits, forecastOptions, simulatorOptions] = await Promise.all([
    caller.analytics.units(),
    caller.forecast.options(),
    caller.simulator.options(),
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

  // Load overview, alerts, and settings for the authorized unit
  const [overview, alerts, settings] = await Promise.all([
    caller.analytics.overview({ orgUnitId }),
    caller.analytics.alerts({ orgUnitId }),
    caller.analytics.alertSettings(),
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

  const initialTab = askedTab === "forecast" || askedTab === "simulator" ? askedTab : "overview";

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Carbon Intelligence"
        description="Unified carbon analytics, forward-looking predictive trajectory forecasting, and multi-vector reduction simulations."
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
        initialTab={initialTab}
      />
    </div>
  );
}
