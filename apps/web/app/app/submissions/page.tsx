import { FileStack, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAppSession } from "@/lib/auth/session";
import {
  SUBMISSION_TABS,
  attentionLabel,
  isSubmissionTab,
  submissionBadge,
  submissionTab,
} from "@/lib/ocr/rules";
import { api } from "@/lib/trpc/server";
import { SubmissionRow } from "./submission-row";

export const metadata: Metadata = { title: "My Submissions · EmeilSG" };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 03_APP_FLOW.md §2.3 My Submissions; UI brief §20 (one table template, segmented status tabs).
// OCR processing is a status badge here, never a wait screen (§0.1).
export default async function MySubmissionsPage({ searchParams }: PageProps<"/app/submissions">) {
  const [session, params, caller] = await Promise.all([requireAppSession(), searchParams, api()]);
  const canUpload = session.permissions.includes("document.upload");
  const [rows, bundles] = await Promise.all([
    caller.ocr.submissions(),
    canUpload ? caller.bundles.pending() : [],
  ]);

  if (rows.length === 0 && bundles.length === 0) {
    return (
      <EmptyState
        icon={FileStack}
        title="No submissions yet"
        message="You haven't submitted anything yet this period."
        action={
          canUpload ? (
            <Button asChild className="mt-2">
              <Link href="/app/upload">
                <Upload aria-hidden />
                Upload Document
              </Link>
            </Button>
          ) : null
        }
      />
    );
  }

  const tab = isSubmissionTab(params.tab) ? params.tab : "needs_verification";
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = submissionTab(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const visible = rows.filter((row) => submissionTab(row) === tab);
  const tabLabel = SUBMISSION_TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="max-w-7xl">
      <AutoRefresh
        active={
          rows.some((r) => r.jobStatus === "pending" || r.jobStatus === "processing") ||
          bundles.some((b) => b.status === "processing")
        }
      />
      <PageHeader
        title="My Submissions"
        description="Everything you've submitted, at whatever stage it's at. Documents are processed in the background — you'll get a notification when one is ready to verify."
        action={
          canUpload ? (
            <Button asChild>
              <Link href="/app/upload">
                <Upload aria-hidden />
                Upload Document
              </Link>
            </Button>
          ) : null
        }
      />

      {bundles.length > 0 ? (
        <section aria-labelledby="bundles-heading" className="mb-6">
          <h2 id="bundles-heading" className="text-base leading-6 font-semibold">
            PDFs with several bills
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Nothing from these is recorded until you check how the PDF is split.
          </p>
          <ul className="mt-2 divide-y rounded-md border bg-card">
            {bundles.map((b) => (
              <li key={b.documentId}>
                <Link
                  href={`/app/upload/split/${b.documentId}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-table-row-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span>
                    <span className="font-medium text-primary-text">{b.fileName}</span>
                    <span className="text-muted-foreground"> · {formatDateTime(b.uploadedAt)}</span>
                  </span>
                  <StatusBadge
                    tone={
                      b.status === "ready" ? "warning" : b.status === "failed" ? "error" : "neutral"
                    }
                  >
                    {b.status === "ready"
                      ? "Check the split"
                      : b.status === "failed"
                        ? "Couldn't be read"
                        : "Reading"}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav aria-label="Submission status" className="mb-4 overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-md border bg-surface p-1">
          {SUBMISSION_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <li key={t.key}>
                <Link
                  href={`/app/submissions?tab=${t.key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-sm px-1.5 text-xs leading-5 tabular-nums",
                      active ? "bg-primary-foreground text-primary" : "bg-muted",
                    )}
                  >
                    {counts.get(t.key) ?? 0}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{tabLabel} submissions</caption>
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {["Document", "ESG activity", "Project / site", "Period", "Submitted", "Status"].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="bg-table-row px-3 py-8 text-center text-muted-foreground"
                >
                  Nothing under {tabLabel} right now.
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const badge = submissionBadge(row);
                const detail = row.rejectedReason
                  ? row.rejectedReason
                  : row.returnReason
                    ? row.returnReason
                    : row.validationStatus === "flagged"
                      ? "Awaiting Admin review."
                      : row.errorMessage
                        ? row.errorMessage
                        : row.verificationStatus === "ocr_completed" && row.attention > 0
                          ? attentionLabel(row.attention)
                          : null;
                return (
                  <SubmissionRow
                    key={row.id}
                    href={row.documentId ? `/app/verify/${row.documentId}` : null}
                  >
                    <td className="px-3 py-3 font-medium">
                      {row.documentId ? (
                        <Link
                          href={`/app/verify/${row.documentId}`}
                          className="text-primary-text underline-offset-4 hover:underline"
                        >
                          {row.fileName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">No document</span>
                      )}
                      {row.manualException ? (
                        <span className="mt-1 block text-[11px] leading-4 tracking-wide text-muted-foreground uppercase">
                          Manual exception
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{row.metricName}</td>
                    <td className="px-3 py-3">{row.orgUnitName}</td>
                    <td className="px-3 py-3">{row.periodLabel}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDateTime(row.submittedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      {detail ? (
                        <p
                          className={cn(
                            "mt-1 max-w-xs text-xs leading-4",
                            row.errorMessage && !row.rejectedReason
                              ? "text-status-error"
                              : "text-muted-foreground",
                          )}
                        >
                          {detail}
                        </p>
                      ) : null}
                    </td>
                  </SubmissionRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
