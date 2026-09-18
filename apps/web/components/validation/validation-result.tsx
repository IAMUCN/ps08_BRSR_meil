import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { RULE_TYPES, type Outcome, type RuleType } from "@/lib/validation/checks";

// UI brief §12.4: a compact per-category list (Format ✓, Organizational ✓, … Anomaly — flagged) using the
// same check / alert / x icons as the field-level validation state in §12.2. Color is never the only
// signal: every row says its state in words.

export const OUTCOME_ICON: Record<Outcome, { icon: LucideIcon; className: string; label: string }> =
  {
    pass: { icon: CheckCircle2, className: "text-status-success", label: "Passed" },
    flagged: { icon: AlertTriangle, className: "text-status-warning", label: "Flagged" },
    fail: { icon: XCircle, className: "text-status-error", label: "Failed" },
  };

type Result = { ruleType: RuleType; outcome: Outcome; message: string };

/** Worst outcome wins: fail over flagged over pass. */
function worst(outcomes: Outcome[]): Outcome {
  if (outcomes.includes("fail")) return "fail";
  if (outcomes.includes("flagged")) return "flagged";
  return "pass";
}

export function ValidationResult({
  results,
  className,
}: {
  results: Result[];
  className?: string;
}) {
  return (
    <ul className={cn("divide-y rounded-md border", className)} aria-label="Validation results">
      {RULE_TYPES.map(({ key, label }) => {
        const rows = results.filter((r) => r.ruleType === key);
        if (rows.length === 0) return null;
        const outcome = worst(rows.map((r) => r.outcome));
        const { icon: Icon, className: iconClass, label: outcomeLabel } = OUTCOME_ICON[outcome];
        const shown =
          outcome === "pass" ? rows.slice(0, 1) : rows.filter((r) => r.outcome !== "pass");
        return (
          <li key={key} className="flex items-start gap-3 px-3 py-2.5">
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", iconClass)}
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-5 font-medium">
                {label} <span className="font-normal text-muted-foreground">— {outcomeLabel}</span>
              </p>
              {shown.map((r, i) => (
                <p
                  key={i}
                  className={cn(
                    "text-xs leading-4 break-words",
                    r.outcome === "pass" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {r.message}
                </p>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
