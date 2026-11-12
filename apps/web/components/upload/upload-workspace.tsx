"use client";

import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { cn } from "cn";
import { ExpectedProgressPanel } from "./expected-progress";
import { RowUpload } from "./row-upload";
import { UploadForm } from "./upload-form";

// The Upload page: the table of submissions (owner's request after the mid evaluation, 2026-11-12), and
// below it the chosen project's expected submissions for the first row's period (owner's request,
// 2026-11-11). Replacing a failed or returned document keeps the one-file form beside the list.
export function UploadWorkspace(
  props: Omit<ComponentProps<typeof UploadForm>, "onUploaded" | "onTargetChange"> & {
    draft: ComponentProps<typeof RowUpload>["draft"];
    /** The months a bill may be typed for in Manual mode. */
    billingMonths: ComponentProps<typeof RowUpload>["periods"];
  },
) {
  const { draft, billingMonths: _months, ...formProps } = props;
  void _months;
  const [target, setTarget] = useState({
    orgUnitId: props.replaces?.orgUnitId ?? props.targets[0].orgUnitId,
    periodId: props.periods[0].id,
  });
  const [uploads, setUploads] = useState(0);
  const unit = props.targets.find((t) => t.orgUnitId === target.orgUnitId) ?? props.targets[0];
  // The expected-submissions list follows the first row's month, which may be a late or closed one.
  const period =
    [...props.periods, ...props.billingMonths].find((p) => p.id === target.periodId) ??
    props.periods[0];
  const onTargetChange = useCallback(
    (orgUnitId: string, periodId: string) =>
      setTarget((t) =>
        t.orgUnitId === orgUnitId && t.periodId === periodId ? t : { orgUnitId, periodId },
      ),
    [],
  );
  const onUploaded = useCallback(() => setUploads((n) => n + 1), []);
  // Manual: the rows with typed values (A60). Automatic: drop the bills and let EmeilSG find and read them, as
  // before (owner's request, 2026-11-13). Each person's last choice is remembered on this browser.
  const [mode, setMode] = useState<"manual" | "automatic">("manual");
  useEffect(() => {
    try {
      // Read after hydration: the server cannot know this browser's choice.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("upload-mode") === "automatic") setMode("automatic");
    } catch {
      // Storage blocked: stay on manual.
    }
  }, []);
  const choose = (next: "manual" | "automatic") => {
    setMode(next);
    try {
      localStorage.setItem("upload-mode", next);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  };
  const progress = (
    <ExpectedProgressPanel
      orgUnitId={unit.orgUnitId}
      periodId={period.id}
      orgUnitName={unit.name}
      periodLabel={period.label}
      refreshKey={uploads}
    />
  );

  if (props.replaces) {
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <UploadForm {...formProps} onUploaded={onUploaded} onTargetChange={onTargetChange} />
        {progress}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-5 text-muted-foreground">
          {mode === "manual"
            ? "Manual: type each bill's value; EmeilSG checks it against the document."
            : "Automatic: drop the bills; EmeilSG finds each one and reads its values."}
        </p>
        <div
          role="radiogroup"
          aria-label="Upload mode"
          className="inline-flex rounded-md border border-border bg-surface p-0.5 text-sm"
        >
          {(["manual", "automatic"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => choose(m)}
              className={cn(
                "min-h-8 rounded-sm px-3 font-medium capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === "manual" ? (
        <>
          <RowUpload
            periods={props.billingMonths}
            targets={props.targets}
            maxBytes={props.maxBytes}
            draft={draft}
            onTargetChange={onTargetChange}
            onUploaded={onUploaded}
          />
          <div className="max-w-xl">{progress}</div>
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UploadForm {...formProps} onUploaded={onUploaded} onTargetChange={onTargetChange} />
          {progress}
        </div>
      )}
    </div>
  );
}
