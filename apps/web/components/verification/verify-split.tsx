"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DocumentViewer, type Region } from "@/components/document-viewer/document-viewer";
import { VerifyWorkspace } from "@/components/verification/verify-workspace";
import { fieldSourcesAction } from "@/app/app/verify/[documentId]/actions";
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

  useEffect(() => {
    if (!workable) return;
    let live = true;
    void fieldSourcesAction(doc.documentId).then((result) => {
      if (live && result.ok) setSources(result.data);
    });
    return () => {
      live = false;
    };
  }, [doc.documentId, workable]);

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
      })),
    );
  }, [sources, doc.fields, doc.threshold, selectedKey]);

  return (
    <div className="grid gap-4 xl:grid-cols-[55fr_45fr]">
      <DocumentViewer
        src={`/api/documents/${doc.documentId}/file`}
        mimeType={doc.mimeType}
        fileName={doc.fileName}
        className="max-h-[calc(100vh-10rem)]"
        regions={regions}
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
