"use client";

import { useState, type ComponentProps } from "react";
import { ExpectedProgressPanel } from "./expected-progress";
import { UploadForm } from "./upload-form";

// The Upload page's two halves: the form, and beside it the chosen project's expected submissions for the
// chosen period (owner's request, 2026-11-11). The list follows the form and refreshes after each upload.
export function UploadWorkspace(
  props: Omit<ComponentProps<typeof UploadForm>, "onUploaded" | "onTargetChange">,
) {
  const [target, setTarget] = useState({
    orgUnitId: props.replaces?.orgUnitId ?? props.targets[0].orgUnitId,
    periodId: props.periods[0].id,
  });
  const [uploads, setUploads] = useState(0);
  const unit = props.targets.find((t) => t.orgUnitId === target.orgUnitId) ?? props.targets[0];
  const period = props.periods.find((p) => p.id === target.periodId) ?? props.periods[0];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <UploadForm
        {...props}
        onUploaded={() => setUploads((n) => n + 1)}
        onTargetChange={(orgUnitId, periodId) =>
          setTarget((t) =>
            t.orgUnitId === orgUnitId && t.periodId === periodId ? t : { orgUnitId, periodId },
          )
        }
      />
      <ExpectedProgressPanel
        orgUnitId={unit.orgUnitId}
        periodId={period.id}
        orgUnitName={unit.name}
        periodLabel={period.label}
        refreshKey={uploads}
      />
    </div>
  );
}
