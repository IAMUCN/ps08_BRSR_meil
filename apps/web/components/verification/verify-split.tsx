"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DocumentViewer,
  REGION_TONE,
  type Region,
} from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { VerifyWorkspace } from "@/components/verification/verify-workspace";
import {
  fieldSourcesAction,
  setShowExtractionBoxesAction,
} from "@/app/app/verify/[documentId]/actions";
import type { FieldSources, VerifyDocument } from "@/lib/trpc/routers/verification";
import { isFlagged } from "@/lib/verification/rules";

/**
 * Verify Extraction's two halves kept in step (Phase 3): picking a value boxes where OCR read it on the
 * document, and picking a box on the document picks its value. Without box data (a manual entry, an
 * older upload, a failed read) the screen works exactly as before.
 */
export function VerifySplit({
  doc,
  workable,
  statePanel,
}: {
  doc: VerifyDocument;
  /** The fields can be checked and confirmed; otherwise `statePanel` explains why not. */
  workable: boolean;
  statePanel: ReactNode;
}) {
  const [sources, setSources] = useState<FieldSources | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The eye button (owner's request, 2026-11-11): saved on the account, so the next document opens the same way.
  const [showBoxes, setShowBoxes] = useState(doc.showExtractionBoxes);
  // Boxes exist once OCR has read the document, whether or not it still needs checking.
  const readable = doc.state !== "processing";

  function toggleBoxes() {
    const next = !showBoxes;
    setShowBoxes(next);
    void setShowExtractionBoxesAction(next).then((result) => {
      if (!result.ok) {
        setShowBoxes(!next);
        toast.error(result.error);
      }
    });
  }

  useEffect(() => {
    if (!readable) return;
    let live = true;
    void fieldSourcesAction(doc.documentId).then((result) => {
      if (live && result.ok) setSources(result.data);
    });
    return () => {
      live = false;
    };
  }, [doc.documentId, readable]);

  const regions = useMemo<Region[]>(() => {
    if (!sources) return [];
    return doc.fields.flatMap((field) =>
      (sources.boxes[field.key] ?? []).map((source) => ({
        key: field.key,
        label: field.label,
        page: source.page,
        box: source.box,
        selected: field.key === selectedKey,
        warning: isFlagged(field, doc.threshold),
        // A value a person confirmed or corrected is settled; otherwise the reading's confidence decides.
        tone:
          field.verifiedValue !== null || !isFlagged(field, doc.threshold)
            ? ("ok" as const)
            : field.required
              ? ("blocking" as const)
              : ("check" as const),
      })),
    );
  }, [sources, doc.fields, doc.threshold, selectedKey]);

  return (
    <div className="grid gap-4 xl:grid-cols-[55fr_45fr]">
      <div className="flex min-w-0 flex-col gap-2">
        <DocumentViewer
          src={`/api/documents/${doc.documentId}/file`}
          mimeType={doc.mimeType}
          fileName={doc.fileName}
          className="max-h-[calc(100vh-10rem)]"
          regions={regions}
          showRegions={showBoxes}
          pageSizes={sources?.pageSizes ?? null}
          renderDpi={sources?.renderDpi}
          onRegionClick={(key) => {
            setSelectedKey(key);
            // Bring the matching row into view too.
            document
              .querySelector(`[data-field-key="${CSS.escape(key)}"]`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        />
        {readable ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <Button
              type="button"
              variant={showBoxes ? "default" : "outline"}
              size="sm"
              aria-pressed={showBoxes}
              onClick={toggleBoxes}
              title={
                showBoxes
                  ? "Hide where the values were read"
                  : "Show where each value was read on the document"
              }
            >
              {showBoxes ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              {showBoxes ? "Showing extracted parts" : "Show extracted parts"}
            </Button>
            {showBoxes ? (
              regions.length ? (
                <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Colour key">
                  {(
                    [
                      ["ok", "Read confidently or confirmed"],
                      ["check", "Low confidence, check it"],
                      ["blocking", "Low confidence, needed to confirm"],
                    ] as const
                  ).map(([tone, label]) => (
                    <li key={tone} className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={`inline-block size-3 rounded-sm border-2 ${REGION_TONE[tone]}`}
                      />
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">
                  {sources
                    ? "This document has no record of where its values were read (typed by hand, or read before this was kept)."
                    : "Loading…"}
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
      {workable ? (
        <VerifyWorkspace
          doc={doc}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          diagnostics={sources?.diagnostics ?? {}}
        />
      ) : (
        statePanel
      )}
    </div>
  );
}
