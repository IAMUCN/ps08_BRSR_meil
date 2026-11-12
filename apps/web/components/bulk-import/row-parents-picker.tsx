"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sameName } from "@/lib/org/rules";

/** A unit a row may sit under: one that exists already, or another row of the same sheet. */
export type ParentOption = {
  /** How the import names it: its code, or its name when it has none. */
  ref: string;
  name: string;
  /** Its level and, for a row of the sheet, that it is one. */
  note: string;
};

/**
 * The parents of one row of an uploaded org-unit sheet, as boxes to tick (owner's page feedback,
 * 2026-10-11): a project two subsidiaries run gets both without anyone typing a name. The first parent
 * ticked is where the unit is created and later moved from; with none ticked it goes under the unit chosen
 * on screen. A parent the sheet named that is not in the list stays shown, so it can be unticked.
 */
export function RowParentsPicker({
  rowName,
  parents,
  options,
  chosenUnit,
  onChange,
}: {
  rowName: string;
  /** The row's parents as the import will send them, main one first. */
  parents: string[];
  options: ParentOption[];
  /** The unit chosen on screen: where a row with no parent goes. */
  chosenUnit: string;
  onChange: (parents: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const wanted = filter.trim().toLowerCase();
  const ticked = (option: ParentOption) => parents.some((ref) => sameName(ref, option.ref));
  const unknown = parents.filter((ref) => !options.some((o) => sameName(ref, o.ref)));
  const shown = options.filter(
    (o) =>
      !wanted ||
      ticked(o) ||
      o.name.toLowerCase().includes(wanted) ||
      o.ref.toLowerCase().includes(wanted),
  );
  const toggle = (ref: string, on: boolean) =>
    onChange(on ? [...parents, ref] : parents.filter((p) => !sameName(p, ref)));
  const row = "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 text-sm";

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Choose the parents of ${rowName || "this row"}`}
        className="inline-flex max-w-full items-center gap-1 rounded-sm border border-input px-2 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 truncate">
          {parents.length > 0 ? parents.join(", ") : `(${chosenUnit})`}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2">
        <p className="px-1 text-xs leading-4 text-muted-foreground">
          Tick every unit {rowName || "this row"} belongs to. With none ticked it is created under{" "}
          {chosenUnit}. The first one ticked is where it is later moved and deactivated from.
        </p>
        {options.length > 8 ? (
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or code…"
            aria-label="Filter the list of parents"
          />
        ) : null}
        <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {unknown.map((ref) => (
            <label key={`unknown-${ref}`} className={`${row} cursor-pointer hover:bg-muted`}>
              <input
                type="checkbox"
                className="size-4"
                checked
                onChange={() => toggle(ref, false)}
              />
              <span className="truncate">{ref}</span>
              <span className="text-xs text-status-error">not in the list</span>
            </label>
          ))}
          {shown.map((option) => (
            <label key={option.ref} className={`${row} cursor-pointer hover:bg-muted`}>
              <input
                type="checkbox"
                className="size-4"
                checked={ticked(option)}
                onChange={(e) => toggle(option.ref, e.target.checked)}
              />
              <span className="truncate">
                {option.name}
                {parents.length > 1 && sameName(parents[0], option.ref) ? (
                  <span className="text-xs text-muted-foreground"> · first</span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{option.note}</span>
            </label>
          ))}
          {options.length === 0 && unknown.length === 0 ? (
            <p className="px-3 py-2 text-xs leading-4 text-muted-foreground">
              No unit can be a parent of this row: a parent must be at an earlier level.
            </p>
          ) : shown.length === 0 && unknown.length === 0 ? (
            <p className="px-3 py-2 text-xs leading-4 text-muted-foreground">Nothing matches.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
