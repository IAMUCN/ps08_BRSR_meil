import { CheckCircle2, CircleX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ValidationResult } from "@/components/validation/validation-result";
import { VerifyWorkspace } from "@/components/verification/verify-workspace";
import { requireAppSession } from "@/lib/auth/session";
import { JOB_STATUS_LABELS, JOB_STATUS_TONES } from "@/lib/ocr/rules";
import type { VerifyDocument } from "@/lib/trpc/routers/verification";
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

/** The panel shown instead of the field list when there is nothing to verify (yet, or any more). */
function StatePanel({ doc }: { doc: VerifyDocument }) {
  const facts: [string, string][] = [
    ["ESG activity", doc.metricName ?? "—"],
    ["Project / site", doc.orgUnitName],
    ["Reporting period", doc.periodLabel],
    ["Uploaded by", doc.uploadedByName],
    ["Uploaded", formatDateTime(doc.uploadedAt)],
    ["Document type", doc.documentTypeName ?? "Not identified"],
  ];

  return (
    <div className="flex min-h-[480px] flex-col rounded-lg border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base leading-6 font-semibold">
          {doc.state === "processing"
            ? "Extraction in progress"
            : doc.state === "verified"
              ? "Verified"
              : doc.state === "returned"
                ? "Returned for correction"
                : "Rejected"}
        </h2>
        {doc.state === "verified" ? (
          doc.approvalStatus === "approved" ? (
            <StatusBadge tone="success">Approved</StatusBadge>
          ) : doc.approvalStatus === "review_pending" ? (
            <StatusBadge tone="neutral">Pending Approval</StatusBadge>
          ) : doc.validation?.status === "flagged" ? (
            <StatusBadge tone="warning">Flagged</StatusBadge>
          ) : doc.validation?.status === "validated" ? (
            <StatusBadge tone="success">Validated</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Validation Pending</StatusBadge>
          )
        ) : doc.state === "returned" ? (
          <StatusBadge tone="error">Returned</StatusBadge>
        ) : doc.state === "rejected" ? (
          <StatusBadge tone="locked">Rejected</StatusBadge>
        ) : doc.jobStatus ? (
          <StatusBadge tone={JOB_STATUS_TONES[doc.jobStatus]}>
            {JOB_STATUS_LABELS[doc.jobStatus]}
          </StatusBadge>
        ) : null}
      </div>

      {doc.state === "processing" ? (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          This document is being read. You&apos;ll get a notification when it&apos;s ready to verify
          — this page updates automatically.
        </p>
      ) : null}

      {doc.state === "rejected" ? (
        <p className="mt-3 text-sm leading-5">
          <span className="font-semibold">Reason: </span>
          {doc.rejectedReason ?? "No reason recorded."}
        </p>
      ) : null}

      {doc.state === "verified" && doc.verified ? (
        <>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm leading-5">
            <CheckCircle2 className="size-4 text-status-success" aria-hidden />
            Confirmed by {doc.verified.byName} on {formatDateTime(doc.verified.at)}.
            {doc.verified.isManualException ? (
              <span className="rounded-sm border border-status-warning/50 bg-status-warning/10 px-1.5 text-[11px] leading-4 uppercase">
                Manual exception
              </span>
            ) : null}
          </p>
          {doc.verified.notes ? (
            <p className="mt-2 text-sm leading-5 text-muted-foreground">
              Justification: {doc.verified.notes}
            </p>
          ) : null}
          <dl className="mt-4 divide-y rounded-md border">
            {doc.verified.values.map((value) => (
              <div key={value.label} className="flex items-center gap-3 px-3 py-2 text-sm">
                <dt className="w-40 shrink-0 text-muted-foreground">{value.label}</dt>
                <dd className="font-mono break-words">{value.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {doc.validation ? (
            <section aria-labelledby="validation-heading" className="mt-4 space-y-2">
              <h3 id="validation-heading" className="text-sm leading-5 font-semibold">
                Validation
              </h3>
              <ValidationResult results={doc.validation.results} />
              {doc.validation.status === "flagged" ? (
                <p className="text-xs leading-4 text-muted-foreground">
                  Flagged for review — an Admin will accept it or return it to you.
                </p>
              ) : null}
            </section>
          ) : null}
          <p className="mt-3 text-xs leading-4 text-muted-foreground">
            {doc.approvalStatus === "review_pending"
              ? "Waiting for approval by Corporate ESG or an Admin. "
              : ""}
            Calculation arrives in Phase 9.
          </p>
        </>
      ) : null}

      {doc.state === "returned" ? (
        <div className="mt-3 space-y-3">
          {doc.returnReason ? <p className="text-sm leading-5">{doc.returnReason}</p> : null}
          {doc.validation ? <ValidationResult results={doc.validation.results} /> : null}
        </div>
      ) : null}

      <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt className="text-xs leading-4 text-muted-foreground">{term}</dt>
            <dd className="leading-5 font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-6">
        <Button asChild variant="outline">
          <Link href="/app/submissions">Back to My Submissions</Link>
        </Button>
      </div>
    </div>
  );
}

// 03_APP_FLOW.md §2.3 Verify Extraction; UI brief §12.2 split screen (stacks below 1280px, §16).
export default async function VerifyPage({ params }: PageProps<"/app/verify/[documentId]">) {
  await requireAppSession();
  const { documentId } = await params;
  // §4.4: unknown, out-of-scope and malformed ids all get the same redirect — nothing leaks.
  const doc = z.uuid().safeParse(documentId).success
    ? await (await api()).verification.load({ documentId })
    : null;
  if (!doc) redirect("/app?notice=forbidden");

  const workable =
    (doc.state === "ready" || doc.state === "failed" || doc.state === "returned") && doc.canVerify;

  return (
    <div className="space-y-4">
      <AutoRefresh active={doc.state === "processing"} />
      <PageHeader
        title="Verify Extraction"
        description={`${doc.fileName} · check every value against the document before confirming.`}
        action={
          doc.state === "rejected" ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleX className="size-4" aria-hidden />
              This record was rejected
            </span>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-[55fr_45fr]">
        <DocumentViewer
          src={`/api/documents/${doc.documentId}/file`}
          mimeType={doc.mimeType}
          fileName={doc.fileName}
          className="max-h-[calc(100vh-10rem)]"
        />
        {workable ? <VerifyWorkspace doc={doc} /> : <StatePanel doc={doc} />}
      </div>
    </div>
  );
}
