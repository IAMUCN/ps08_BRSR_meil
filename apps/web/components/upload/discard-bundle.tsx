"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { discardBundleAction } from "@/app/app/upload/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** Drops a multi-bill PDF uploaded by mistake, before anything is recorded from it. */
export function DiscardBundle({ documentId, fileName }: { documentId: string; fileName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        Discard this PDF
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Discard this PDF?"
        confirmLabel="Discard"
        destructive
        pending={pending}
        onConfirm={() =>
          start(async () => {
            const result = await discardBundleAction({ documentId });
            if (!result.ok) {
              toast.error(result.error);
              setOpen(false);
              return;
            }
            toast.success("PDF discarded");
            router.push("/app/submissions");
          })
        }
      >
        <p>
          {fileName} leaves your list and nothing is recorded from it. You can upload it again
          later.
        </p>
      </ConfirmDialog>
    </>
  );
}
