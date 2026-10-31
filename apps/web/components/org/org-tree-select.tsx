"use client";

import { Check, ChevronDown, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

export type OrgTreeNode = {
  id: string;
  name: string;
  /** Every parent this unit sits under, among the units the caller was given. A shared unit has several. */
  parentIds: string[];
  /** Shown marked Inactive; it may hold past data, so it can still be chosen. */
  inactive?: boolean;
  /** Listed so the tree reads from the top, but it cannot be chosen. */
  disabled?: boolean;
  hint?: string;
};

/**
 * One way to choose an org unit from the hierarchy: Expected Submissions, Submission Monitoring and the Data
 * Explorer. It shows only the nodes it is given, so what a person may see is decided by the server. Only open
 * branches are drawn, which keeps a large hierarchy quick. A shared unit appears under each parent, and is
 * marked selected in every place.
 */
export function OrgTreeSelect({
  id,
  nodes,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  nodes: OrgTreeNode[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = nodes.find((n) => n.id === value) ?? null;

  const children = useMemo(() => {
    const map = new Map<string, OrgTreeNode[]>();
    for (const node of nodes) {
      for (const parent of node.parentIds) map.set(parent, [...(map.get(parent) ?? []), node]);
    }
    return map;
  }, [nodes]);
  // A unit whose parents were all withheld from this caller is the top of what they see.
  const roots = useMemo(() => {
    const known = new Set(nodes.map((n) => n.id));
    return nodes.filter((n) => !n.parentIds.some((parent) => known.has(parent)));
  }, [nodes]);

  // Every unit above the selected one, through all its parents.
  const above = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const walk = (nodeId: string) => {
      for (const parent of byId.get(nodeId)?.parentIds ?? []) {
        if (!seen.has(parent)) {
          seen.add(parent);
          walk(parent);
        }
      }
    };
    if (value) walk(value);
    return seen;
  }, [nodes, value]);

  // null: nothing touched yet, so the groups and the way down to the selected unit are open.
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const openIds = expanded ?? new Set([...above, ...roots.map((r) => r.id)]);
  const toggle = (nodeId: string) => {
    const next = new Set(openIds);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    setExpanded(next);
  };

  function choose(node: OrgTreeNode) {
    if (node.disabled) return;
    onChange(node.id);
    setOpen(false);
    setQuery("");
  }

  function label(node: OrgTreeNode) {
    return (
      <>
        <span className={cn("truncate", node.inactive && "text-muted-foreground line-through")}>
          {node.name}
        </span>
        {node.inactive ? (
          <span className="shrink-0 text-xs text-muted-foreground">Inactive</span>
        ) : null}
        {node.hint ? (
          <span className="shrink-0 text-xs text-muted-foreground">{node.hint}</span>
        ) : null}
        {node.id === value ? <Check className="ml-auto size-4 shrink-0" aria-hidden /> : null}
      </>
    );
  }

  function row(node: OrgTreeNode, path: string): React.ReactNode {
    const kids = children.get(node.id) ?? [];
    const isOpen = openIds.has(node.id);
    const current = node.id === value;
    return (
      <li key={path}>
        <div
          className={cn(
            "flex min-h-8 items-center gap-1 rounded-sm pr-2",
            current ? "bg-table-row-hover font-medium" : !node.disabled && "hover:bg-muted",
          )}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={isOpen}
              onClick={() => toggle(node.id)}
              className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
            >
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            disabled={node.disabled}
            aria-current={current ? "true" : undefined}
            onClick={() => choose(node)}
            className={cn(
              "flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left text-sm text-foreground outline-none focus-visible:underline",
              node.disabled && "cursor-not-allowed text-muted-foreground",
            )}
          >
            {label(node)}
          </button>
          {!isOpen && above.has(node.id) ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary-text"
              title="The selected unit is inside"
            />
          ) : null}
        </div>
        {kids.length > 0 && isOpen ? (
          <ul className="ml-3 border-l pl-1">{kids.map((kid) => row(kid, `${path}/${kid.id}`))}</ul>
        ) : null}
      </li>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? nodes.filter((n) => n.name.toLowerCase().includes(q)) : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setExpanded(null);
        else setQuery("");
      }}
    >
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-sm border border-input bg-transparent px-2.5 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <span className="truncate">{selected?.name ?? "Choose a unit"}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-2">
        <div className="relative mb-2">
          <Search
            className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            aria-label="Search units"
            placeholder="Search units"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-sm border border-input bg-transparent pr-2 pl-8 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {matches ? (
            matches.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No unit matches.</p>
            ) : (
              <ul>
                {matches.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      disabled={node.disabled}
                      aria-current={node.id === value ? "true" : undefined}
                      onClick={() => choose(node)}
                      className={cn(
                        "flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground outline-none hover:bg-muted focus-visible:bg-muted",
                        node.id === value && "bg-table-row-hover font-medium",
                        node.disabled && "cursor-not-allowed text-muted-foreground",
                      )}
                    >
                      {label(node)}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul>{roots.map((node) => row(node, node.id))}</ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
