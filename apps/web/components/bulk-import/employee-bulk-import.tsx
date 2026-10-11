"use client";

import { Download, Loader2, Upload } from "lucide-react";
import { useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowsPreview } from "@/components/bulk-import/rows-preview";
import {
  downloadCsv,
  downloadEmployeeTemplate,
  EMPLOYEE_HEADERS,
  parseSheetRows,
  scopeRefOf,
  type ScopeOption,
} from "@/lib/bulk-import/xlsx";
import type { BulkImportRowResult } from "@/lib/trpc/routers/users";

type Option = { code: string; name: string };
type ParsedRow = {
  employeeId: string;
  displayName: string;
  email: string;
  roleCode: string;
  orgUnitCode: string;
};
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Employee bulk import (bulk-import-decisions.md): parses the sheet entirely client-side and submits the
// rows as JSON — the server re-validates every field, so nothing here needs to be trusted.
export function EmployeeBulkImport({
  roles,
  orgUnits,
  withoutCode,
  importAction,
  onImported,
}: {
  roles: Option[];
  orgUnits: ScopeOption[];
  /** Org units in scope that have no code and so cannot be named in a sheet. */
  withoutCode?: string[];
  importAction: (input: {
    rows: ParsedRow[];
  }) => Promise<ActionResult<{ results: BulkImportRowResult[] }>>;
  onImported?: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<BulkImportRowResult[] | null>(null);
  const [pending, startTransition] = useTransition();

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
            employeeId: r[EMPLOYEE_HEADERS[0]] ?? "",
            displayName: r[EMPLOYEE_HEADERS[1]] ?? "",
            email: r[EMPLOYEE_HEADERS[2]] ?? "",
            roleCode: r[EMPLOYEE_HEADERS[3]] ?? "",
            orgUnitCode: scopeRefOf(r[EMPLOYEE_HEADERS[4]] ?? ""),
          })),
        );
      })
      .catch(() => toast.error("Couldn't read that file — is it a .xlsx export?"));
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await importAction({ rows });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResults(result.data.results);
      setRows([]);
      const okCount = result.data.results.filter((r) => r.ok).length;
      toast.success(`${okCount} of ${result.data.results.length} employees created`);
      onImported?.();
    });
  }

  function onDownloadResults() {
    if (!results) return;
    downloadCsv(
      "employee-bulk-import-results.csv",
      ["Row", "Employee ID", "Email", "Status", "Emailed", "Password / Error"],
      results.map((r) => [
        r.row,
        r.employeeId,
        r.email,
        r.ok ? "Created" : "Failed",
        r.ok ? (r.emailSent ? "Yes" : "No") : "",
        r.ok ? r.password : r.error,
      ]),
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            downloadEmployeeTemplate(roles, orgUnits, withoutCode).catch(() =>
              toast.error("Couldn't generate the template — try again."),
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
            Import {rows.length} employee{rows.length === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Codes must match the template&apos;s &quot;Valid codes&quot; sheet. Each new account gets a
        generated password, emailed automatically when email sending is configured — otherwise it
        comes back below for you to share yourself. Either way, they can change it after signing in.
      </p>

      {rows.length > 0 && !results ? (
        <RowsPreview headers={[...EMPLOYEE_HEADERS]} rows={rows.map(Object.values)} />
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
                  {["Row", "Employee ID", "Email", "Status", "Emailed", "Password / Error"].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-3 py-2 text-left text-[11px] font-medium tracking-wide uppercase"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.row}
                    className="border-t border-table-border bg-table-row even:bg-table-row-alt"
                  >
                    <td className="px-3 py-2">{r.row}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.employeeId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <StatusBadge tone="success">Created</StatusBadge>
                      ) : (
                        <StatusBadge tone="error">Failed</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        r.emailSent ? (
                          <StatusBadge tone="success">Sent</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">Not sent</StatusBadge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.ok ? r.password : r.error}
                      {r.ok && !r.emailSent && r.emailError ? (
                        <span className="block font-sans text-muted-foreground">
                          {r.emailError}
                        </span>
                      ) : null}
                    </td>
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
