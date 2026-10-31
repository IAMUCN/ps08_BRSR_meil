"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { PeriodRow } from "@/lib/trpc/routers/reporting-periods";
import { createPeriodAction, transitionPeriodAction, updatePeriodWindowAction } from "./actions";

const STATUS: Record<PeriodRow["status"], { tone: StatusTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  open: { tone: "success", label: "Open" },
  closed: { tone: "locked", label: "Closed" },
};

type Pending =
  | { kind: "open"; period: PeriodRow }
  | { kind: "close"; period: PeriodRow }
  | { kind: "reopen"; period: PeriodRow };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PeriodsManager({ periods }: { periods: PeriodRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [windowPeriod, setWindowPeriod] = useState<PeriodRow | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [newClosesOn, setNewClosesOn] = useState("");
  const needsDate = confirm?.period.deadlinePassed ?? false;
  const dateMissing = needsDate && (!newClosesOn || newClosesOn < (confirm?.period.today ?? ""));
  const dateField =
    confirm && needsDate ? (
      <div className="space-y-2 text-foreground">
        <p>
          This period&apos;s deadline has passed, so it needs a new submissions close date. It
          closes by itself at the end of that day, India time.
        </p>
        <Label htmlFor="period-new-closes">New submissions close date</Label>
        <Input
          id="period-new-closes"
          type="date"
          min={confirm.period.today}
          value={newClosesOn}
          onChange={(e) => setNewClosesOn(e.target.value)}
        />
      </div>
    ) : null;
  const anotherOpen = (period: PeriodRow) =>
    periods.some((p) => p.status === "open" && p.id !== period.id);

  function transition(period: PeriodRow, to: "open" | "closed", reason?: string) {
    startTransition(async () => {
      const result = await transitionPeriodAction({
        id: period.id,
        to,
        reason,
        acknowledgeUnresolved: to === "closed",
        newClosesOn: to === "open" && needsDate ? newClosesOn : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(to === "open" ? "Period opened" : "Period closed");
      setConfirm(null);
      setNewClosesOn("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        {/* One side panel at a time: they dock in the same place and do not close on a click elsewhere, so
            a second one opened over the first would leave the first open underneath and its button dead. */}
        <Button
          onClick={() => {
            setWindowPeriod(null);
            setCreateOpen(true);
          }}
        >
          <CalendarPlus aria-hidden />
          Create period
        </Button>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-md border bg-card px-6 py-12 text-center">
          <p className="text-base font-semibold">Create your first reporting period</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Users can&apos;t upload any evidence until a reporting period is open.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-table-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                {["Period", "Covers", "Submission window", "Status", ""].map((heading, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {heading || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr
                  key={period.id}
                  className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                >
                  <td className="px-3 py-3">
                    <span className="font-medium">{period.label}</span>
                    <span className="block text-xs text-muted-foreground capitalize">
                      {period.periodType}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {formatDate(period.startDate)} – {formatDate(period.endDate)}
                  </td>
                  <td className="px-3 py-3">
                    {period.submissionOpensOn || period.submissionClosesOn ? (
                      `${formatDate(period.submissionOpensOn)} – ${formatDate(period.submissionClosesOn)}`
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={STATUS[period.status].tone}>
                      {STATUS[period.status].label}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCreateOpen(false);
                          setWindowPeriod(period);
                        }}
                      >
                        Edit window
                      </Button>
                      {period.status === "draft" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending || anotherOpen(period)}
                          title={anotherOpen(period) ? "Another period is open" : undefined}
                          onClick={() => setConfirm({ kind: "open", period })}
                        >
                          Open
                        </Button>
                      ) : null}
                      {period.status === "open" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => setConfirm({ kind: "close", period })}
                        >
                          Close
                        </Button>
                      ) : null}
                      {period.status === "closed" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending || anotherOpen(period)}
                          title={anotherOpen(period) ? "Another period is open" : undefined}
                          onClick={() => setConfirm({ kind: "reopen", period })}
                        >
                          Reopen
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === "open"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Open ${confirm?.period.label}?`}
        confirmLabel="Open period"
        pending={pending}
        blocked={dateMissing}
        onConfirm={() => confirm && transition(confirm.period, "open")}
      >
        <p>Users can upload evidence into this period while it is open.</p>
        {dateField}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "close"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Close ${confirm?.period.label}?`}
        confirmLabel="Close period"
        destructive
        pending={pending}
        onConfirm={() => confirm && transition(confirm.period, "closed")}
      >
        <p>Uploads into this period stop once it is closed.</p>
        {confirm && confirm.period.unresolvedValidation > 0 ? (
          <p className="font-medium text-foreground">
            {confirm.period.unresolvedValidation} record(s) still have unresolved validation issues.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.kind === "reopen"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Reopen ${confirm?.period.label}?`}
        confirmLabel="Reopen period"
        destructive
        pending={pending}
        blocked={dateMissing}
        requireReason={{ label: "Reason for reopening (recorded in the audit trail)" }}
        onConfirm={(reason) => confirm && transition(confirm.period, "open", reason)}
      >
        <p>New or corrected data can land in a period that was already closed.</p>
        {dateField}
        {confirm && confirm.period.reportRuns > 0 ? (
          <p className="font-medium text-foreground">
            {confirm.period.reportRuns} report(s) were generated for this period; their figures may
            no longer match.
          </p>
        ) : null}
      </ConfirmDialog>

      <CreatePeriodSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onDone={() => router.refresh()}
      />
      {windowPeriod ? (
        <WindowSheet
          key={windowPeriod.id}
          period={windowPeriod}
          onClose={() => setWindowPeriod(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function CreatePeriodSheet({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    label: "",
    periodType: "monthly" as "monthly" | "annual",
    startDate: "",
    endDate: "",
    submissionOpensOn: "",
    submissionClosesOn: "",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createPeriodAction(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Period created");
      onOpenChange(false);
      setForm({
        label: "",
        periodType: "monthly",
        startDate: "",
        endDate: "",
        submissionOpensOn: "",
        submissionClosesOn: "",
      });
      onDone();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create reporting period</SheetTitle>
          <SheetDescription>
            New periods start as drafts; open one when submissions should begin.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="period-label">Label</Label>
            <Input
              id="period-label"
              placeholder="October 2026"
              value={form.label}
              onChange={(e) => set("label")(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="period-type">Type</Label>
            <NativeSelect
              id="period-type"
              value={form.periodType}
              onChange={(e) => set("periodType")(e.target.value)}
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </NativeSelect>
          </div>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-sm font-medium">Period covered</legend>
            <div className="space-y-2">
              <Label htmlFor="period-start">Start date</Label>
              <Input
                id="period-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-end">End date</Label>
              <Input
                id="period-end"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate")(e.target.value)}
                required
              />
            </div>
          </fieldset>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-sm font-medium">Submission window (optional)</legend>
            <div className="space-y-2">
              <Label htmlFor="window-opens">Opens on</Label>
              <Input
                id="window-opens"
                type="date"
                value={form.submissionOpensOn}
                onChange={(e) => set("submissionOpensOn")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="window-closes">Due by</Label>
              <Input
                id="window-closes"
                type="date"
                value={form.submissionClosesOn}
                onChange={(e) => set("submissionClosesOn")(e.target.value)}
              />
            </div>
          </fieldset>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Create period
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function WindowSheet({
  period,
  onClose,
  onDone,
}: {
  period: PeriodRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [opensOn, setOpensOn] = useState(period.submissionOpensOn ?? "");
  const [closesOn, setClosesOn] = useState(period.submissionClosesOn ?? "");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updatePeriodWindowAction({
        id: period.id,
        submissionOpensOn: opensOn,
        submissionClosesOn: closesOn,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Submission window saved");
      onClose();
      onDone();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Submission window · {period.label}</SheetTitle>
          <SheetDescription>
            Guidance dates only — uploads are controlled by opening and closing the period.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-opens">Opens on</Label>
              <Input
                id="edit-opens"
                type="date"
                value={opensOn}
                onChange={(e) => setOpensOn(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-closes">Due by</Label>
              <Input
                id="edit-closes"
                type="date"
                value={closesOn}
                onChange={(e) => setClosesOn(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save window
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
