import { Construction } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAppSession } from "@/lib/auth/session";
import { attentionLabel, JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/ocr/rules";
import { api } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Verify Extraction · TraceESG" };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Development placeholder for Verify Extraction (03_APP_FLOW.md §2.3), which is built in Phase 7.
 * Notifications already deep-link here (§0.2), so this shows the document's real OCR status only.
 */
export default async function VerifyPlaceholderPage({
  params,
}: PageProps<"/app/verify/[documentId]">) {
  await requireAppSession();
  const { documentId } = await params;
  // §4.4: unknown, out-of-scope and malformed ids all get the same redirect — nothing leaks.
  const status = z.uuid().safeParse(documentId).success
    ? await (await api()).ocr.status({ documentId })
    : null;
  if (!status) redirect("/app?notice=forbidden");

  const running = status.jobStatus === "pending" || status.jobStatus === "processing";
  const facts: [string, string][] = [
    ["ESG activity", status.metricName ?? "—"],
    ["Project / site", status.orgUnitName],
    ["Reporting period", status.periodLabel],
    ["Uploaded", formatDateTime(status.uploadedAt)],
    ["Document type", status.documentType ?? "Not identified"],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <AutoRefresh active={running} />
      <PageHeader title="Verify Extraction" description={status.fileName} />

      <div
        role="note"
        className="flex items-start gap-3 rounded-md border border-status-warning/50 bg-status-warning/10 p-4"
      >
        <Construction
          className="mt-0.5 size-5 shrink-0 text-status-warning"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm leading-5">
          <span className="font-semibold">Development placeholder</span> — the verification screen
          (document preview, extracted values, confirm and reject) arrives in Phase 7. Nothing can
          be verified yet.
        </p>
      </div>

      <section aria-labelledby="ocr-status-heading" className="rounded-md border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ocr-status-heading" className="text-base leading-6 font-semibold">
            Extraction status
          </h2>
          {status.jobStatus ? (
            <StatusBadge tone={JOB_STATUS_TONES[status.jobStatus]}>
              {JOB_STATUS_LABELS[status.jobStatus]}
            </StatusBadge>
          ) : null}
        </div>

        {status.jobStatus === "failed" ? (
          <p className="mt-3 text-sm leading-5">
            <span className="font-semibold">Extraction failed.</span> {status.errorMessage}
          </p>
        ) : status.jobStatus === "completed" ? (
          <p className="mt-3 text-sm leading-5">
            {status.fieldsFound} of {status.fieldsTotal} fields were found.{" "}
            {status.attention > 0 ? (
              <span className="font-semibold">{attentionLabel(status.attention)}.</span>
            ) : (
              "All found fields are above the confidence threshold."
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-5 text-muted-foreground">
            This document is being processed. This page updates automatically.
          </p>
        )}

        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt className="text-xs leading-4 text-muted-foreground">{term}</dt>
              <dd className="leading-5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Button asChild variant="outline">
        <Link href="/app/submissions">Back to My Submissions</Link>
      </Button>
    </div>
  );
}
