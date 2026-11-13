"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plus,
  Pencil,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { OrgTreeSelect } from "@/components/org/org-tree-select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrgUnitBulkImport } from "@/components/bulk-import/org-unit-bulk-import";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { bulkImportOrgUnitsAction } from "@/lib/bulk-import/actions";
import { downloadOrgHierarchy } from "@/lib/bulk-import/xlsx";
import {
  allowedChildTypes,
  checkAlsoUnder,
  checkMove,
  isFrozen,
  levelLabel,
  canShareUnder,
  BUSINESS_UNIT_LEVEL,
  misplaced,
  PROJECT_LEVEL,
  rootOf,
  ROOT_LEVEL,
  singleParent,
  SUBSIDIARY_LEVEL,
  type OrgLevel,
  type OrgUnitType,
} from "@/lib/org/rules";
import type { OrgDeleteCheck, OrgExpectation, OrgUnitRow } from "@/lib/trpc/routers/organization";
import {
  createOrgUnitAction,
  deleteOrgUnitAction,
  orgExpectationsAction,
  setExpectationAction,
  moveOrgUnitAction,
  orgUnitDeleteCheckAction,
  orgUnitImpactAction,
  setOrgUnitChildrenAction,
  setOrgUnitAllParentsAction,
  setOrgUnitStatusAction,
  updateOrgUnitAction,
} from "./actions";

/** The room a docked side panel takes at 1900px and wider (components/ui/sheet.tsx). */
const DOCKED_ROOM = "min-[1900px]:pr-[clamp(20rem,calc(100vw-98.5rem),40rem)]";

type Impact = { descendants: number; activeAssignments: number; inProgressRecords: number };

