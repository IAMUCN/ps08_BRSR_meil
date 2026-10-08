"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROOT_LEVEL, type OrgLevel } from "@/lib/org/rules";
import { addLevelAction, removeLevelAction, renameLevelAction } from "./actions";

// PRD §11: the hierarchy's levels are configuration (.grill/audit-p2-decisions.md, migration 0037). An Admin
// adds a level after an existing one, renames one, or removes one no org unit uses; a level's position never
// changes once it exists. A plain section by the feature role — the ui role may restyle it (A25).
export function LevelsCard({ levels }: { levels: (OrgLevel & { used: number })[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [after, setAfter] = useState(levels.at(-1)?.code ?? "");

  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: string,
    then?: () => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      then?.();
      router.refresh();
    });
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const label = String(new FormData(form).get("label") ?? "").trim();
    run(
      () => addLevelAction({ label, afterCode: after }),
      `Level “${label}” added.`,
      () => form.reset(),
    );
  }

  function rename(level: OrgLevel, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get("label") ?? "").trim();
    if (label === level.label) return;
    run(() => renameLevelAction({ code: level.code, label }), `Renamed to “${label}”.`);
  }

  return (
    <details className="mt-6 rounded-md border bg-card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Hierarchy levels
        <span className="ml-2 font-normal text-muted-foreground">
          {levels.map((l) => l.label).join(" › ")}
        </span>
      </summary>
      <p className="mt-3 text-sm leading-5 text-muted-foreground">
        A child must be at a later level than its parent; levels can be skipped. A new level takes
        its place after the one you choose and never moves. A level in use cannot be removed.
      </p>
      <ol className="mt-3 divide-y rounded-sm border">
        {levels.map((level, index) => (
          <li key={level.code} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
            <form onSubmit={(e) => rename(level, e)} className="flex flex-1 items-center gap-2">
              <Label htmlFor={`level-${level.code}`} className="sr-only">
                Name of level {index + 1}
              </Label>
              <Input
                id={`level-${level.code}`}
                name="label"
                defaultValue={level.label}
                minLength={2}
                maxLength={60}
                required
                className="max-w-xs"
              />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                Rename
              </Button>
            </form>
            <span className="text-xs text-muted-foreground">
              {level.used} org unit{level.used === 1 ? "" : "s"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || level.used > 0 || level.code === ROOT_LEVEL}
              title={
                level.code === ROOT_LEVEL
                  ? "The root level cannot be removed"
                  : level.used > 0
                    ? "In use — cannot be removed"
                    : undefined
              }
              onClick={() =>
                run(
                  () => removeLevelAction({ code: level.code }),
                  `Level “${level.label}” removed.`,
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="level-new">New level</Label>
          <Input
            id="level-new"
            name="label"
            placeholder="e.g. Package"
            minLength={2}
            maxLength={60}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="level-after">Comes after</Label>
          <NativeSelect id="level-after" value={after} onChange={(e) => setAfter(e.target.value)}>
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          Add level
        </Button>
      </form>
    </details>
  );
}
