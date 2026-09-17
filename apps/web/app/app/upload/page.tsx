import { CalendarX, FolderX, ListX } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { UploadForm } from "@/components/upload/upload-form";
import { requireAppSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Upload Document · TraceESG" };

// 03_APP_FLOW.md §2.3 Upload Document; UI brief §20 "almost empty by design".
export default async function UploadPage() {
  const session = await requireAppSession();

  if (!session.assignments.some((a) => a.roleCode !== "admin")) {
    return (
      <EmptyState
        icon={FolderX}
        title="No projects assigned"
        message="You haven't been assigned to a project yet — contact your Admin."
      />
    );
  }

  const options = session.permissions.includes("document.upload")
    ? await (await api()).documents.uploadOptions()
    : null;

  // §0.4: blocking notice before category selection is even shown.
  if (options && !options.openPeriod) {
    return (
      <EmptyState
        icon={CalendarX}
        title="No active reporting period"
        message="No active reporting period — contact your Admin."
      />
    );
  }
  if (!options || !options.openPeriod || options.targets.length === 0) {
    return (
      <EmptyState
        icon={ListX}
        title="No categories to upload into"
        message="No ESG categories are configured for your role yet — contact your Admin."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Upload Document"
        description="Choose what the document is evidence for, then add the file. Values are extracted automatically and you'll review them before anything is submitted."
      />
      <UploadForm
        periodLabel={options.openPeriod.label}
        targets={options.targets}
        maxBytes={options.maxBytes}
      />
    </div>
  );
}
