import { FileText, FolderOpen, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";
import { BundleClient } from "./bundle-client";

export const metadata: Metadata = { title: "Audit Evidence Bundle · EmeilSG" };

export default async function AuditEvidenceBundlePage() {
  await requireAdminSession();
  const caller = await api();
  const options = await caller.reports.options();

  return (
    <div className="max-w-7xl space-y-6">
      <PageHeader
        title="Audit Evidence Bundle"
        description="Compile a downloadable assurance ZIP package containing supporting bills, cryptographic SHA-256 manifest, calculation lineage, and audit events for any reporting scope."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/reports">
                <FileText aria-hidden />
                Reports Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/reports/history">
                <History aria-hidden />
                Past Reports
              </Link>
            </Button>
            {options.defaultFinancialYear !== null ? (
              <Button asChild variant="outline">
                <Link href={`/admin/reports/evidence?year=${options.defaultFinancialYear}`}>
                  <FolderOpen aria-hidden />
                  Evidence Browser
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <BundleClient options={options} />
    </div>
  );
}
