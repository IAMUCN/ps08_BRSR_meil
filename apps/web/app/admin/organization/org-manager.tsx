"use client";

import { ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { OrgUnitBulkImport } from "@/components/bulk-import/org-unit-bulk-import";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { bulkImportOrgUnitsAction } from "@/lib/bulk-import/actions";
import {
  allowedChildTypes,
  checkMove,
  isFrozen,
  levelLabel,
  type OrgLevel,
  type OrgUnitType,
} from "@/lib/org/rules";
import type { OrgExpectation, OrgUnitRow } from "@/lib/trpc/routers/organization";
import {
  createOrgUnitAction,
  orgExpectationsAction,
  setExpectationAction,
  moveOrgUnitAction,
  orgUnitImpactAction,
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
  const root = nodes.find((n) => n.parentId === null) ?? null;
  const selected = nodes.find((n) => n.id === selectedId) ?? root;

  const childrenByParent = useMemo(() => {
    const map = new Map<string, OrgUnitRow[]>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node]);
    }
    return map;
  }, [nodes]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Which add form the side panel shows; closed until one of the two buttons is pressed.
  const [adding, setAdding] = useState<"one" | "many" | null>(null);

  function select(id: string) {
    router.replace(`${pathname}?node=${id}`, { scroll: false });
  }

  // Guide lines (owner's page feedback, 2026-10-11): each unit hangs from a vertical line that drops from
  // its parent's arrow, joined by a short horizontal tick at the middle of its row (rows are 36px high). On
  // the last unit of a branch the vertical line stops at the tick, so a line never runs on past the branch.
  const BRANCH =
    "relative pl-2 before:absolute before:top-[18px] before:left-0 before:h-px before:w-2.5 before:bg-muted-foreground/70 after:absolute after:top-0 after:bottom-0 after:left-0 after:w-px after:bg-muted-foreground/70 last:after:bottom-auto last:after:h-[18px]";

  function renderNode(node: OrgUnitRow, depth: number) {
    const children = childrenByParent.get(node.id) ?? [];
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id} className={depth > 0 ? BRANCH : undefined}>
        <div
          className={cn(
            "flex h-9 items-center gap-1 rounded-sm pr-2 pl-1",
            selected?.id === node.id ? "bg-table-row-hover" : "hover:bg-muted",
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
            onClick={() => select(node.id)}
            aria-current={selected?.id === node.id ? "true" : undefined}
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
        </div>
        {children.length > 0 && open ? (
          <ul className="ml-4">{children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    // Tree | the selected unit. The add forms open in a side panel; while it is docked (1900px and up) the
    // page makes room for it instead of sitting underneath.
    <div
      className={cn(
        "grid items-start gap-6 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]",
        adding && "min-[1900px]:pr-[clamp(20rem,calc(100vw-98.5rem),40rem)]",
      )}
    >
      {selected ? (
        <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
          <Button type="button" variant="outline" onClick={() => setAdding("one")}>
            <Plus aria-hidden />
            Add a unit
          </Button>
          <Button type="button" variant="outline" onClick={() => setAdding("many")}>
            <FileSpreadsheet aria-hidden />
            Add from a spreadsheet
          </Button>
        </div>
      ) : null}
      <section
        aria-label="Organization tree"
        // Stays in view while the panels beside it scroll.
        className="rounded-md border bg-card p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
      >
        <h2 className="px-2 pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Organization tree
        </h2>
        {root ? <ul>{renderNode(root, 0)}</ul> : null}
      </section>
      {selected ? (
        <NodeDetail
          key={selected.id}
          node={selected}
          nodes={nodes}
          levels={levels}
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
                {adding === "many"
                  ? "Add several units from a spreadsheet"
                  : `Add a unit under ${selected.name}`}
              </SheetTitle>
              <SheetDescription>
                {adding === "many"
                  ? "Download the template, list the new units, and upload it."
                  : `Creates a new company, business unit, project or other level directly beneath ${selected.name}. To add under a different unit, select it in the tree first.`}
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

  function onAddChild(event: FormEvent) {
    event.preventDefault();
    if (!childType) return;
    startTransition(async () => {
      const result = await createOrgUnitAction({
        parentId: node.id,
        unitType: childType,
        name: childName,
        code: childCode,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Node added");
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
      {frozen ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {node.name} is inactive{frozenByAncestor ? " because a unit above it is inactive" : ""} —
          nothing new can be added under it.
        </p>
      ) : childTypes.length === 0 ? (
        <p className="text-sm leading-5 text-muted-foreground">
          This is the lowest level; nothing can be added beneath it.
        </p>
      ) : (
        <form onSubmit={onAddChild} className="space-y-3">
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
  onChanged,
}: {
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const frozen = isFrozen(node.id, nodes);
  const frozenByAncestor = frozen && node.status === "active";
  const parent = nodes.find((n) => n.id === node.parentId);

  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? "");
  const [newParentId, setNewParentId] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);

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
              {parent ? `Under ${parent.name}` : "Root organization"}
              {node.code ? (
                <>
                  {" · "}
                  <span className="font-mono">{node.code}</span>
                </>
              ) : null}
              {" · "}
              {node.activeAssignments} active assignment{node.activeAssignments === 1 ? "" : "s"}
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

        <ExpectationsCard orgUnitId={node.id} nodeName={node.name} />
      </div>

      {node.parentId ? (
        <div className="rounded-md border bg-card p-6">
          <h3 className="text-base leading-6 font-semibold">Move under a different parent</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Moving changes which users can see this node and everything below it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="new-parent">New parent</Label>
              <NativeSelect
                id="new-parent"
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
              >
                <option value="">Select a parent…</option>
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
            {deactivating ? "Deactivate" : "Reactivate"}
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {deactivating
              ? "Freezes this node and everything below it: no new uploads, assignments or child nodes. History stays readable."
              : "Allows new activity again (unless a parent is still inactive)."}
          </p>
          <Button
            type="button"
            variant={deactivating ? "destructive" : "outline"}
            className="mt-4"
            disabled={pending}
            onClick={openStatusDialog}
          >
            {deactivating ? "Deactivate node" : "Reactivate node"}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        title={`Move ${node.name}?`}
        confirmLabel="Move node"
        pending={pending}
        onConfirm={() =>
          run(
            () => moveOrgUnitAction({ id: node.id, newParentId }),
            "Node moved",
            () => {
              setMoveOpen(false);
              setNewParentId("");
            },
          )
        }
      >
        <p>
          {node.name} and all of its descendants will move under{" "}
          <strong>{nodes.find((n) => n.id === newParentId)?.name}</strong>. Users assigned above the
          old location lose visibility; users assigned above the new location gain it.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title={deactivating ? `Deactivate ${node.name}?` : `Reactivate ${node.name}?`}
        confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
        destructive={deactivating}
        pending={pending || impact === null}
        onConfirm={() =>
          run(
            () =>
              setOrgUnitStatusAction({ id: node.id, status: deactivating ? "inactive" : "active" }),
            deactivating ? "Node deactivated" : "Node reactivated",
            () => setStatusOpen(false),
          )
        }
      >
        {impact === null ? (
          <p>Checking impact…</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            <li>{impact.descendants} descendant node(s)</li>
            <li>{impact.activeAssignments} active user assignment(s) in this subtree</li>
            <li>{impact.inProgressRecords} in-progress record(s)</li>
          </ul>
        )}
      </ConfirmDialog>
    </section>
  );
}

/** Expected submissions (D16): what this node must file each period — the Control Tower's denominators. */
function ExpectationsCard({ orgUnitId, nodeName }: { orgUnitId: string; nodeName: string }) {
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
        <div className="mt-4 space-y-5">
          {groups.map((group) => {
            const inGroup = rows.filter((r) => (r.scopeName ?? OTHER) === group);
            const categories = [...new Set(inGroup.map((r) => r.categoryName))];
            return (
              <section key={group} aria-label={group}>
                <h4 className="border-b pb-1 text-sm leading-5 font-semibold">
                  {group}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {inGroup.filter((r) => r.expected).length} of {inGroup.length} expected
                  </span>
                </h4>
                <div className="mt-3 grid items-start gap-x-8 gap-y-4 sm:grid-cols-2">
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
              </section>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
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
