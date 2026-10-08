"use client";

import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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

  function select(id: string) {
    router.replace(`${pathname}?node=${id}`, { scroll: false });
  }

  function renderNode(node: OrgUnitRow, depth: number) {
    const children = childrenByParent.get(node.id) ?? [];
    const open = !collapsed.has(node.id);
    return (
      <li key={node.id}>
        <div
          className={cn(
            "flex h-9 items-center gap-1 rounded-sm pr-2",
            selected?.id === node.id ? "bg-table-row-hover" : "hover:bg-muted",
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
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
          <ul>{children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
      <section aria-label="Organization tree" className="rounded-md border bg-card p-2">
        {root ? <ul>{renderNode(root, 0)}</ul> : null}
      </section>
      {selected ? (
        <NodeDetail
          key={selected.id}
          node={selected}
          nodes={nodes}
          levels={levels}
          onChanged={() => router.refresh()}
          onSelect={select}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No organization root exists yet.</p>
      )}
    </div>
  );
}

function NodeDetail({
  node,
  nodes,
  levels,
  onChanged,
  onSelect,
}: {
  node: OrgUnitRow;
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onChanged: () => void;
  onSelect: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const frozen = isFrozen(node.id, nodes);
  const frozenByAncestor = frozen && node.status === "active";
  const parent = nodes.find((n) => n.id === node.parentId);
  const childTypes = allowedChildTypes(levels, node.unitType);

  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? "");
  const [childType, setChildType] = useState<OrgUnitType | "">(childTypes[0] ?? "");
  const [childName, setChildName] = useState("");
  const [childCode, setChildCode] = useState("");
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

  function onAddChild(event: FormEvent) {
    event.preventDefault();
    if (!childType) return;
    run(
      () =>
        createOrgUnitAction({
          parentId: node.id,
          unitType: childType,
          name: childName,
          code: childCode,
        }),
      "Node added",
      (data) => {
        setChildName("");
        setChildCode("");
        onSelect(data.id);
      },
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
      </div>

      <ExpectationsCard orgUnitId={node.id} />

      <div className="rounded-md border bg-card p-6">
        <h3 className="text-base leading-6 font-semibold">Add a child node</h3>
        {frozen ? (
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            This node is inactive{frozenByAncestor ? " because a parent is inactive" : ""} — no new
            child nodes.
          </p>
        ) : childTypes.length === 0 ? (
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            Departments are the lowest level.
          </p>
        ) : (
          <form
            onSubmit={onAddChild}
            className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr_160px_auto] sm:items-end"
          >
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
      </div>

      <div className="rounded-md border bg-card p-6">
        <h3 className="text-base leading-6 font-semibold">Bulk-add child nodes</h3>
        <p className="mt-1 mb-4 text-sm leading-5 text-muted-foreground">
          Create several child nodes at once from a spreadsheet, instead of one at a time above.
        </p>
        <OrgUnitBulkImport
          nodes={nodes.filter((n) => !isFrozen(n.id, nodes))}
          levels={levels}
          defaultParentId={node.id}
          importAction={bulkImportOrgUnitsAction}
          onImported={onChanged}
        />
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
function ExpectationsCard({ orgUnitId }: { orgUnitId: string }) {
  const [rows, setRows] = useState<OrgExpectation[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    orgExpectationsAction({ orgUnitId }).then((result) => {
      if (live) setRows(result.ok ? result.data : []);
    });
    return () => {
      live = false;
    };
  }, [orgUnitId]);

  function toggle(row: OrgExpectation) {
    // Optimistic: the box flips at once and flips back if the server refuses.
    const flip = (expected: boolean) =>
      setRows(
        (prev) => prev?.map((r) => (r.metricId === row.metricId ? { ...r, expected } : r)) ?? null,
      );
    flip(!row.expected);
    startTransition(async () => {
      const result = await setExpectationAction({
        orgUnitId,
        metricId: row.metricId,
        expected: !row.expected,
      });
      if (!result.ok) {
        flip(row.expected);
        toast.error(result.error);
        return;
      }
      toast.success(row.expected ? "No longer expected" : "Expected every period");
    });
  }

  const categories = [...new Set((rows ?? []).map((r) => r.categoryName))];
  return (
    <div className="rounded-md border bg-card p-6">
      <h3 className="text-base leading-6 font-semibold">Expected submissions</h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        What this node must submit in every period of the metric&apos;s frequency. The Control
        Tower&apos;s completion figures and &ldquo;missing submissions&rdquo; count against these.
      </p>
      {rows === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <fieldset key={category} className="space-y-1.5">
              <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {category}
              </legend>
              {rows
                .filter((r) => r.categoryName === category)
                .map((row) => (
                  <label key={row.metricId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.expected}
                      disabled={pending}
                      onChange={() => toggle(row)}
                    />
                    {row.metricName}
                    <span className="text-xs text-muted-foreground">{row.frequency}</span>
                  </label>
                ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}