export function OrgManager({
  nodes,
  levels,
  selectedId,
}: {
  nodes: OrgUnitRow[];
  /** The configured hierarchy levels, in order (migration 0037). */
  levels: OrgLevel[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Every group is the top of its own tree (owner's decision 2026-10-11): usually one, sometimes several.
  const roots = nodes.filter((n) => n.parentId === null);
  const root = roots[0] ?? null;
  const selected = nodes.find((n) => n.id === selectedId) ?? root;

  // A unit is drawn under its main parent and under every unit it also sits under (migration 0044).
  const childrenByParent = useMemo(() => {
    const map = new Map<string, OrgUnitRow[]>();
    for (const node of nodes) {
      for (const parentId of [node.parentId, ...node.alsoUnder]) {
        if (!parentId) continue;
        map.set(parentId, [...(map.get(parentId) ?? []), node]);
      }
    }
    return map;
  }, [nodes]);

  // Every unit above the selected one, through all its parents: a collapsed one shows a small marker.
  const aboveSelected = useMemo(() => {
    const seen = new Set<string>();
    const walk = (id: string | undefined) => {
      const unit = nodes.find((n) => n.id === id);
      for (const parent of unit ? [unit.parentId, ...unit.alsoUnder] : []) {
        if (parent && !seen.has(parent)) {
          seen.add(parent);
          walk(parent);
        }
      }
    };
    walk(selected?.id);
    return seen;
  }, [nodes, selected?.id]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Which add form the side panel shows; closed until one of the two buttons is pressed.
  const [adding, setAdding] = useState<"one" | "many" | null>(null);
  // Which Expected-submissions sections are open: collapsed on load, kept while another unit is picked.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // The hierarchy as a spreadsheet in the bulk-import columns: edit it and upload it again.
  function exportHierarchy() {
    const ref = (id: string | null) => {
      const unit = nodes.find((n) => n.id === id);
      return unit ? (unit.code ?? unit.name) : "";
    };
    // In the order of the tree on screen. A shared unit is listed under each of its parents (owner's page
    // feedback, 2026-10-11), each row naming all of them, with or without a code; what sits under it is
    // listed once, under its main parent.
    const rows: OrgUnitRow[] = [];
    const visit = (node: OrgUnitRow) => {
      if (node.parentId !== null) rows.push(node);
      for (const child of childrenByParent.get(node.id) ?? []) {
        if (child.parentId === node.id) visit(child);
        else rows.push(child);
      }
    };
    roots.forEach(visit);
    downloadOrgHierarchy(
      rows.map((n) => ({
        code: n.code,
        name: n.name,
        level: n.unitType,
        parents: [n.parentId, ...n.alsoUnder].map(ref).filter(Boolean),
      })),
      levels.map((l) => ({ code: l.code, label: l.label })),
    ).catch(() => toast.error("Couldn't create the spreadsheet — try again."));
  }

  // Which drawing of the selected unit is meant: a shared unit is drawn under each parent. Every drawing is
  // highlighted, the one clicked or jumped to fully and the others lightly. Null (a fresh page): all fully.
  const [place, setPlace] = useState<{ id: string; under: string | null } | null>(null);
  const rowId = (id: string, under: string | null) => `org-row-${under ?? "top"}-${id}`;

  function select(id: string, under: string | null = null) {
    setPlace({ id, under });
    router.replace(`${pathname}?node=${id}`, { scroll: false });
  }

  // From the Shared list: go to where the unit sits under that parent — open every unit above it, select
  // it there and bring that row into view.
  function goTo(id: string, under: string) {
    const above = new Set<string>();
    for (let at = nodes.find((n) => n.id === under); at && !above.has(at.id);) {
      above.add(at.id);
      at = nodes.find((n) => n.id === at!.parentId);
    }
    setCollapsed((prev) => new Set([...prev].filter((open) => !above.has(open))));
    select(id, under);
  }
  useEffect(() => {
    if (!place) return;
    // After the branch has opened.
    const frame = requestAnimationFrame(() =>
      document.getElementById(rowId(place.id, place.under))?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [place]);

  // Guide lines (owner's page feedback, 2026-10-11): each unit hangs from a vertical line that drops from
  // its parent's arrow, joined by a short horizontal tick at the middle of its row (rows are 36px high). On
  // the last unit of a branch the vertical line stops at the tick, so a line never runs on past the branch.
  const BRANCH =
    "relative pl-2 before:absolute before:top-[18px] before:left-0 before:h-px before:w-2.5 before:bg-muted-foreground/70 after:absolute after:top-0 after:bottom-0 after:left-0 after:w-px after:bg-muted-foreground/70 last:after:bottom-auto last:after:h-[18px]";

  // `under` is the unit this row is drawn beneath: a shared unit appears once under each of its parents,
  // and is marked where that parent is not its main one.
  function renderNode(node: OrgUnitRow, depth: number, under: OrgUnitRow | null = null) {
    const children = childrenByParent.get(node.id) ?? [];
    const open = !collapsed.has(node.id);
    // Shared = it sits under more than one parent; the tag shows wherever it is drawn (owner's page
    // feedback, 2026-10-11), and says which parent this row is.
    const shared = node.alsoUnder.length > 0 && under !== null;
    const here = under?.id ?? null;
    const isSelected = selected?.id === node.id;
    const current =
      isSelected &&
      (place === null || place.id !== node.id || place.under === null || place.under === here);
    const otherCopy = isSelected && !current;
    return (
      <li key={node.id} className={depth > 0 ? BRANCH : undefined}>
        <div
          id={rowId(node.id, here)}
          className={cn(
            "flex h-9 scroll-my-10 items-center gap-1 rounded-sm pr-2 pl-1",
            current
              ? "bg-table-row-hover"
              : otherCopy
                ? "bg-table-row-hover/50 ring-1 ring-primary-text/30 ring-inset"
                : "hover:bg-muted",
          )}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
              aria-expanded={open}
              className="flex size-6 items-center justify-center rounded-sm hover:bg-muted"
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
              {open ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </button>
          ) : (
            <span className="size-6" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => select(node.id, here)}
            aria-current={current ? "true" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          >
            <span
              className={cn(
                "truncate",
                node.status === "inactive" && "text-muted-foreground line-through",
              )}
            >
              {node.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {levelLabel(levels, node.unitType)}
            </span>
          </button>
          {!open && aboveSelected.has(node.id) ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary-text"
              title="The selected unit is inside"
            />
          ) : null}
          {shared ? (
            <SharedPlaces
              name={node.name}
              here={here}
              parents={[node.parentId, ...node.alsoUnder].flatMap(
                (id) => nodes.find((n) => n.id === id) ?? [],
              )}
              levels={levels}
              onGo={(parentId) => goTo(node.id, parentId)}
            />
          ) : null}
        </div>
        {children.length > 0 && open ? (
          <ul className="ml-4">{children.map((child) => renderNode(child, depth + 1, node))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <>
      {/* While the add panel is docked (1900px and up) the heading and its buttons make room for it too, so
          Add from a spreadsheet and Export hierarchy stay in reach beside the open panel. */}
      <div className={cn("mb-6", adding && DOCKED_ROOM)}>
        <h1 className="text-[32px] leading-10 font-semibold">Organization</h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
            The central repository for your companies, subsidiaries, and project sites. Select any
            unit to view details, configure required ESG submissions, and manage reporting
            permissions, or add new units individually or from a spreadsheet.
          </p>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!selected.ownable}
                onClick={() => setAdding("one")}
              >
                <Plus aria-hidden />
                Add a unit
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selected.ownable}
                onClick={() => setAdding("many")}
              >
                <FileSpreadsheet aria-hidden />
                Add from a spreadsheet
              </Button>
              <Button type="button" variant="outline" onClick={exportHierarchy}>
                <Download aria-hidden />
                Export hierarchy
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tree | the selected unit. The add forms open in a side panel; while it is docked (1900px and up) the
          page makes room for it instead of sitting underneath. */}
      <div
        className={cn(
          "grid items-start gap-6 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]",
          adding && DOCKED_ROOM,
        )}
      >
        <section
          aria-label="Organization hierarchy"
          // Stays in view while the panels beside it scroll.
          className="min-w-0 overflow-x-auto rounded-md border bg-card p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <h2 className="px-2 pt-1 pb-2 text-xs font-bold tracking-wide text-foreground uppercase">
            Organization hierarchy
          </h2>
          <ul>{roots.map((group) => renderNode(group, 0))}</ul>
        </section>
        {selected ? (
          <NodeDetail
            key={`${selected.id}:${selected.parentId}`}
            node={selected}
            nodes={nodes}
            levels={levels}
            openGroups={openGroups}
            onToggleGroup={(group, open) =>
              setOpenGroups((prev) => {
                const next = new Set(prev);
                if (open) next.add(group);
                else next.delete(group);
                return next;
              })
            }
            onChanged={() => router.refresh()}
            onSelect={(id) => select(id)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No organization root exists yet.</p>
        )}
        {selected ? (
          <Sheet open={adding !== null} onOpenChange={(open) => (open ? null : setAdding(null))}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>
                  {adding === "many" ? "Add several units from a spreadsheet" : "Add a unit"}
                </SheetTitle>
                <SheetDescription>
                  {adding === "many"
                    ? "Download the template, list the new units, and upload it."
                    : `Creates a new company, business unit, project or other level directly beneath ${selected.name}, or a new group that stands on its own. To add under a different unit, select it in the tree first.`}
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-4 pb-6">
                {adding ? (
                  <AddChildren
                    key={selected.id}
                    mode={adding}
                    node={selected}
                    nodes={nodes}
                    levels={levels}
                    onChanged={() => router.refresh()}
                    onSelect={(id) => {
                      setAdding(null);
                      select(id);
                    }}
                  />
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </>
  );
}

/**
 * A unit's parents as a list of boxes to tick (owner's page feedback, 2026-10-11) — several can be chosen,
 * which a dropdown cannot do. `fixed` is the parent that is not a choice here: always ticked.
 */
/** A unit as a parent choice reads: its level and where it sits, so two business units with one name in
 *  different subsidiaries can be told apart ("Business Unit · Olectra Greentech"). */
const placeNote = (nodes: OrgUnitRow[], levels: OrgLevel[]) => (choice: OrgUnitRow) => {
  const parent = nodes.find((n) => n.id === choice.parentId);
  return parent
    ? `${levelLabel(levels, choice.unitType)} · ${parent.name}`
    : levelLabel(levels, choice.unitType);
};

function ParentChecklist({
  legend,
  hint,
  fixed,
  fixedNote,
  choices,
  checked,
  levels,
  disabled,
  onToggle,
  note,
  locked,
  emptyText,
}: {
  legend: string;
  hint: string;
  fixed: OrgUnitRow | undefined;
  fixedNote: string;
  choices: OrgUnitRow[];
  checked: Set<string>;
  levels: OrgLevel[];
  disabled: boolean;
  onToggle: (id: string, on: boolean) => void;
  /** Shown beside a choice in place of its level, e.g. where a project sits today. */
  note?: (choice: OrgUnitRow) => string;
  /** Choices that stay ticked and can't be changed here, with the reason as a tooltip. */
  locked?: Map<string, string>;
  emptyText?: string;
}) {
  const [filter, setFilter] = useState("");
  const wanted = filter.trim().toLowerCase();
  // Ticked ones stay in view whatever the filter says, so a choice is never hidden.
  const shown = choices.filter(
    (c) =>
      !wanted ||
      checked.has(c.id) ||
      c.name.toLowerCase().includes(wanted) ||
      c.code?.toLowerCase().includes(wanted),
  );
  const row = "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 text-sm";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm leading-5 font-medium">
        {legend} ({checked.size + (locked?.size ?? 0) + (fixed ? 1 : 0)} included)
      </legend>
      <p className="text-xs leading-4 text-muted-foreground">{hint}</p>
      {choices.length > 8 ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or code…"
          aria-label={`Filter the list of ${legend.toLowerCase()}`}
        />
      ) : null}
      <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
        {fixed ? (
          <label className={cn(row, "text-muted-foreground")}>
            <input type="checkbox" checked disabled className="size-4" />
            <span className="truncate text-foreground">{fixed.name}</span>
            <span className="text-xs">{fixedNote}</span>
          </label>
        ) : null}
        {shown.map((choice) => (
          <label key={choice.id} className={cn(row, "cursor-pointer hover:bg-muted")}>
            <input
              type="checkbox"
              className="size-4"
              checked={checked.has(choice.id) || locked?.has(choice.id) === true}
              disabled={disabled || locked?.has(choice.id) === true}
              title={locked?.get(choice.id)}
              onChange={(e) => onToggle(choice.id, e.target.checked)}
            />
            <span className="truncate">{choice.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {note ? note(choice) : levelLabel(levels, choice.unitType)}
            </span>
          </label>
        ))}
        {choices.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-4 text-muted-foreground">
            {emptyText ??
              "No other unit can be a parent here: a parent must be at an earlier level, active and in the same group."}
          </p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-4 text-muted-foreground">Nothing matches.</p>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * The Shared tag on a unit with more than one parent (owner's page feedback, 2026-10-11). Hovering it — or
 * focusing or pressing it — opens the list of every unit it sits under; choosing one goes to the unit's
 * place under that parent in the tree. With many subsidiaries that is the quick way to find the others.
 */
function SharedPlaces({
  name,
  here,
  parents,
  levels,
  onGo,
}: {
  name: string;
  /** The parent this row is drawn under. */
  here: string | null;
  parents: OrgUnitRow[];
  levels: OrgLevel[];
  onGo: (parentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The list stays while the pointer travels from the tag to it; it closes shortly after leaving both.
  const hold = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  };
  const show = () => {
    hold();
    setOpen(true);
  };
  const leave = () => {
    hold();
    closing.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => hold, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseEnter={show}
        onMouseLeave={leave}
        // A press opens it too (touch, keyboard) and never closes what the pointer just opened.
        onClick={(event) => {
          event.preventDefault();
          show();
        }}
        aria-label={`${name} is shared: show the ${parents.length} units it sits under`}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-text/30 bg-primary-text/5 px-1.5 text-[11px] leading-4 font-medium text-primary-text outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Link2 className="size-3" aria-hidden />
        Shared
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-72 p-1"
        onMouseEnter={hold}
        onMouseLeave={leave}
        // Hovering must not pull the keyboard focus away from the tree.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-2 pt-1.5 pb-1 text-xs leading-4 text-muted-foreground">
          {name} sits under {parents.length} units. Go to it under:
        </p>
        <ul>
          {parents.map((parent) => (
            <li key={parent.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onGo(parent.id);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <span className="min-w-0 flex-1 truncate">{parent.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {parent.id === here ? "you are here" : levelLabel(levels, parent.unitType)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Adding children to the selected node, one at a time or from a spreadsheet — the body of the side panel. */
function AddChildren({
  mode,
  node,
  nodes,
  levels,
  onChanged,
  onSelect,
}: {
  mode: "one" | "many";
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const frozen = isFrozen(node.id, nodes);
  const frozenByAncestor = frozen && node.status === "active";
  const childTypes = allowedChildTypes(levels, node.unitType);
  const [childType, setChildType] = useState<OrgUnitType | "">(
    // Under a business unit the new unit is usually a project (owner's structure, 2026-11-12).
    childTypes.includes(PROJECT_LEVEL) && node.unitType === BUSINESS_UNIT_LEVEL
      ? PROJECT_LEVEL
      : (childTypes[0] ?? ""),
  );
  const [childName, setChildName] = useState("");
  const [childCode, setChildCode] = useState("");
  // A new group has no parent: a separate organization with its own tree (owner's decision 2026-10-11).
  const [where, setWhere] = useState<"under" | "group">(
    frozen || childTypes.length === 0 ? "group" : "under",
  );
  const asGroup = where === "group";
  // Further parents for the new unit, ticked from a list (owner's page feedback, 2026-10-11): every active
  // unit of this group whose level comes before the new unit's. The unit selected in the tree is always one.
  const [extraParents, setExtraParents] = useState<Set<string>>(new Set());
  const group = rootOf(node.id, nodes);
  const parentChoices = childType
    ? nodes.filter(
        (n) =>
          n.id !== node.id &&
          canShareUnder(levels, n.unitType, childType) &&
          rootOf(n.id, nodes) === group &&
          !isFrozen(n.id, nodes),
      )
    : [];
  const ticked = parentChoices.filter((n) => extraParents.has(n.id)).map((n) => n.id);

  function onAddChild(event: FormEvent) {
    event.preventDefault();
    if (!asGroup && !childType) return;
    startTransition(async () => {
      const result = await createOrgUnitAction({
        parentId: asGroup ? null : node.id,
        alsoUnder: asGroup ? [] : ticked,
        unitType: asGroup ? ROOT_LEVEL : childType,
        name: childName,
        code: childCode,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Unit added");
      setChildName("");
      setChildCode("");
      setExtraParents(new Set());
      onSelect(result.data.id);
      onChanged();
    });
  }

  if (mode === "many") {
    return (
      <OrgUnitBulkImport
        nodes={nodes.filter((n) => !isFrozen(n.id, nodes))}
        levels={levels}
        defaultParentId={node.id}
        importAction={bulkImportOrgUnitsAction}
        onImported={onChanged}
      />
    );
  }

  return (
    <>
      <div className="mb-3 space-y-2">
        <Label htmlFor="child-where">Add where</Label>
        <NativeSelect
          id="child-where"
          value={where}
          onChange={(e) => setWhere(e.target.value as "under" | "group")}
        >
          <option value="under">Under {node.name}</option>
          <option value="group">
            On its own, as a new {levelLabel(levels, ROOT_LEVEL).toLowerCase()} (no parent)
          </option>
        </NativeSelect>
        {asGroup ? (
          <p className="text-xs leading-4 text-muted-foreground">
            A new {levelLabel(levels, ROOT_LEVEL).toLowerCase()} is a separate organization with its
            own tree and its own reports. The same Admins manage it.
          </p>
        ) : null}
      </div>
      {!asGroup && frozen ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {node.name} is inactive{frozenByAncestor ? " because a unit above it is inactive" : ""} —
          nothing new can be added under it.
        </p>
      ) : !asGroup && childTypes.length === 0 ? (
        <p className="text-sm leading-5 text-muted-foreground">
          This is the lowest level; nothing can be added beneath it.
        </p>
      ) : (
        <form onSubmit={onAddChild} className="space-y-3">
          {asGroup ? null : (
            <div className="space-y-2">
              <Label htmlFor="child-type">Level</Label>
              <NativeSelect
                id="child-type"
                value={childType}
                onChange={(e) => setChildType(e.target.value as OrgUnitType)}
              >
                {childTypes.map((type) => (
                  <option key={type} value={type}>
                    {levelLabel(levels, type)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {!asGroup && !childTypes.includes(PROJECT_LEVEL) && levelLabel(levels, PROJECT_LEVEL) ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-4 text-muted-foreground">
              {levelLabel(levels, PROJECT_LEVEL)}s can only reside under a{" "}
              {levelLabel(levels, BUSINESS_UNIT_LEVEL).toLowerCase()}. To add one, select a{" "}
              {levelLabel(levels, BUSINESS_UNIT_LEVEL).toLowerCase()} in the tree. A project can
              also be shared with other business units — in this or another{" "}
              {levelLabel(levels, SUBSIDIARY_LEVEL).toLowerCase()} — from its Parents card.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="child-name">Name</Label>
            <Input
              id="child-name"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="child-code">Code (optional)</Label>
            <Input
              id="child-code"
              value={childCode}
              onChange={(e) => setChildCode(e.target.value)}
              className="font-mono"
            />
          </div>
          {/* A business unit has one parent; every other unit can be shared (owner, 2026-11-13). */}
          {asGroup ? null : singleParent(childType) ? (
            <p className="text-xs leading-4 text-muted-foreground">
              A {levelLabel(levels, childType).toLowerCase()} belongs to {node.name} only. Include
              its projects on its own panel once it is added.
            </p>
          ) : (
            <ParentChecklist
              legend="Parents"
              hint={`Tick every unit the new one belongs to. Leave only ${node.name} included for an ordinary unit; tick more to share it: a project can be shared with other business units and with other subsidiaries.`}
              fixed={node}
              fixedNote="selected in the tree"
              choices={parentChoices}
              note={placeNote(nodes, levels)}
              checked={new Set(ticked)}
              levels={levels}
              disabled={pending}
              onToggle={(id, on) =>
                setExtraParents((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
            />
          )}
          <Button type="submit" disabled={pending || childName.trim() === ""}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Add
          </Button>
        </form>
      )}
    </>
  );
}

/**
 * The projects under a business unit (owner's request, 2026-11-12), ticked like a unit's parents: every
 * project of the same group the caller may change, with where it sits today. Saved together.
 */
function ProjectsCard({
  node,
  nodes,
  levels,
  onChanged,
}: {
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const group = rootOf(node.id, nodes);
  const projects = nodes.filter(
    (n) =>
      n.unitType === PROJECT_LEVEL &&
      n.manageable &&
      rootOf(n.id, nodes) === group &&
      (n.parentId === node.id || n.alsoUnder.includes(node.id) || !isFrozen(n.id, nodes)),
  );
  // Projects managed from this business unit stay ticked; they are moved from their own panel.
  const locked = new Map(
    projects
      .filter((p) => p.parentId === node.id)
      .map((p) => [p.id, `Managed from ${node.name}: move it from its own panel`]),
  );
  const saved = projects.filter((p) => p.alsoUnder.includes(node.id)).map((p) => p.id);
  const [ticked, setTicked] = useState<Set<string>>(new Set(saved));
  const changed = ticked.size !== saved.length || saved.some((id) => !ticked.has(id));
  const name = (id: string | null) => nodes.find((n) => n.id === id)?.name;
  const unitLabel = levelLabel(levels, BUSINESS_UNIT_LEVEL).toLowerCase();
  const projectLabel = levelLabel(levels, PROJECT_LEVEL).toLowerCase();
  const sorted = [...projects].sort(
    (a, b) =>
      Number(misplaced(b, nodes, levels) !== null) - Number(misplaced(a, nodes, levels) !== null) ||
      a.name.localeCompare(b.name),
  );

  return (
    <div className="rounded-md border bg-card p-6">
      <h3 className="text-base leading-6 font-semibold">Projects under {node.name}</h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        Tick each existing {projectLabel} that belongs to this {unitLabel}, then save. A{" "}
        {projectLabel} still straight under a {levelLabel(levels, SUBSIDIARY_LEVEL).toLowerCase()}{" "}
        moves here; one already under another {unitLabel} is shared by both, and its figures count
        in each.
      </p>
      <div className="mt-4 space-y-3">
        <ParentChecklist
          legend={levelLabel(levels, PROJECT_LEVEL) + "s"}
          hint={`Projects of this group, including those under another ${levelLabel(levels, SUBSIDIARY_LEVEL).toLowerCase()}'s ${unitLabel}s: a project can be shared across subsidiaries. Beside each: where it sits today. You see the projects you manage.`}
          fixed={undefined}
          fixedNote=""
          choices={sorted}
          checked={ticked}
          locked={locked}
          levels={levels}
          disabled={pending}
          note={(p) => {
            const under = [p.parentId, ...p.alsoUnder].map(name).filter(Boolean).join(", ");
            return misplaced(p, nodes, levels)
              ? `under ${under} — needs a ${unitLabel}`
              : `under ${under}`;
          }}
          emptyText={`No ${projectLabel} in this group yet.`}
          onToggle={(id, on) =>
            setTicked((prev) => {
              const next = new Set(prev);
              if (on) next.add(id);
              else next.delete(id);
              return next;
            })
          }
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !changed}
          onClick={() =>
            startTransition(async () => {
              const result = await setOrgUnitChildrenAction({ id: node.id, childIds: [...ticked] });
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              const n = result.data.changes.length;
              toast.success(n === 1 ? "1 project updated" : `${n} projects updated`);
              onChanged();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save projects
        </Button>
      </div>
    </div>
  );
}

function NodeDetail({
  node,
  nodes,
  levels,
  openGroups,
  onToggleGroup,
  onChanged,
  onSelect,
}: {
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  openGroups: Set<string>;
  onToggleGroup: (group: string, open: boolean) => void;
  onChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const frozen = isFrozen(node.id, nodes);
  const frozenByAncestor = frozen && node.status === "active";
  const parent = nodes.find((n) => n.id === node.parentId);

  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? "");
  const [newParentId, setNewParentId] = useState("");
  const newParentName = nodes.find((n) => n.id === newParentId)?.name ?? "the new parent";
  const [moveOpen, setMoveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletable, setDeletable] = useState<OrgDeleteCheck | null>(null);
  // The checklist's ticks; nothing is written until Save parents.
  // Every parent is a choice, the main one included: unticking it makes the first remaining one the main parent.
  const currentParents = [node.parentId, ...node.alsoUnder].filter(
    (id): id is string => id !== null,
  );
  const [tickedParents, setTickedParents] = useState<Set<string>>(new Set(currentParents));
  const parentsChanged =
    tickedParents.size !== currentParents.length ||
    currentParents.some((id) => !tickedParents.has(id));
  const alsoUnder = node.alsoUnder.flatMap((id) => nodes.find((n) => n.id === id) ?? []);
  // Placed before the structure rules (a project straight under a subsidiary): the first ticked parent
  // becomes its main one when the parents are saved.
  const wrongPlace = misplaced(node, nodes, levels);
  const extraParentTargets = nodes.filter(
    (candidate) =>
      checkAlsoUnder(node.id, candidate.id, nodes, levels).ok && !isFrozen(candidate.id, nodes),
  );
  // A group can be switched off only while another active group remains.
  const canChangeStatus =
    node.parentId !== null ||
    node.status === "inactive" ||
    nodes.some((n) => n.parentId === null && n.id !== node.id && n.status === "active");

  const moveTargets = nodes.filter(
    (candidate) =>
      candidate.id !== node.parentId &&
      checkMove(node.id, candidate.id, nodes, levels).ok &&
      !isFrozen(candidate.id, nodes),
  );

  function run<T>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success: string,
    after?: (data: T) => void,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.(result.data);
      onChanged();
    });
  }

  function onSave(event: FormEvent) {
    event.preventDefault();
    run(
      () => updateOrgUnitAction({ id: node.id, name, code }),
      "Saved",
      () => setEditing(false),
    );
  }

  function openStatusDialog() {
    setImpact(null);
    setStatusOpen(true);
    startTransition(async () => {
      const result = await orgUnitImpactAction({ id: node.id });
      if (result.ok) setImpact(result.data);
      else toast.error(result.error);
    });
  }

  function openDeleteDialog() {
    setDeletable(null);
    setDeleteOpen(true);
    startTransition(async () => {
      const result = await orgUnitDeleteCheckAction({ id: node.id });
      if (result.ok) setDeletable(result.data);
      else toast.error(result.error);
    });
  }

  const deactivating = node.status === "active";

  return (
    <section aria-labelledby="node-heading" className="space-y-6">
      <div className="rounded-md border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs leading-4 font-medium tracking-wide text-muted-foreground uppercase">
              {levelLabel(levels, node.unitType)}
            </p>
            <h2 id="node-heading" className="text-xl leading-7 font-semibold">
              {node.name}
            </h2>
            <p className="text-sm leading-5 text-muted-foreground">
              {parent
                ? `Under ${[parent, ...alsoUnder].map((p) => p.name).join(" and ")}`
                : "Group: the top of its own tree"}
              {node.code ? (
                <>
                  {" · "}
                  <span className="font-mono">{node.code}</span>
                </>
              ) : null}
              {node.inScope ? (
                <>
                  {" · "}
                  {node.activeAssignments} {node.activeAssignments === 1 ? "person" : "people"}{" "}
                  assigned here
                </>
              ) : null}
            </p>
          </div>
          {node.status === "inactive" ? (
            <StatusBadge tone="locked">Inactive</StatusBadge>
          ) : frozenByAncestor ? (
            <StatusBadge tone="locked">Frozen by parent</StatusBadge>
          ) : (
            <StatusBadge tone="success">Active</StatusBadge>
          )}
        </div>

        {!node.manageable ? (
          <p className="mt-6 text-sm leading-5 text-muted-foreground">
            {node.inScope
              ? "This is the unit you administer. You can add units under it and set what it must submit; its name, parent and status are changed by the administrator above you."
              : "This unit is above the part of the organization you administer. It is listed so the tree reads from the top; you can't change it."}
          </p>
        ) : null}
        {node.manageable && !editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
            Edit name and code
          </Button>
        ) : null}
        <form
          onSubmit={onSave}
          hidden={!node.manageable || !editing}
          className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px_auto_auto] sm:items-end"
        >
          <div className="space-y-2">
            <Label htmlFor="node-name">Name</Label>
            <Input id="node-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-code">Code</Label>
            <Input
              id="node-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setName(node.name);
              setCode(node.code ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>

        {node.ownable ? (
          <ExpectationsCard
            orgUnitId={node.id}
            nodeName={node.name}
            nodes={nodes}
            onSelect={onSelect}
            openGroups={openGroups}
            onToggleGroup={onToggleGroup}
          />
        ) : null}
      </div>

      {node.parentId && node.manageable && !singleParent(node.unitType) ? (
        <div className="rounded-md border bg-card p-6">
          <h3 className="text-base leading-6 font-semibold">Move to a different parent</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Choose the company or unit {node.name} should belong to, for example MEIL as the parent
            of a subsidiary. Everything under {node.name} moves with it, and what people can see
            changes with it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="new-parent">Move to (new parent)</Label>
              <NativeSelect
                id="new-parent"
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
              >
                <option value="">Select the new parent…</option>
                {moveTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name} ({placeNote(nodes, levels)(target)})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || newParentId === ""}
              onClick={() => setMoveOpen(true)}
            >
              Move
            </Button>
          </div>
        </div>
      ) : null}

      {node.unitType === BUSINESS_UNIT_LEVEL && node.ownable ? (
        <ProjectsCard
          // Starts afresh when the saved placements change, so the ticks match what was written.
          key={nodes
            .filter((n) => n.parentId === node.id || n.alsoUnder.includes(node.id))
            .map((n) => n.id + (n.parentId === node.id ? ":main" : ""))
            .join(",")}
          node={node}
          nodes={nodes}
          levels={levels}
          onChanged={onChanged}
        />
      ) : null}

      {node.parentId && node.manageable && singleParent(node.unitType) ? null : node.parentId &&
        node.manageable ? (
        <div className="rounded-md border bg-card p-6">
          <h3 className="text-base leading-6 font-semibold">
            {alsoUnder.length > 0 ? `Parents (${alsoUnder.length + 1})` : "Parents"}
          </h3>
          {wrongPlace ? (
            <p className="mt-2 rounded-md border border-status-warning px-3 py-2 text-sm leading-5 text-foreground">
              {wrongPlace} {node.name} still sits straight under {parent?.name}. Tick the{" "}
              {levelLabel(levels, BUSINESS_UNIT_LEVEL).toLowerCase()} it belongs to and save: the
              first one ticked becomes its main parent and {parent?.name} is left out.
            </p>
          ) : null}
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            For a unit that belongs to more than one parent, such as a project two business units
            run. {node.name} then appears under each of them, their people can see it, and its
            figures count in full in each parent and once in the group above them — so those parents
            add up to more than the group.
          </p>
          <div className="mt-4 space-y-3">
            <ParentChecklist
              legend="Parents"
              hint="Tick every unit this one belongs to, then save. The first one is its main parent (where it is managed); untick it to hand that role to another ticked parent. At least one must stay ticked."
              fixed={undefined}
              fixedNote=""
              choices={[...(parent ? [parent] : []), ...alsoUnder, ...extraParentTargets]}
              note={placeNote(nodes, levels)}
              checked={tickedParents}
              levels={levels}
              disabled={pending}
              onToggle={(id, on) =>
                setTickedParents((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              disabled={pending || !parentsChanged || tickedParents.size === 0}
              onClick={() =>
                run(
                  () =>
                    setOrgUnitAllParentsAction({
                      id: node.id,
                      // The current main parent first while it is still ticked, so it stays the main one.
                      parentIds: [
                        ...(node.parentId && tickedParents.has(node.parentId)
                          ? [node.parentId]
                          : []),
                        ...[...tickedParents].filter((id) => id !== node.parentId),
                      ],
                    }),
                  "Parents saved",
                )
              }
            >
              Save parents
            </Button>
          </div>
        </div>
      ) : null}

      {canChangeStatus && node.manageable ? (
        <div className="rounded-md border bg-card p-6">
          <h3 className="text-base leading-6 font-semibold">
            {deactivating ? "Deactivate this unit" : "Reactivate this unit"}
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {deactivating
              ? "Stops all new activity in this unit and everything under it: no new uploads, no new people assigned and no new units added. Past data stays visible and nothing is deleted. You can reactivate it later."
              : "Lets this unit take new uploads, people and units again (unless a unit above it is still inactive)."}
          </p>
          <Button
            type="button"
            variant={deactivating ? "destructive" : "outline"}
            className="mt-4"
            disabled={pending}
            onClick={openStatusDialog}
          >
            {deactivating ? "Deactivate this unit" : "Reactivate this unit"}
          </Button>
        </div>
      ) : null}

      <div hidden={!node.manageable} className="rounded-md border bg-card p-6">
        <h3 className="text-base leading-6 font-semibold">Delete this unit</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Removes {node.name} and every unit under it for good. Only possible while they are unused:
          no person ever assigned, no document, no record and no report. A unit that has been used
          is deactivated instead, so its history stays.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4"
          disabled={pending}
          onClick={openDeleteDialog}
        >
          Delete this unit
        </Button>
      </div>

      <ConfirmDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title={`Move ${node.name} to ${newParentName}?`}
        confirmLabel="Move"
        pending={pending}
        onConfirm={() =>
          run(
            () => moveOrgUnitAction({ id: node.id, newParentId }),
            "Moved",
            () => {
              setMoveOpen(false);
              setNewParentId("");
            },
          )
        }
      >
        <div className="space-y-3">
          <p>
            <strong>{node.name}</strong>, together with everything under it, will move
            {parent ? (
              <>
                {" "}
                from <strong>{parent.name}</strong>
              </>
            ) : null}{" "}
            to <strong>{newParentName}</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {parent ? (
              <li>
                People assigned to {parent.name} will no longer see {node.name} or anything under
                it.
              </li>
            ) : null}
            <li>
              People assigned to {newParentName} will be able to see {node.name} and everything
              under it.
            </li>
          </ul>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title={deactivating ? `Deactivate ${node.name}?` : `Reactivate ${node.name}?`}
        confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
        destructive={deactivating}
        // A unit with units under it takes them all with it: the word has to be typed first.
        requireTyped={deactivating && impact && impact.descendants > 0 ? "deactivate" : undefined}
        pending={pending || impact === null}
        onConfirm={() =>
          run(
            () =>
              setOrgUnitStatusAction({ id: node.id, status: deactivating ? "inactive" : "active" }),
            deactivating ? "Unit deactivated" : "Unit reactivated",
            () => setStatusOpen(false),
          )
        }
      >
        {impact === null ? (
          <p>Checking impact…</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            <li>{impact.descendants} unit(s) under it will also be deactivated</li>
            <li>{impact.activeAssignments} people assigned here or below</li>
            <li>{impact.inProgressRecords} submission(s) still in progress</li>
          </ul>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${node.name}?`}
        confirmLabel="Delete for good"
        destructive
        blocked={deletable === null || deletable.blockers.length > 0}
        requireTyped={deletable && deletable.blockers.length === 0 ? "delete" : undefined}
        pending={pending}
        onConfirm={() =>
          run(
            () => deleteOrgUnitAction({ id: node.id }),
            "Unit deleted",
            () => {
              setDeleteOpen(false);
              // The unit is gone: show where it used to sit.
              router.replace(node.parentId ? `${pathname}?node=${node.parentId}` : pathname, {
                scroll: false,
              });
            },
          )
        }
      >
        {deletable === null ? (
          <p>Checking whether it can be deleted…</p>
        ) : deletable.blockers.length > 0 ? (
          <>
            <p>{node.name} cannot be deleted:</p>
            <ul className="list-disc space-y-1 pl-5">
              {deletable.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
            <p>Deactivate it instead: that stops new activity and keeps the history.</p>
          </>
        ) : (
          <p>
            {deletable.units === 1
              ? `${node.name} will be removed.`
              : `${node.name} and the ${deletable.units - 1} unit(s) under it will be removed.`}{" "}
            This cannot be undone. The audit trail keeps a note of what was deleted.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

/** Expected submissions (D16): what this node must file each period — the Control Tower's denominators. */
function ExpectationsCard({
  orgUnitId,
  nodeName,
  nodes,
  onSelect,
  openGroups,
  onToggleGroup,
}: {
  orgUnitId: string;
  nodeName: string;
  nodes: OrgUnitRow[];
  onSelect: (id: string) => void;
  openGroups: Set<string>;
  onToggleGroup: (group: string, open: boolean) => void;
}) {
  // `rows` is what the boxes show; `saved` is what the server holds. Nothing is written until Save.
  const [rows, setRows] = useState<OrgExpectation[] | null>(null);
  const [saved, setSaved] = useState<Map<string, boolean>>(new Map());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    orgExpectationsAction({ orgUnitId }).then((result) => {
      if (!live) return;
      const data = result.ok ? result.data : [];
      setRows(data);
      setSaved(new Map(data.map((r) => [r.metricId, r.expected])));
    });
    return () => {
      live = false;
    };
  }, [orgUnitId]);

  function toggle(row: OrgExpectation) {
    setRows(
      (prev) =>
        prev?.map((r) => (r.metricId === row.metricId ? { ...r, expected: !r.expected } : r)) ??
        null,
    );
  }

  const changed = (rows ?? []).filter((r) => r.expected !== saved.get(r.metricId));

  function save() {
    startTransition(async () => {
      // One change at a time: each is its own audited write, and a refusal stops the rest.
      const done = new Map(saved);
      for (const row of changed) {
        const result = await setExpectationAction({
          orgUnitId,
          metricId: row.metricId,
          expected: row.expected,
        });
        if (!result.ok) {
          setSaved(done);
          toast.error(`${row.metricName}: ${result.error}`);
          return;
        }
        done.set(row.metricId, row.expected);
      }
      setSaved(done);
      toast.success(`Expected submissions saved for ${nodeName}`);
    });
  }

  // Scope 1, 2 and 3 first, in the order the server sent them; everything else under one heading.
  const OTHER = "Other disclosures";
  const groups = [...new Set((rows ?? []).map((r) => r.scopeName ?? OTHER))];
  return (
    <div className="mt-6 border-t pt-6">
      <h3 className="text-base leading-6 font-semibold">Expected submissions</h3>
      <div className="mt-3 max-w-md space-y-1">
        <Label htmlFor="expected-unit">Org unit</Label>
        <OrgTreeSelect
          id="expected-unit"
          value={orgUnitId}
          onChange={onSelect}
          nodes={nodes.map((n) => ({
            id: n.id,
            name: n.name,
            parentIds: [n.parentId, ...n.alsoUnder].filter((id): id is string => !!id),
            inactive: n.status === "inactive",
            // Units above the caller stay listed, as in the big tree; they cannot be configured.
            disabled: !n.ownable,
          }))}
        />
      </div>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        What {nodeName} must submit in every period of the metric&apos;s frequency. The Control
        Tower&apos;s completion figures and &ldquo;missing submissions&rdquo; count against these.
        What a unit below must submit is expected here as well, and is shown ticked with the
        unit&apos;s name; change it on that unit. Nothing is passed down.
      </p>
      {rows === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4">
          {groups.map((group) => {
            const inGroup = rows.filter((r) => (r.scopeName ?? OTHER) === group);
            const categories = [...new Set(inGroup.map((r) => r.categoryName))];
            return (
              // Native toggle, like the Hierarchy levels card; its open state lives in OrgManager.
              <details
                key={group}
                open={openGroups.has(group)}
                onToggle={(e) => onToggleGroup(group, e.currentTarget.open)}
                aria-label={group}
                className="border-b first:border-t"
              >
                <summary className="cursor-pointer py-3 text-sm leading-5 font-semibold">
                  {group}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {inGroup.filter((r) => r.expected || r.requiredBelow.length > 0).length} of{" "}
                    {inGroup.length} expected
                  </span>
                </summary>
                <div className="grid pb-3 items-start gap-x-8 gap-y-4 sm:grid-cols-2">
                  {categories.map((category) => (
                    // A plain group, not a fieldset: a legend sits off the grid line and the two columns
                    // then start at different heights.
                    <div key={category} role="group" aria-label={category} className="min-w-0">
                      <p className="mb-1.5 text-xs leading-4 font-medium tracking-wide text-muted-foreground uppercase">
                        {category}
                      </p>
                      <div className="space-y-1.5">
                        {inGroup
                          .filter((r) => r.categoryName === category)
                          .map((row) => (
                            // Three fixed columns, so a name that wraps keeps its box and its
                            // frequency on the first line.
                            <label
                              key={row.metricId}
                              className="grid grid-cols-[1rem_minmax(0,1fr)_4.5rem] items-start gap-x-2 text-sm leading-5"
                            >
                              <input
                                type="checkbox"
                                // Required of a unit below: expected here too, and only that unit's
                                // own list can take it away.
                                checked={row.expected || row.requiredBelow.length > 0}
                                disabled={
                                  pending || (!row.expected && row.requiredBelow.length > 0)
                                }
                                onChange={() => toggle(row)}
                                className="mt-0.5 size-4"
                              />
                              <span>
                                {row.metricName}
                                {row.requiredBelow.length > 0 ? (
                                  <span className="block text-xs leading-4 text-muted-foreground">
                                    From {row.requiredBelow.slice(0, 3).join(", ")}
                                    {row.requiredBelow.length > 3
                                      ? ` and ${row.requiredBelow.length - 3} more`
                                      : ""}
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-right text-xs leading-5 text-muted-foreground capitalize">
                                {row.frequency}
                              </span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <Button type="button" disabled={pending || changed.length === 0} onClick={save}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save expected submissions
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !rows.some((r) => r.expected)}
              onClick={() => setRows(rows.map((r) => ({ ...r, expected: false })))}
            >
              Clear all
            </Button>
            {changed.length > 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
