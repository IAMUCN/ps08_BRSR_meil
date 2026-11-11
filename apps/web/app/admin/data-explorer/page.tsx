import type { Metadata } from "next";
import { ContextFilters, RecordsTable } from "@/components/records/records-explorer";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminAreaSession } from "@/lib/auth/session";
import { readParams, stringParams } from "@/lib/records/params";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "ESG Data Explorer · EmeilSG" };

// 03_APP_FLOW.md §2.2 ESG Data Explorer: any combination of org node, period or financial year, scope,
// metric and status, with the verified and calculated values; rows open the shared record detail.
export default async function DataExplorerPage({
  searchParams,
}: PageProps<"/admin/data-explorer">) {
  const [, caller, raw] = await Promise.all([requireAdminAreaSession(), api(), searchParams]);
  const q = readParams(raw);
  const { context, rows, truncated } = await caller.records.search({
    orgUnitId: q.orgUnitId,
    periodId: q.periodId,
    financialYear: q.financialYear,
    scopeCode: q.scopeCode,
    metricCode: q.metricCode,
    documentTypeCode: q.documentTypeCode,
    status: q.status,
    text: q.text,
    uploadedFrom: q.uploadedFrom,
    uploadedTo: q.uploadedTo,
  });

  return (
    <div className="max-w-7xl space-y-4">
      <PageHeader
        title="ESG Data Explorer"
        description="Every ESG record with its verified and calculated value. Filter by any combination; a financial year covers April to March."
      />
      <ContextFilters context={context} params={stringParams(raw)} variant="explorer" search />
      <RecordsTable
        rows={rows}
        truncated={truncated}
        variant="explorer"
        emptyMessage={
          q.text
            ? `No records match "${q.text}" with these filters.`
            : "No records match these filters."
        }
      />
    </div>
  );
}
