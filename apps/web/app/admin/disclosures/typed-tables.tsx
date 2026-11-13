"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computePart,
  tableOf,
  type Cells,
  type Column,
  type Part,
  type Row,
} from "@/lib/brsr-tables/definitions";
import { buildWorkbook, readWorkbook } from "@/lib/brsr-tables/excel";
import type { TypedTable } from "@/lib/trpc/routers/brsr-tables";
import { saveTablesAction } from "./actions";

// SEBI's typed tables on BRSR Disclosures (owner's decision, 2026-11-13; migration 0087): each in SEBI's layout,
// typed here or imported from Excel. Totals and percentages are worked out as you type; the server checks again.

const show = (value: number | string | null | undefined, column: Column) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  const digits = column.kind === "percent" ? 1 : 2;
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: digits })}${column.kind === "percent" ? "%" : ""}`;
};

export function TypedTables({
  financialYear,
  yearLabel,
  tables,
}: {
  financialYear: number;
  yearLabel: string;
  tables: TypedTable[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  async function download() {
    const blob = await buildWorkbook(tables, yearLabel);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BRSR tables ${yearLabel}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFile(picked: File) {
    startTransition(async () => {
      try {
        const read = await readWorkbook(await picked.arrayBuffer());
        const result = await saveTablesAction({ financialYear, tables: read });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.data.saved
            ? `Imported ${result.data.saved} ${result.data.saved === 1 ? "table" : "tables"} for ${yearLabel}.`
            : "Nothing had changed.",
        );
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That file could not be read.");
      }
    });
  }

  if (!tables.length) return null;
  return (
    <section className="space-y-3 rounded-md border bg-card p-4" aria-labelledby="typed-tables">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="typed-tables" className="text-base font-semibold">
            SEBI tables for {yearLabel}
          </h2>
          <p className="max-w-2xl text-sm leading-5 text-muted-foreground">
            Workforce, wages, complaints, benefits and the other tables no bill carries. Type them
            here, or download the Excel workbook, fill it in and import it. Totals and percentages
            are worked out for you; the report prints each table in SEBI&apos;s layout.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void download()}>
            <Download aria-hidden />
            Download Excel
          </Button>
          <input
            ref={file}
            type="file"
            accept=".xlsx"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) importFile(picked);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => file.current?.click()}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            Import from Excel
          </Button>
        </div>
      </div>
      {tables.map((table) => (
        <TableEditor
          key={`${table.code}-${table.updatedAt}`}
          table={table}
          financialYear={financialYear}
        />
      ))}
    </section>
  );
}

function TableEditor({ table, financialYear }: { table: TypedTable; financialYear: number }) {
  const router = useRouter();
  const def = tableOf(table.code)!;
  const [cells, setCells] = useState<Cells>(table.cells);
  const [notes, setNotes] = useState(table.notes ?? "");
  const [pending, startTransition] = useTransition();
  const filled = Object.keys(table.cells).length > 0;

  function save() {
    // What the inputs hold, as typed: numbers where they parse (the server checks again).
    const typed: Record<string, Record<string, unknown>> = {};
    for (const [rowKey, values] of Object.entries(cells)) {
      for (const [columnKey, value] of Object.entries(values)) {
        if (value === null || value === "") continue;
        (typed[rowKey] ??= {})[columnKey] = value;
      }
    }
    startTransition(async () => {
      const result = await saveTablesAction({
        financialYear,
        tables: [{ code: table.code, cells: typed, notes: notes.trim() || null }],
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${table.code} saved.`);
      router.refresh();
    });
  }

  return (
    <details className="rounded-md border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm">
        <span className="font-mono text-xs font-semibold">{table.code}</span>{" "}
        <span className="font-medium">{def.title}</span>{" "}
        <span className="text-muted-foreground">
          {filled
            ? `— saved${table.updatedBy ? ` by ${table.updatedBy}` : ""}`
            : "— not entered yet"}
        </span>
      </summary>
      <div className="space-y-4 border-t p-3">
        {def.parts.map((part) => (
          <PartGrid
            key={part.key}
            code={table.code}
            part={part}
            cells={cells}
            onCell={(row, column, value) =>
              setCells((all) => ({
                ...all,
                [`${part.key}.${row}`]: { ...all[`${part.key}.${row}`], [column]: value },
              }))
            }
          />
        ))}
        <div className="space-y-1">
          <label htmlFor={`notes-${table.code}`} className="text-xs font-medium">
            Notes printed under the table (optional: definitions, restatements, scope)
          </label>
          <textarea
            id={`notes-${table.code}`}
            value={notes}
            maxLength={2000}
            rows={2}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save {table.code}
        </Button>
      </div>
    </details>
  );
}

function PartGrid({
  code,
  part,
  cells,
  onCell,
}: {
  code: string;
  part: Part;
  cells: Cells;
  onCell: (row: string, column: string, value: number | string | null) => void;
}) {
  // The grid as it stands, typed and derived cells together, for the read-only ones.
  const computed = computePart(
    part,
    Object.fromEntries(
      Object.entries(cells).map(([k, v]) => [
        k,
        Object.fromEntries(
          Object.entries(v).map(([c, x]) => {
            const column = part.columns.find((col) => col.key === c);
            if (column?.kind === "text" || x === null || x === "") return [c, x];
            const parsed = Number(String(x).replace(/[\s,%]/g, ""));
            return [c, Number.isFinite(parsed) ? parsed : null];
          }),
        ),
      ]),
    ),
  );
  const typed = (row: Row, column: Column) =>
    !row.sumOf && !column.derive && (!row.only || row.only.includes(column.key));
  return (
    <div className="space-y-1">
      {part.title ? <p className="text-sm font-medium">{part.title}</p> : null}
      <div className="relative overflow-auto rounded-sm border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th scope="col" className="border border-border px-2 py-1.5 font-semibold">
                <span className="sr-only">Row</span>
              </th>
              {part.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="border border-border px-2 py-1.5 text-xs font-semibold text-foreground"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {part.rows.map((row) => (
              <tr key={row.key} className={row.sumOf ? "bg-muted/30 font-medium" : "bg-surface"}>
                <th scope="row" className="border border-border px-2 py-1 text-left font-normal">
                  {row.label}
                </th>
                {part.columns.map((column) =>
                  typed(row, column) ? (
                    <td key={column.key} className="border border-border p-1">
                      <Input
                        aria-label={`${code}: ${row.label}, ${column.label}`}
                        className="h-8 min-w-24"
                        inputMode={column.kind === "text" ? "text" : "decimal"}
                        value={String(cells[`${part.key}.${row.key}`]?.[column.key] ?? "")}
                        onChange={(e) => onCell(row.key, column.key, e.target.value)}
                      />
                    </td>
                  ) : (
                    <td
                      key={column.key}
                      className="border border-border px-2 py-1 text-right text-muted-foreground tabular-nums"
                    >
                      {row.only && !row.only.includes(column.key)
                        ? "—"
                        : show(computed[row.key]?.[column.key], column)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
