"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";
import { PeriodSelect } from "@/components/ui/period-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Readiness } from "@/lib/dashboard/kpis";
import type { ContextOptions } from "@/lib/trpc/routers/records";

// The Control Tower's interactive bits: the org/period context picker (URL-driven, carried into every
// drill-down link) and the BRSR Readiness explanation (UI brief §13.1 "i" affordance).

export function ContextPicker({ context }: { context: ContextOptions }) {
  const router = useRouter();
  const go = (org: string, period: string) => router.push(`/admin?org=${org}&period=${period}`);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Organization
        <NativeSelect
          value={context.orgUnitId}
          onChange={(e) => go(e.target.value, context.periodId)}
        >
          {context.orgUnits.map((o) => (
            <option key={o.id} value={o.id}>
              {`${"  ".repeat(o.depth)}${o.name}`}
            </option>
          ))}
        </NativeSelect>
      </label>
      <PeriodSelect
        idPrefix="ct"
        periods={context.periods}
        value={context.periodId}
        onChange={(period) => go(context.orgUnitId, period)}
      />
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)} %`);

export function ReadinessInfo({ readiness }: { readiness: Readiness }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What BRSR Readiness is made of"
          className="rounded-sm text-muted-foreground hover:text-foreground"
        >
          <Info className="size-4" strokeWidth={1.5} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm">
        <p className="font-medium">An internal readiness indicator — not an official score</p>
        <p className="text-xs text-muted-foreground">
          The weighted average of the parts below that can be measured this period. Weights are
          configuration (<code>org_settings.brsr_readiness_weights</code>).
        </p>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-medium">Component</th>
              <th className="text-right font-medium">Value</th>
              <th className="text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {readiness.components.map((c) => (
              <tr key={c.key}>
                <td className="py-0.5">{c.label}</td>
                <td className="text-right font-mono">{pct(c.value)}</td>
                <td className="text-right font-mono">{c.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}
