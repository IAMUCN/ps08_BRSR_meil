import { AlertTriangle, ArrowRight, Calculator } from "lucide-react";
import { cn } from "cn";
import { formatQuantity, type CalculationState } from "@/lib/calculation/trace";

// The calculation trace (UI brief §12.5 "input → factor → output"; §7 monospace for system-of-record
// values). Every number shown here comes from the stored `calculations` row — nothing is recomputed in the
// browser, so what a reviewer reads is exactly what was persisted.

export function CalculationTraceView({
  state,
  className,
}: {
  state: CalculationState;
  className?: string;
}) {
  if (!state.trace) {
    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border border-status-warning/40 bg-status-warning/5 px-3 py-2.5",
          className,
        )}
      >
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-status-warning"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm leading-5 font-medium">Not calculated yet</p>
          <p className="text-xs leading-4 text-muted-foreground">
            {state.blockedReason ??
              "This record has no calculation. An Admin can run it once the conversion factor exists."}
          </p>
        </div>
      </div>
    );
  }

  const t = state.trace;
  return (
    <div className={cn("rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Calculator className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <p className="text-sm font-medium">Calculation trace</p>
        {t.scopeName ? (
          <span className="ml-auto text-xs text-muted-foreground">{t.scopeName}</span>
        ) : null}
      </div>
      <dl className="divide-y font-mono text-xs">
        <Row label="Verified value" value={formatQuantity(t.inputValue, t.inputUnit)} />
        <Row label="Normalised" value={formatQuantity(t.normalizedValue, t.normalizedUnit)} />
        {t.factorValue !== null ? (
          <Row
            label="Factor"
            value={`${t.factorValue} ${t.factorOutputUnit ?? ""}/${t.factorInputUnit ?? ""}`}
            note={`${t.factorName ?? "Factor"} v${t.factorVersion ?? "?"} — ${t.factorSource ?? "no source recorded"}`}
          />
        ) : null}
        <Row
          label="Result"
          value={formatQuantity(t.resultValue, t.resultUnit)}
          emphasis
          note={`Engine ${t.engineVersion} · ${new Date(t.calculatedAt).toLocaleString("en-IN")}`}
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <dt className="flex w-28 shrink-0 items-center gap-1 font-sans text-muted-foreground">
        {emphasis ? <ArrowRight className="size-3" strokeWidth={1.5} aria-hidden /> : null}
        {label}
      </dt>
      <dd className="min-w-0 flex-1">
        <span className={cn("break-words", emphasis && "font-semibold")}>{value}</span>
        {note ? <span className="block font-sans text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  );
}
