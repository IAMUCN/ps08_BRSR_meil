import { Flame, FolderOpen, Link2, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { SimulatorClient } from "./simulator-client";

export const metadata: Metadata = { title: "Carbon Reduction Simulator · TraceESG" };

export default async function CarbonReductionSimulatorPage() {
  await requireAdminSession();
  const caller = await api();
  const options = await caller.simulator.options();

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Carbon Reduction Simulator"
        description="Explore hypothetical emissions-reduction scenarios using your organization's reporting data."
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
              <Link href="/admin/scope-3">
                <Link2 className="size-4" aria-hidden />
                Scope 3
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

      <SimulatorClient options={options} />
    </div>
  );
}
