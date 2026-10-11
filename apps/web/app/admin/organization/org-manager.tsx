"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "cn";
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
  ROOT_LEVEL,
  type OrgLevel,
  type OrgUnitType,
} from "@/lib/org/rules";
import type { OrgDeleteCheck, OrgExpectation, OrgUnitRow } from "@/lib/trpc/routers/organization";
import {
  addOrgUnitParentAction,
  createOrgUnitAction,
  deleteOrgUnitAction,
  orgExpectationsAction,
  setExpectationAction,
  moveOrgUnitAction,
  orgUnitDeleteCheckAction,
  orgUnitImpactAction,
  removeOrgUnitParentAction,
  setOrgUnitStatusAction,
  updateOrgUnitAction,
} from "./actions";

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

  // Which drawing of the selected unit is meant: a shared unit is drawn under each parent, and only the one
  // that was clicked, or jumped to from the Shared list, is highlighted. Null (a fresh page): all of them.
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
    const current =
      selected?.id === node.id &&
      (place === null || place.id !== node.id || place.under === null || place.under === here);
    return (
      <li key={node.id} className={depth > 0 ? BRANCH : undefined}>
        <div
          id={rowId(node.id, here)}
          className={cn(
            "flex h-9 scroll-my-10 items-center gap-1 rounded-sm pr-2 pl-1",
            current ? "bg-table-row-hover" : "hover:bg-muted",
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
      <div className="mb-6">
        <h1 className="text-[32px] leading-10 font-semibold">Organization</h1>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
            The central repository for your companies, subsidiaries, and project sites. Select any
            unit to view details, configure required ESG submissions, and manage reporting
            permissions, or add new units individually or from a spreadsheet.
          </p>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding("one")}>
                <Plus aria-hidden />
                Add a unit
              </Button>
              <Button type="button" variant="outline" onClick={() => setAdding("many")}>
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
          adding && "min-[1900px]:pr-[clamp(20rem,calc(100vw-98.5rem),40rem)]",
        )}
      >
        <section
          aria-label="Organization hierarchy"
          // Stays in view while the panels beside it scroll.
          className="rounded-md border bg-card p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          <h2 className="px-2 pt-1 pb-2 text-xs font-bold tracking-wide text-foreground uppercase">
            Organization hierarchy
          </h2>
          <ul>{roots.map((group) => renderNode(group, 0))}</ul>
        </section>
        {selected ? (
          <NodeDetail
            key={selected.id}
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
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-text/60 bg-primary-text/10 px-1.5 text-[11px] leading-4 font-medium text-primary-text shadow-[0_0_8px_1px] shadow-primary-text/50 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
  const [childType, setChildType] = useState<OrgUnitType | "">(childTypes[0] ?? "");
  const [childName, setChildName] = useState("");
  const [childCode, setChildCode] = useState("");
  // A new group has no parent: a separate organization with its own tree (owner's decision 2026-10-11).
  const [where, setWhere] = useState<"under" | "group">(
    frozen || childTypes.length === 0 ? "group" : "under",
  );
  const asGroup = where === "group";

  function onAddChild(event: FormEvent) {
    event.preventDefault();
    if (!asGroup && !childType) return;
    startTransition(async () => {
      const result = await createOrgUnitAction({
        parentId: asGroup ? null : node.id,
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
          <Button type="submit" disabled={pending || childName.trim() === ""}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Add
          </Button>
        </form>
      )}
    </>
  );
}

function NodeDetail({
  node,
  nodes,
  levels,
  openGroups,
  onToggleGroup,
  onChanged,
}: {
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  openGroups: Set<string>;
  onToggleGroup: (group: string, open: boolean) => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
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
  const [extraParentId, setExtraParentId] = useState("");
  const alsoUnder = node.alsoUnder.flatMap((id) => nodes.find((n) => n.id === id) ?? []);
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
    run(() => updateOrgUnitAction({ id: node.id, name, code }), "Saved");
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
              {" · "}
              {node.activeAssignments} {node.activeAssignments === 1 ? "person" : "people"} assigned
              here
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

        <form
          onSubmit={onSave}
          className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
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
        </form>

        <ExpectationsCard
          orgUnitId={node.id}
          nodeName={node.name}
          openGroups={openGroups}
          onToggleGroup={onToggleGroup}
        />
      </div>

      {node.parentId ? (
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
                    {target.name} ({levelLabel(levels, target.unitType)})
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

      {node.parentId ? (
        <div className="rounded-md border bg-card p-6">
          <h3 className="text-base leading-6 font-semibold">
            {alsoUnder.length > 0 ? `Parents (${alsoUnder.length + 1})` : "Parents"}
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            For a unit that belongs to more than one parent, such as a project two subsidiaries run.{" "}
            {node.name} then appears under each of them, their people can see it, and its figures
            count in full in each parent and once in the group above them — so those parents add up
            to more than the group.
          </p>
          <ul className="mt-4 divide-y rounded-md border">
            {parent ? (
              <li className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {parent.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({levelLabel(levels, parent.unitType)})
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Moved and deactivated from here
                </span>
              </li>
            ) : null}
            {alsoUnder.map((extra) => (
              <li key={extra.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {extra.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({levelLabel(levels, extra.unitType)})
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeOrgUnitParentAction({ id: node.id, parentId: extra.id }),
                      `No longer under ${extra.name}`,
                    )
                  }
                >
                  <X aria-hidden />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="extra-parent">Add a parent</Label>
              <NativeSelect
                id="extra-parent"
                value={extraParentId}
                onChange={(e) => setExtraParentId(e.target.value)}
              >
                <option value="">Select another parent…</option>
                {extraParentTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name} ({levelLabel(levels, target.unitType)})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending || extraParentId === ""}
              onClick={() =>
                run(
                  () => addOrgUnitParentAction({ id: node.id, parentId: extraParentId }),
                  "Added",
                  () => setExtraParentId(""),
                )
              }
            >
              Add
            </Button>
          </div>
        </div>
      ) : null}

      {canChangeStatus ? (
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

      <div className="rounded-md border bg-card p-6">
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
  openGroups,
  onToggleGroup,
}: {
  orgUnitId: string;
  nodeName: string;
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
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        What {nodeName} must submit in every period of the metric&apos;s frequency. The Control
        Tower&apos;s completion figures and &ldquo;missing submissions&rdquo; count against these.
        Each unit keeps its own list; nothing is inherited from the unit above or passed down.
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
                    {inGroup.filter((r) => r.expected).length} of {inGroup.length} expected
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
                                checked={row.expected}
                                disabled={pending}
                                onChange={() => toggle(row)}
                                className="mt-0.5 size-4"
                              />
                              <span>{row.metricName}</span>
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
