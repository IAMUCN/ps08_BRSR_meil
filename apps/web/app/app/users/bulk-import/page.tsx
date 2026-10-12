import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmployeeBulkImport } from "@/components/bulk-import/employee-bulk-import";
import { bulkImportUsersAction, bulkImportUsersOptionsAction } from "@/lib/bulk-import/actions";
import { PageHeader } from "@/components/shell/page-header";
import { requireAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Add Employees · EmeilSG" };

export default async function UsersBulkImportPage() {
  const session = await requireAppSession();
  if (!session.permissions.includes("user.bulk_import")) redirect("/app?notice=forbidden");

  const options = await bulkImportUsersOptionsAction();
  if (!options.ok) redirect("/app?notice=forbidden");

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="Add Employees"
        description="Create several employee accounts at once from a filled-in spreadsheet. Codes must be within your own organization scope."
      />
      <EmployeeBulkImport
        roles={options.data.roles}
        orgUnits={options.data.orgUnits}
        withoutCode={options.data.withoutCode}
        importAction={bulkImportUsersAction}
      />
    </div>
  );
}
