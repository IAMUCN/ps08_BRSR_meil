"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { remindMissingAction } from "./actions";

/** Reminds everyone who can file a missing expected submission for the period on screen. */
export function RemindButton({ orgUnitId, periodId }: { orgUnitId: string; periodId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await remindMissingAction({ orgUnitId, periodId });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const { reminded, emailed, alreadyReminded } = result.data;
          if (reminded === 0) {
            toast.message(
              alreadyReminded > 0
                ? "Everyone was already reminded in the last day."
                : "Nobody is assigned who could file these — assign users on the Users page.",
            );
            return;
          }
          toast.success(
            `Reminded ${reminded} ${reminded === 1 ? "person" : "people"} in the app; ${emailed} by email${
              alreadyReminded ? `; ${alreadyReminded} already reminded today` : ""
            }.`,
          );
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <BellRing aria-hidden />}
      Send reminders
    </Button>
  );
}
