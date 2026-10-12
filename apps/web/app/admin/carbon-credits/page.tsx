import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen, Sliders, Zap } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { CarbonCreditsClient } from "./carbon-credits-client";

export const metadata: Metadata = { title: "Carbon Markets & Offsets · EmeilSG" };

export default async function CarbonCreditsPage() {
  await requireAdminSession();
  const caller = await api();

  const [options, summary, batches, icpPrices] = await Promise.all([
    caller.carbonCredits.options(),
    caller.carbonCredits.summary(),
    caller.carbonCredits.list(),
    caller.carbonCredits.icpList(),
  ]);

  const defaultOrgUnitId = options.orgUnits[0]?.id ?? "";
  const reconciliation = defaultOrgUnitId
    ? await caller.carbonCredits.reconciliation({
        orgUnitId: defaultOrgUnitId,
      })
    : {
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
      };

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Carbon Markets & Offsets"
        description="Registry inventory ledger, anti-double-counting reconciliation for SEBI BRSR, and Internal Carbon Pricing (ICP) CapEx analytics."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/forecast">
                <Zap className="size-4" aria-hidden />
                Emissions Forecast
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/simulator">
                <Sliders className="size-4" aria-hidden />
                Reduction Simulator
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/reports">
                <FolderOpen className="size-4" aria-hidden />
                BRSR Reports
              </Link>
            </Button>
          </div>
        }
      />

      <CarbonCreditsClient
        options={options}
        initialSummary={summary}
        initialBatches={batches}
        initialReconciliation={reconciliation}
        initialIcpPrices={icpPrices}
      />
    </div>
  );
}
