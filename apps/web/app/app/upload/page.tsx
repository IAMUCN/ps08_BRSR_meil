import { CalendarX, FolderX, ListX } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { UploadForm } from "@/components/upload/upload-form";
import { requireAppSession } from "@/lib/auth/session";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Upload Document · EmeilSG" };

// 03_APP_FLOW.md §2.3 Upload Document; UI brief §20 "almost empty by design".
export default async function UploadPage({ searchParams }: PageProps<"/app/upload">) {
  const [session, params] = await Promise.all([requireAppSession(), searchParams]);
  const replacesId = typeof params.replaces === "string" ? params.replaces : undefined;

  if (session.assignments.length === 0) {
    return (
      <EmptyState
        icon={FolderX}
        title="No projects assigned"
        message="You haven't been assigned to a project yet — contact your Admin."
      />
    );
  }

  const caller = await api();
  const options = session.permissions.includes("document.upload")
    ? await caller.documents.uploadOptions()
    : null;
  // A stale or ineligible ?replaces= link just falls back to a normal upload.
  const replaces =
    options && replacesId
      ? await caller.documents.replacementInfo({ documentId: replacesId }).catch(() => null)
      : null;

  // §0.4: blocking notice before category selection is even shown.
  if (options && options.periods.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="No active reporting period"
        message="No active reporting period — contact your Admin."
      />
    );
  }
  if (!options || options.periods.length === 0 || options.targets.length === 0) {
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
        periods={options.periods}
        targets={options.targets}
        maxBytes={options.maxBytes}
        replaces={replaces}
      />
    </div>
  );
}
