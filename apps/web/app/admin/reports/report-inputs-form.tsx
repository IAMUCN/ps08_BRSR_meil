"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import type { FyInputs } from "@/lib/reports/inputs";
import { reportInputsAction, saveReportInputsAction } from "./actions";

// What SEBI's tables need that no uploaded document holds — entered once per financial year and reused by
// every report for that year and the next year's "previous year" column (.grill/audit-p0-decisions.md).
// A plain form by the feature role; the ui role may restyle it (APP_FLOW_DEVIATIONS.md A24).
export function ReportInputsForm({
  years,
  initialYear,
  initial,
}: {
  years: number[];
  initialYear: number;
  initial: FyInputs;
}) {
  const [pending, startTransition] = useTransition();
  const [year, setYear] = useState(initialYear);
  const [values, setValues] = useState(initial);
  // Each year with data, and the year before it — a report prints both columns.
  const options = [...new Set(years.flatMap((y) => [y, y - 1]))].sort((a, b) => b - a);

  function changeYear(next: number) {
    startTransition(async () => {
      const result = await reportInputsAction({ financialYear: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setYear(next);
      setValues(result.data);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => {
      const raw = String(form.get(name) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;
    const next: FyInputs = {
      turnoverCr: number("turnoverCr"),
      pppRate: number("pppRate"),
      physicalOutput: number("physicalOutput"),
      physicalOutputUnit: text("physicalOutputUnit"),
      assurance: text("assurance"),
      methodologyNote: text("methodologyNote"),
    };
    startTransition(async () => {
      const result = await saveReportInputsAction({ financialYear: year, ...next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setValues(next);
      toast.success(`Saved for ${financialYearLabel(year)}. Reports generated from now on use it.`);
    });
  }

  const area =
    "w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <details className="rounded-md border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Turnover, PPP rate and assurance for the report
        <span className="ml-2 font-normal text-muted-foreground">
          Used for the intensity rows and notes of the BRSR tables. Anything left empty prints as
          “Not provided”.
        </span>
      </summary>
      {/* Re-mounted per year so the fields show that year's saved values. */}
      <form key={year} onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="inputs-year">Financial year (April–March)</Label>
          <NativeSelect
            id="inputs-year"
            value={year}
            disabled={pending}
            onChange={(e) => changeYear(Number(e.target.value))}
          >
            {options.map((y) => (
              <option key={y} value={y}>
                {financialYearLabel(y)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inputs-turnover">Revenue from operations (₹ crore)</Label>
          <Input
            id="inputs-turnover"
            name="turnoverCr"
            type="number"
            min="0"
            step="any"
            defaultValue={values.turnoverCr ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inputs-ppp">PPP rate (₹ per international dollar, IMF)</Label>
          <Input
            id="inputs-ppp"
            name="pppRate"
            type="number"
            min="0"
            step="any"
            defaultValue={values.pppRate ?? ""}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="inputs-output">Physical output</Label>
            <Input
              id="inputs-output"
              name="physicalOutput"
              type="number"
              min="0"
              step="any"
              defaultValue={values.physicalOutput ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inputs-output-unit">Its unit</Label>
            <Input
              id="inputs-output-unit"
              name="physicalOutputUnit"
              maxLength={40}
              placeholder="e.g. km of road"
              defaultValue={values.physicalOutputUnit ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="inputs-assurance">
            Independent assessment or assurance (yes or no; if yes, the agency)
          </Label>
          <textarea
            id="inputs-assurance"
            name="assurance"
            rows={2}
            maxLength={500}
            defaultValue={values.assurance ?? ""}
            className={area}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="inputs-method">
            Methodology note (optional: GWP values used, consolidation approach, exclusions)
          </Label>
          <textarea
            id="inputs-method"
            name="methodologyNote"
            rows={2}
            maxLength={1000}
            defaultValue={values.methodologyNote ?? ""}
            className={area}
          />
        </div>
        <div className="lg:col-span-4">
          <Button type="submit" variant="outline" disabled={pending}>
            Save for {financialYearLabel(year)}
          </Button>
        </div>
      </form>
    </details>
  );
}
