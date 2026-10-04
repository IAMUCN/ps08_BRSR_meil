"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowsPreview } from "@/components/bulk-import/rows-preview";
import {
  downloadCsv,
  downloadOrgUnitTemplate,
  ORG_UNIT_HEADERS,
  parseSheetRows,
} from "@/lib/bulk-import/xlsx";
import { allowedChildTypes, ORG_UNIT_TYPE_LABELS, type OrgUnitType } from "@/lib/org/rules";
import type { OrgBulkImportRowResult } from "@/lib/trpc/routers/organization";

type NodeOption = { id: string; name: string; code: string | null; unitType: OrgUnitType };
type ParsedRow = { code: string; name: string; unitType: OrgUnitType | "" };
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Org unit bulk import (bulk-import-decisions.md): every row becomes a direct child of one chosen
// parent — no multi-level sheets — so no topological ordering is needed between rows.
export function OrgUnitBulkImport({
  nodes,
  defaultParentId,
  importAction,
  onImported,
}: {
  nodes: NodeOption[];
  defaultParentId?: string;
  importAction: (input: {
    parentId: string;
    rows: { unitType: OrgUnitType; name: string; code: string }[];
  }) => Promise<ActionResult<{ results: OrgBulkImportRowResult[] }>>;
  onImported?: () => void;
}) {
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<OrgBulkImportRowResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  const parent = nodes.find((n) => n.id === parentId) ?? null;
  const childTypes = parent ? allowedChildTypes(parent.unitType) : [];

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setResults(null);
    setFileName(file.name);
    parseSheetRows(file)
      .then((sheetRows) => {
        setRows(
          sheetRows.map((r) => ({
            code: r[ORG_UNIT_HEADERS[0]] ?? "",
            name: r[ORG_UNIT_HEADERS[1]] ?? "",
            unitType: (r[ORG_UNIT_HEADERS[2]] ?? "") as OrgUnitType | "",
          })),
        );
      })
      .catch(() => toast.error("Couldn't read that file — is it a .xlsx export?"));
  }

  function onSubmit() {
    if (!parent) return;
    const invalid = rows.find((r) => !r.unitType || !childTypes.includes(r.unitType));
    if (invalid) {
      toast.error(`"${invalid.unitType || "(blank)"}" isn't a valid type under ${parent.name}.`);
      return;
    }
    startTransition(async () => {
      const result = await importAction({
        parentId: parent.id,
        rows: rows.map((r) => ({
          unitType: r.unitType as OrgUnitType,
          name: r.name,
          code: r.code,
        })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResults(result.data.results);
      setRows([]);
      const okCount = result.data.results.filter((r) => r.ok).length;
      toast.success(`${okCount} of ${result.data.results.length} nodes created`);
      onImported?.();
    });
  }

  function onDownloadResults() {
    if (!results) return;
    downloadCsv(
      "org-unit-bulk-import-results.csv",
      ["Row", "Name", "Status", "Error"],
      results.map((r) => [r.row, r.name, r.ok ? "Created" : "Failed", r.ok ? "" : r.error]),
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-2">
        <Label htmlFor="bulk-org-parent">Parent node</Label>
        <NativeSelect
          id="bulk-org-parent"
          value={parentId}
          onChange={(e) => {
            setParentId(e.target.value);
            setRows([]);
            setResults(null);
          }}
        >
          <option value="">Select a node…</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name} ({ORG_UNIT_TYPE_LABELS[n.unitType]})
            </option>
          ))}
        </NativeSelect>
      </div>

      {parent ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={childTypes.length === 0}
              onClick={() =>
                downloadOrgUnitTemplate(
                  parent.name,
                  childTypes.map((t) => ({ value: t, label: ORG_UNIT_TYPE_LABELS[t] })),
                )
              }
            >
              <Download aria-hidden />
              Download template
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
              <Upload className="size-4" aria-hidden />
              {fileName ?? "Choose filled-in sheet…"}
              <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={onFile} />
            </label>
            {rows.length > 0 ? (
              <Button type="button" onClick={onSubmit} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Import {rows.length} node{rows.length === 1 ? "" : "s"}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Every row becomes a direct child of {parent.name}. Allowed types:{" "}
            {childTypes.length > 0
              ? childTypes.map((t) => ORG_UNIT_TYPE_LABELS[t]).join(", ")
              : "none — this node can't have children"}
            .
          </p>
        </>
      ) : null}

      {rows.length > 0 && !results ? (
        <RowsPreview
          headers={[...ORG_UNIT_HEADERS]}
          rows={rows.map((r) => [r.code, r.name, r.unitType])}
        />
      ) : null}

      {results ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {results.filter((r) => r.ok).length} of {results.length} created.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onDownloadResults}>
              Download results
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-table-border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  {["Row", "Name", "Status", "Error"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-3 py-2 text-left text-[11px] font-medium tracking-wide uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.row}
                    className="border-t border-table-border bg-table-row even:bg-table-row-alt"
                  >
                    <td className="px-3 py-2">{r.row}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <StatusBadge tone="success">Created</StatusBadge>
                      ) : (
                        <StatusBadge tone="error">Failed</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.ok ? "" : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
