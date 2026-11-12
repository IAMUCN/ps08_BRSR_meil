"use client";

import { BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AlertSettings } from "@/lib/analytics/alerts";
import type { EmissionAlert } from "@/lib/trpc/routers/analytics";
import { acknowledgeAlertAction, runAlertsAction, updateAlertSettingsAction } from "./actions";

// Emission threshold alerts (feature_enhancement.md 7.3; A47): what was found, the figures behind it, and
// acknowledging it. A Super Admin also sets the thresholds and can run the daily check now.

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 1 });
const SCOPE: Record<EmissionAlert["scopeCode"], string> = {
  SCOPE_1: "Scope 1",
  SCOPE_2: "Scope 2",
  SCOPE_3: "Scope 3",
};

export function AlertsPanel({
  alerts,
  settings,
  isSuperAdmin,
  canAcknowledge,
}: {
  alerts: EmissionAlert[];
  settings: AlertSettings;
  isSuperAdmin: boolean;
  /** Super Admin or Administrator; a read-only viewer (Corporate ESG) sees the alerts as they stand. */
  canAcknowledge: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runNow() {
    startTransition(async () => {
      const result = await runAlertsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const s = result.data;
      toast.success(
        s.newAlerts
          ? `${s.newAlerts} new alert(s); ${s.sent.inApp} notification(s) and ${s.sent.email} email(s) sent`
          : `Checked ${s.checked} figure(s); no new alert`,
      );
      router.refresh();
    });
  }

  return (
    <section
      id="alerts"
      aria-labelledby="alerts-heading"
      className="space-y-3 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="alerts-heading" className="flex items-center gap-2 text-base font-semibold">
            <BellRing className="size-4" aria-hidden />
            Emission alerts
          </h2>
          <p className="text-sm text-muted-foreground">
            {settings.enabled
              ? `Checked every day at 9:00. A closed period alerts when its approved emissions are more than the
                 threshold above the same period's average in up to three earlier years (at least
                 ${settings.minBaselineYears}). Periods with anything missing, awaiting approval or uncalculated are
                 not compared.`
              : "The daily check is switched off."}
          </p>
        </div>
        {isSuperAdmin ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={runNow}>
            {pending ? "Checking…" : "Check now"}
          </Button>
        ) : null}
      </div>

      {alerts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No alerts for this part of the organisation.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <AlertItem key={a.id} alert={a} canAcknowledge={canAcknowledge} />
          ))}
        </ul>
      )}

      {isSuperAdmin ? <SettingsForm settings={settings} /> : null}
    </section>
  );
}

function AlertItem({ alert, canAcknowledge }: { alert: EmissionAlert; canAcknowledge: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const over = ((alert.measuredT - alert.baselineT) / alert.baselineT) * 100;

  function acknowledge(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await acknowledgeAlertAction({ id: alert.id, note });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Alert acknowledged");
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={alert.status === "open" ? "warning" : "neutral"}>
          {alert.status === "open" ? "Open" : "Acknowledged"}
        </StatusBadge>
        <span className="font-semibold">
          {alert.orgUnitName} · {alert.periodLabel} · {SCOPE[alert.scopeCode]}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Measured</dt>
          <dd className="font-mono">{fmt(alert.measuredT)} tCO2e</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Expected average</dt>
          <dd className="font-mono">{fmt(alert.baselineT)} tCO2e</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Difference</dt>
          <dd className="font-mono">
            +{fmt(alert.measuredT - alert.baselineT)} tCO2e (+{Math.round(over)}%)
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Threshold</dt>
          <dd className="font-mono">+{fmt(alert.thresholdPct)}%</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Average of {alert.baselinePeriods.map((b) => `${b.label} (${fmt(b.tco2e)})`).join(", ")}.
      </p>
      {alert.status === "acknowledged" ? (
        <p className="text-xs">
          Acknowledged by {alert.acknowledgedBy ?? "someone"}
          {alert.acknowledgedAt
            ? ` on ${new Date(alert.acknowledgedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`
            : ""}
          : {alert.acknowledgedNote}
        </p>
      ) : !canAcknowledge ? null : open ? (
        <form onSubmit={acknowledge} className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor={`ack-${alert.id}`}>What was found, or what will be done</Label>
            <Input
              id={`ack-${alert.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              minLength={3}
              maxLength={1000}
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Acknowledge"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Acknowledge…
        </Button>
      )}
    </li>
  );
}

function SettingsForm({ settings }: { settings: AlertSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    enabled: settings.enabled,
    s1: String(settings.thresholdPct.SCOPE_1),
    s2: String(settings.thresholdPct.SCOPE_2),
    s3: String(settings.thresholdPct.SCOPE_3),
    years: String(settings.minBaselineYears),
    minIncrease: String(settings.minIncreaseTco2e),
    lookback: String(settings.lookbackDays),
  });

  function save(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateAlertSettingsAction({
        enabled: form.enabled,
        thresholdPct: {
          SCOPE_1: Number(form.s1),
          SCOPE_2: Number(form.s2),
          SCOPE_3: Number(form.s3),
        },
        minBaselineYears: Number(form.years),
        minIncreaseTco2e: Number(form.minIncrease),
        lookbackDays: Number(form.lookback),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Alert settings saved");
      router.refresh();
    });
  }

  const field = (
    key: keyof typeof form,
    label: string,
    props: { min: number; max: number; step?: string },
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`alert-${key}`}>{label}</Label>
      <Input
        id={`alert-${key}`}
        type="number"
        required
        {...props}
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">Alert settings (Super Admin)</summary>
      <form onSubmit={save} className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Run the daily check
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {field("s1", "Scope 1 threshold, % above average", { min: 1, max: 1000 })}
          {field("s2", "Scope 2 threshold, % above average", { min: 1, max: 1000 })}
          {field("s3", "Scope 3 threshold, % above average", { min: 1, max: 1000 })}
          {field("years", "Earlier years needed for an average", { min: 1, max: 3 })}
          {field("minIncrease", "Smallest increase that alerts, tCO2e", {
            min: 0,
            max: 1000000,
            step: "0.1",
          })}
          {field("lookback", "Check periods ended within, days", { min: 1, max: 730 })}
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </details>
  );
}
