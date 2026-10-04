import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrgUnitBulkImport } from "@/components/bulk-import/org-unit-bulk-import";
import {
  bulkImportOrgUnitsAction,
  bulkImportOrgUnitsOptionsAction,
} from "@/lib/bulk-import/actions";
import { PageHeader } from "@/components/shell/page-header";
import { requireAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add Org Units · TraceESG" };

export default async function OrgUnitsBulkImportPage() {
  const session = await requireAppSession();
  if (!session.permissions.includes("org.bulk_import")) redirect("/app?notice=forbidden");

  const options = await bulkImportOrgUnitsOptionsAction();
  if (!options.ok) redirect("/app?notice=forbidden");

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Add Org Units"
        description="Create several child nodes (projects, sites, …) at once from a filled-in spreadsheet, under a parent within your own scope."
      />
      <OrgUnitBulkImport nodes={options.data} importAction={bulkImportOrgUnitsAction} />
    </div>
  );
}
