"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";

// The yearly review (feature_enhancement.md 6.2, requirement 17). No SEBI or other official API publishes
// emission factors, so each financial year a Super Admin checks every activity that takes a factor: what covers
// 1 April of that year, and whether it was entered for that year or carried over from an earlier one.

export type ReviewData = {
  financialYear: string;
  from: string;
  /** Current financial year first, back to the earliest with data; never a future one. */
  years: string[];
  items: {
    activityType: string;
    activityName: string;
    factorId: string | null;
    state: "missing" | "for_this_year" | "carried_over";
    /** The financial year an inherited value was entered for. */
    inheritedFrom: string | null;
    drafts: number;
  }[];
};

const STATE = {
  missing: { tone: "error", label: "No value" },
  carried_over: { tone: "warning", label: "Inherited" },
  for_this_year: { tone: "success", label: "Entered for this year" },
} as const;

export function ReviewPanel({
  review,
  onAdd,
}: {
  review: ReviewData;
  onAdd: (activityType: string) => void;
}) {
  const router = useRouter();
  const years = review.years;
  const missing = review.items.filter((i) => i.state === "missing");
  const carried = review.items.filter((i) => i.state === "carried_over");
  const done = review.items.length - missing.length - carried.length;
  const todo = [...missing, ...carried];

  return (
    <section
      aria-labelledby="factor-review-heading"
      className="mb-6 space-y-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="factor-review-heading" className="text-base font-semibold">
            Yearly review
          </h2>
          <p className="text-sm text-muted-foreground">
            No official service publishes these factors (SEBI&apos;s BRSR is a disclosure format;
            CEA&apos;s grid factor is a yearly file). Check each activity once a year and add a
            version with its source.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="review-fy">Financial year</Label>
          <NativeSelect
            id="review-fy"
            value={review.financialYear}
            onChange={(e) => router.push(`/admin/conversion-factors?fy=${e.target.value}`)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                FY {y}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <p className="text-sm" role="status">
        On 1 April of FY {review.financialYear}: <strong>{missing.length}</strong> with no value,{" "}
        <strong>{carried.length}</strong> inherited from an earlier year, <strong>{done}</strong>{" "}
        entered for this year.
      </p>
      {todo.length ? (
        // Folded by default: with dozens of activities the list would push the factor table off the screen.
        <details className="group rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Show the {todo.length} activit{todo.length === 1 ? "y" : "ies"} to check for FY{" "}
            {review.financialYear}
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {todo.map((item) => (
              <li
                key={item.activityType}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{item.activityName}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.activityType}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={STATE[item.state].tone}>
                    {item.inheritedFrom
                      ? `Inherited from FY ${item.inheritedFrom}`
                      : STATE[item.state].label}
                  </StatusBadge>
                  {item.drafts ? (
                    <StatusBadge tone="warning">{`${item.drafts} waiting for approval`}</StatusBadge>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={() => onAdd(item.activityType)}>
                    Add value for FY {review.financialYear}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
