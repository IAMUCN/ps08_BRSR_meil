"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { OrgTreeSelect } from "@/components/org/org-tree-select";
import type { AnalyticsUnit } from "@/lib/analytics/service";

/** Chooses the org unit; the page reads it from `?org=`. Only units the server returned are offered. */
export function UnitPicker({ units, value }: { units: AnalyticsUnit[]; value: string }) {
  const router = useRouter();
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Label htmlFor="analytics-unit">Org unit (with everything beneath it)</Label>
      <OrgTreeSelect
        id="analytics-unit"
        nodes={units.map((u) => ({
          id: u.id,
          name: u.name,
          parentIds: u.parentIds,
          inactive: u.inactive,
        }))}
        value={value}
        onChange={(id) => router.push(`/admin/carbon-analytics?org=${id}`)}
      />
    </div>
  );
}
