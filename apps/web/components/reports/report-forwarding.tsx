"use client";

import { CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { decideForwardAction, forwardReportAction } from "@/app/admin/reports/actions";
import type { ForwardStep, InboxItem } from "@/lib/trpc/routers/report-forwarding";

// Forwarding a report for verification (feature_enhancement.md Phase 4, requirement 9). The server checks
// who may forward and decide; these controls only appear when it says the caller may.

const STATUS: Record<ForwardStep["status"], { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  returned: { label: "Returned", tone: "error" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

type Ask =
  | { kind: "forward"; fromForwardId?: string }
  | { kind: "verify"; step: ForwardStep }
  | { kind: "return"; step: ForwardStep };

function useForwardingActions() {
  const router = useRouter();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setPending(true);
    const result = await action();
    setPending(false);
    setAsk(null);
    if (!result.ok) {
      toast.error(result.error ?? "That did not work. Try again.");
      return;
    }
    toast.success(done);
    router.refresh();
  }
  return { ask, setAsk, pending, run };
}

/** The decision dialogs shared by the trail and the inbox. */
function Dialogs({
  reportRunId,
  state,
}: {
  reportRunId: string | null;
  state: ReturnType<typeof useForwardingActions>;
}) {
  const { ask, setAsk, pending, run } = state;
  return (
    <>
      <ConfirmDialog
        open={ask?.kind === "forward"}
        onOpenChange={(open) => !open && setAsk(null)}
        title="Forward for verification?"
        confirmLabel="Forward"
        pending={pending}
        requireReason={{
          label: "Note for the verifier (optional)",
          minLength: 0,
          hint: "Sent with the report and kept in its trail.",
        }}
        onConfirm={(note) =>
          ask?.kind === "forward" && reportRunId
            ? run(
                () =>
                  forwardReportAction({
                    reportRunId,
                    fromForwardId: ask.fromForwardId,
                    note: note || undefined,
                  }),
                "Forwarded for verification",
              )
            : undefined
        }
      >
        <p>
          It goes to the Administrators of the next unit up (or the Super Admins at the top), who
          verify it or return it with a reason.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={ask?.kind === "verify"}
        onOpenChange={(open) => !open && setAsk(null)}
        title="Verify this report?"
        confirmLabel="Verify"
        pending={pending}
        onConfirm={() =>
          ask?.kind === "verify"
            ? run(
                () => decideForwardAction({ forwardId: ask.step.id, decision: "verify" }),
                "Verified",
              )
            : undefined
        }
      >
        <p>The sender is told. You can then forward it on to the level above, if needed.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={ask?.kind === "return"}
        onOpenChange={(open) => !open && setAsk(null)}
        title="Return for correction?"
        confirmLabel="Return"
        destructive
        pending={pending}
        requireReason={{
          label: "What needs correcting",
          minLength: 10,
          hint: "The sender sees this; kept in the report's trail.",
        }}
        onConfirm={(reason) =>
          ask?.kind === "return"
            ? run(
                () => decideForwardAction({ forwardId: ask.step.id, decision: "return", reason }),
                "Returned for correction",
              )
            : undefined
        }
      />
    </>
  );
}

function StepActions({
  step,
  state,
}: {
  step: ForwardStep;
  state: ReturnType<typeof useForwardingActions>;
}) {
  if (!step.canDecide && !step.canForwardOn) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {step.canDecide ? (
        <>
          <Button
            size="sm"
            disabled={state.pending}
            onClick={() => state.setAsk({ kind: "verify", step })}
          >
            <CheckCircle2 aria-hidden />
            Verify
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.pending}
            onClick={() => state.setAsk({ kind: "return", step })}
          >
            <RotateCcw aria-hidden />
            Return
          </Button>
        </>
      ) : null}
      {step.canForwardOn ? (
        <Button
          size="sm"
          variant="outline"
          disabled={state.pending}
          onClick={() => state.setAsk({ kind: "forward", fromForwardId: step.id })}
        >
          <Send aria-hidden />
          Forward to the next level
        </Button>
      ) : null}
    </div>
  );
}

/** On a report's page: its forwarding trail, and what the caller may do next. */
export function ReportForwarding({
  reportRunId,
  steps,
  canForward,
}: {
  reportRunId: string;
  steps: ForwardStep[];
  /** The report is ready, the caller may forward it, and nothing is waiting at the first level. */
  canForward: boolean;
}) {
  const state = useForwardingActions();
  return (
    <section
      className="space-y-3 rounded-md border bg-card p-4"
      aria-labelledby="forwarding-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="forwarding-heading" className="text-base font-semibold">
          Verification
        </h2>
        {canForward ? (
          <Button
            size="sm"
            variant="outline"
            disabled={state.pending}
            onClick={() => state.setAsk({ kind: "forward" })}
          >
            {state.pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Forward for verification
          </Button>
        ) : null}
      </div>
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not forwarded for verification yet.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step) => (
            <li key={step.id} className="space-y-1.5 border-l-2 pl-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={STATUS[step.status].tone}>
                  {STATUS[step.status].label}
                </StatusBadge>
                <span>
                  {step.fromUnit} → {step.toUnit ?? "Super Admins"}
                </span>
                <span className="text-muted-foreground">
                  forwarded by {step.forwardedBy}, {when(step.forwardedAt)}
                </span>
              </p>
              {step.note ? <p className="text-muted-foreground">Note: {step.note}</p> : null}
              {step.decidedBy && step.decidedAt ? (
                <p className="text-muted-foreground">
                  {step.status === "verified" ? "Verified" : "Returned"} by {step.decidedBy},{" "}
                  {when(step.decidedAt)}
                  {step.reason ? `: ${step.reason}` : ""}
                </p>
              ) : null}
              <StepActions step={step} state={state} />
            </li>
          ))}
        </ol>
      )}
      <Dialogs reportRunId={reportRunId} state={state} />
    </section>
  );
}

/** On Reports: what is waiting for the caller's verification. */
export function ReportsToVerify({ items }: { items: InboxItem[] }) {
  const state = useForwardingActions();
  if (items.length === 0) return null;
  return (
    <section
      className="space-y-3 rounded-md border border-status-warning/40 bg-card p-4"
      aria-labelledby="to-verify-heading"
    >
      <h2 id="to-verify-heading" className="text-base font-semibold">
        Reports to verify ({items.length})
      </h2>
      <ul className="divide-y">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div>
              <Link
                href={`/admin/reports/${item.reportRunId}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {item.reportLabel}
              </Link>
              <span className="block text-muted-foreground">
                From {item.fromUnit}, forwarded by {item.forwardedBy}, {when(item.forwardedAt)}
                {item.note ? ` — "${item.note}"` : ""}
              </span>
            </div>
            {item.canDecide ? (
              <StepActions step={item} state={state} />
            ) : (
              <span className="text-xs text-muted-foreground">
                You sent this report, so someone else verifies it.
              </span>
            )}
          </li>
        ))}
      </ul>
      <Dialogs reportRunId={null} state={state} />
    </section>
  );
}
