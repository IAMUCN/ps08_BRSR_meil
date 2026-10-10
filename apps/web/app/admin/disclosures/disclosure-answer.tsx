"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveDisclosureAction } from "./actions";

/** One BRSR question with its typed answer for one financial year. Saving an empty answer clears it. */
export function DisclosureAnswer({
  indicatorId,
  financialYear,
  code,
  type,
  question,
  measured,
  initial,
}: {
  indicatorId: string;
  financialYear: number;
  code: string;
  type: string | null;
  question: string;
  /** The app fills this question's figures from approved records; a typed answer is an added note. */
  measured: boolean;
  initial: string;
}) {
  const router = useRouter();
  const id = useId();
  const [saved, setSaved] = useState(initial);
  const [answer, setAnswer] = useState(initial);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const result = await saveDisclosureAction({ indicatorId, financialYear, answer });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSaved(answer.trim());
      setAnswer(answer.trim());
      toast.success(`${code} saved`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm leading-5">
        <span className="mr-2 rounded-sm border px-1.5 font-mono text-xs">{code}</span>
        {type ? (
          <span className="mr-2 text-xs text-muted-foreground capitalize">{type}</span>
        ) : null}
        {question}
      </label>
      {measured ? (
        <p className="text-xs leading-4 text-muted-foreground">
          The figures for this question come from approved records. Anything typed here is printed
          under them as a note.
        </p>
      ) : null}
      <textarea
        id={id}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={answer.length > 300 ? 8 : 3}
        maxLength={20000}
        placeholder={measured ? "Optional note" : "Not reported"}
        className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || answer.trim() === saved}
        onClick={save}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Save
      </Button>
    </div>
  );
}
