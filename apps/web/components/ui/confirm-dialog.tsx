"use client";

import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

/**
 * UI brief §11.5: modal only for actions with real, hard-to-reverse consequence. Optionally requires a
 * written reason (e.g. reopening a closed period).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  destructive = false,
  pending = false,
  requireReason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  requireReason?: { label: string; minLength?: number; hint?: string };
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const reasonMissing =
    Boolean(requireReason) && reason.trim().length < (requireReason?.minLength ?? 1);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        {/* §11.5: colored header bar marks a consequence modal. Cancel below replaces the corner close. */}
        <DialogHeader className="-mx-4 -mt-4 rounded-t-md bg-modal-header px-4 py-3 text-modal-header-foreground">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children ? (
          <DialogDescription asChild>
            <div className="space-y-2 text-sm leading-5 text-muted-foreground">{children}</div>
          </DialogDescription>
        ) : null}
        {requireReason ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{requireReason.label}</Label>
            <textarea
              id="confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              required
              className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {requireReason.hint ? (
              <p className="text-xs leading-4 text-muted-foreground">{requireReason.hint}</p>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending || reasonMissing}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
