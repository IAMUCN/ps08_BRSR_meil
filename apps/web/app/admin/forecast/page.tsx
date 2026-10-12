import { Flame, FolderOpen, Sliders, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { ForecastClient } from "./forecast-client";

export const metadata: Metadata = { title: "Emissions Forecast · EmeilSG" };

export default async function EmissionsForecastPage() {
  await requireAdminSession();
  const caller = await api();
  const options = await caller.forecast.options();

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Emissions Forecast"
        description="Analytical forecasting layer: assess historical data coverage, evaluate models via chronological backtesting, and project emissions trajectories."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scope-1">
                <Flame className="size-4" aria-hidden />
                Scope 1
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scope-2">
                <Zap className="size-4" aria-hidden />
                Scope 2
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/simulator">
                <Sliders className="size-4" aria-hidden />
                Reduction Simulator
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/reports/bundle">
                <FolderOpen className="size-4" aria-hidden />
                Evidence Bundle
              </Link>
            </Button>
          </div>
        }
      />

      <ForecastClient options={options} />
    </div>
  );
}
