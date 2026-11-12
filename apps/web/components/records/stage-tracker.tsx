import { Check, CircleDot, Circle, CircleX } from "lucide-react";
import { cn } from "cn";
import { trackOf, type Statuses } from "@/lib/records/stage";

/** The five steps of a record, who it waits on and what happens next (feature_enhancement.md 2.2). */
export function StageTracker({
  statuses,
  submittedBy,
}: {
  statuses: Statuses;
  submittedBy: string;
}) {
  const track = trackOf(statuses, submittedBy);
  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-4" aria-label="Record progress">
        {track.steps.map((step) => {
          const Icon =
            step.state === "done"
              ? Check
              : step.state === "current"
                ? CircleDot
                : step.state === "stopped"
                  ? CircleX
                  : Circle;
          return (
            <li
              key={step.label}
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-1 shrink-0 whitespace-nowrap",
                step.state === "todo" && "text-muted-foreground",
                step.state === "current" && "font-semibold text-foreground",
                step.state === "stopped" && "font-semibold text-status-error",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {step.label}
              <span className="sr-only">
                {step.state === "done"
                  ? " (done)"
                  : step.state === "current"
                    ? " (current step)"
                    : step.state === "stopped"
                      ? " (stopped here)"
                      : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {track.waitingOn || track.nextAction ? (
        <p className="text-sm leading-5">
          {track.waitingOn ? (
            <>
              <span className="text-muted-foreground">Waiting on:</span> {track.waitingOn}.{" "}
            </>
          ) : null}
          {track.nextAction ? (
            <>
              <span className="text-muted-foreground">Next:</span> {track.nextAction}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
