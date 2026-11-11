"use client";

import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { setDescriptionAction } from "@/app/app/verify/[documentId]/actions";
import { Button } from "@/components/ui/button";

export const DESCRIPTION_MAX = 500;

// The document's optional description on Verify (owner's request, 2026-11-11; migration 0063): shown to
// everyone who can open the page; the uploader may change it until the record is approved or rejected.
export function DescriptionEditor({
  documentId,
  description,
  canEdit,
}: {
  documentId: string;
  description: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(description ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    if (!description && !canEdit) return null;
    return (
      <div className="flex flex-wrap items-start gap-2 text-sm leading-5">
        <span className="font-medium">Description:</span>
        <span className={description ? "whitespace-pre-line" : "text-muted-foreground"}>
          {description ?? "None given"}
        </span>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => {
              setText(description ?? "");
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            {description ? "Edit" : "Add"}
          </Button>
        ) : null}
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const result = await setDescriptionAction(documentId, text);
    setSaving(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Description saved");
    setEditing(false);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`desc-${documentId}`} className="text-sm leading-5 font-medium">
        Description <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <textarea
        id={`desc-${documentId}`}
        value={text}
        maxLength={DESCRIPTION_MAX}
        rows={2}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-sm border border-input bg-surface px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {text.length}/{DESCRIPTION_MAX}
        </span>
        <span className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </span>
      </div>
    </div>
  );
}
