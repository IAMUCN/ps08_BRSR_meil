"use client";

import { ChevronDown, ExternalLink, Eye, FileStack, FileText, FolderTree } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { pagesLabel } from "@/lib/documents/bundle";
import {
  attentionLabel,
  groupSubmissions,
  submissionBadge,
  type SubmissionGroup,
} from "@/lib/ocr/rules";
import type { SubmissionRow as SubmissionRowType } from "@/lib/trpc/routers/ocr";
import { SubmissionRow } from "./submission-row";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function activitySummary(records: SubmissionRowType[]): string {
  const unique = Array.from(new Set(records.map((r) => r.metricName)));
  if (unique.length === 1) return unique[0];
  if (unique.length <= 2) return unique.join(", ");
  return `${unique[0]}, ${unique[1]} +${unique.length - 2} more`;
}

interface SubmissionsTreeTableProps {
  rows: SubmissionRowType[];
  tabLabel: string;
}

export function SubmissionsTreeTable({ rows, tabLabel }: SubmissionsTreeTableProps) {
  const groups = groupSubmissions(rows);
  const bundleGroups = groups.filter(
    (g): g is Extract<SubmissionGroup<SubmissionRowType>, { type: "bundle" }> =>
      g.type === "bundle",
  );

  // By default, set it to dropped-down mode: every bundle is expanded by default.
  // We record explicit collapses in state so newly appearing bundles default to true.
  const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      initial[b.bundleDocumentId] = true;
    }
    return initial;
  });

  const isExpanded = (bundleId: string) => expandedBundles[bundleId] !== false;

  const toggleBundle = (bundleId: string) => {
    setExpandedBundles((prev) => ({
      ...prev,
      [bundleId]: prev[bundleId] === false ? true : false,
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      next[b.bundleDocumentId] = true;
    }
    setExpandedBundles(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const b of bundleGroups) {
      next[b.bundleDocumentId] = false;
    }
    setExpandedBundles(next);
  };

  const allExpanded = bundleGroups.every((b) => isExpanded(b.bundleDocumentId));
  const noneExpanded =
    bundleGroups.length > 0 && bundleGroups.every((b) => !isExpanded(b.bundleDocumentId));

  return (
    <div className="space-y-2">
      {bundleGroups.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium">
            <FolderTree className="size-3.5 text-primary" aria-hidden />
            <span>
              Tree view active · {bundleGroups.length} multi-bill{" "}
              {bundleGroups.length === 1 ? "PDF" : "PDFs"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={expandAll}
              disabled={allExpanded}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Expand all
            </Button>
            <span className="text-muted-foreground/40 select-none">·</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              disabled={noneExpanded}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Collapse all
            </Button>
          </div>
        </div>
      ) : null}

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
            {groups.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="bg-table-row px-3 py-8 text-center text-muted-foreground"
                >
                  Nothing under {tabLabel} right now.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                if (group.type === "single") {
                  const row = group.record;
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
                        <div className="flex items-start gap-2">
                          <FileText
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
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
                              {row.documentId ? (
                                <a
                                  href={`/api/documents/${row.documentId}/file`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                                  title="Open single bill PDF in new tab"
                                >
                                  <span className="underline">Single PDF</span>
                                  <ExternalLink className="size-2.5" aria-hidden />
                                </a>
                              ) : null}
                            </div>
                            {row.description ? (
                              <span
                                className="mt-0.5 block max-w-72 truncate text-xs font-normal text-foreground"
                                title={row.description}
                              >
                                {row.description}
                              </span>
                            ) : null}
                            {row.manualException ? (
                              <span className="mt-1 block text-[11px] leading-4 tracking-wide text-muted-foreground uppercase">
                                Manual exception
                              </span>
                            ) : null}
                          </div>
                        </div>
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
                }

                // Multi-bill bundle parent node & children
                const expanded = isExpanded(group.bundleDocumentId);
                const distinctActivities = activitySummary(group.records);

                return (
                  <tbody key={`bundle-group-${group.bundleDocumentId}`} className="contents">
                    {/* Tree Parent: Main Combined PDF Row */}
                    <tr
                      onClick={() => toggleBundle(group.bundleDocumentId)}
                      className="border-t-2 border-table-border bg-surface-subtle/80 hover:bg-table-row-hover transition-colors cursor-pointer select-none font-medium"
                    >
                      <td className="px-3 py-3 font-medium">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBundle(group.bundleDocumentId);
                            }}
                            className="mt-0.5 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? `Collapse bills for ${group.bundleFileName}`
                                : `Expand bills for ${group.bundleFileName}`
                            }
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform duration-200",
                                !expanded && "-rotate-90 text-muted-foreground/70",
                              )}
                              aria-hidden
                            />
                          </button>
                          <FileStack
                            className="mt-0.5 size-4.5 shrink-0 text-primary"
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={`/api/documents/${group.bundleDocumentId}/file`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="font-semibold text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
                                title="Open combined main PDF with all recorded bills"
                              >
                                <span>{group.bundleFileName}</span>
                                <ExternalLink
                                  className="size-3 text-muted-foreground"
                                  aria-hidden
                                />
                              </a>
                              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary whitespace-nowrap">
                                Combined PDF · {group.records.length}{" "}
                                {group.records.length === 1 ? "bill" : "bills"}
                                {group.bundleTotalParts &&
                                group.bundleTotalParts > group.records.length
                                  ? ` (${group.bundleTotalParts} total recorded)`
                                  : ""}
                              </span>
                            </div>
                            {group.bundleDescription ? (
                              <span
                                className="mt-0.5 block max-w-sm truncate text-xs font-normal text-muted-foreground"
                                title={group.bundleDescription}
                              >
                                {group.bundleDescription}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-normal">
                        {distinctActivities}
                      </td>
                      <td className="px-3 py-3 font-normal">{group.orgUnitName}</td>
                      <td className="px-3 py-3 font-normal">{group.periodLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap font-normal">
                        {formatDateTime(group.submittedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div
                          className="flex flex-wrap items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs font-normal gap-1"
                          >
                            <a
                              href={`/api/documents/${group.bundleDocumentId}/file`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View main combined PDF with all recorded bills"
                            >
                              <Eye className="size-3.5" aria-hidden /> View Main PDF
                            </a>
                          </Button>
                          <Link
                            href={`/app/upload/split/${group.bundleDocumentId}`}
                            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline whitespace-nowrap"
                            title="View recorded bills split breakdown"
                          >
                            All recorded bills
                          </Link>
                        </div>
                      </td>
                    </tr>

                    {/* Tree Children: Individual Bill Records */}
                    {expanded &&
                      group.records.map((row, idx) => {
                        const isLast = idx === group.records.length - 1;
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
                        const pageLabelText =
                          row.pageFrom && row.pageTo ? pagesLabel(row.pageFrom, row.pageTo) : null;

                        return (
                          <SubmissionRow
                            key={row.id}
                            href={row.documentId ? `/app/verify/${row.documentId}` : null}
                            className="bg-table-row/60 hover:bg-table-row-hover/90 border-t border-table-border/60"
                          >
                            <td className="px-3 py-2.5 font-medium">
                              <div className="flex items-center gap-2 pl-6 sm:pl-7">
                                <span
                                  className="font-mono text-xs text-muted-foreground/60 select-none shrink-0"
                                  aria-hidden
                                >
                                  {isLast ? "└──" : "├──"}
                                </span>
                                <FileText
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {row.documentId ? (
                                      <Link
                                        href={`/app/verify/${row.documentId}`}
                                        className="text-primary-text underline-offset-4 hover:underline text-sm font-medium"
                                      >
                                        {row.fileName}
                                      </Link>
                                    ) : (
                                      <span className="text-muted-foreground">No document</span>
                                    )}
                                    {pageLabelText ? (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground whitespace-nowrap">
                                        {pageLabelText}
                                      </span>
                                    ) : null}
                                    {row.documentId ? (
                                      <a
                                        href={`/api/documents/${row.documentId}/file`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-0.5 text-[11px] font-normal text-muted-foreground hover:text-foreground ml-1"
                                        title="View cut single PDF"
                                      >
                                        <span className="underline">Single PDF</span>
                                        <ExternalLink className="size-2.5" aria-hidden />
                                      </a>
                                    ) : null}
                                  </div>
                                  {row.description &&
                                  row.description !== group.bundleDescription ? (
                                    <span
                                      className="mt-0.5 block max-w-72 truncate text-xs font-normal text-muted-foreground"
                                      title={row.description}
                                    >
                                      {row.description}
                                    </span>
                                  ) : null}
                                  {row.manualException ? (
                                    <span className="mt-1 block text-[11px] leading-4 tracking-wide text-muted-foreground uppercase">
                                      Manual exception
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">{row.metricName}</td>
                            <td className="px-3 py-2.5">{row.orgUnitName}</td>
                            <td className="px-3 py-2.5">{row.periodLabel}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {formatDateTime(row.submittedAt)}
                            </td>
                            <td className="px-3 py-2.5">
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
                      })}
                  </tbody>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
