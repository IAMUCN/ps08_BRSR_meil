import { CheckCircle2, CircleX, Loader2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { DiscardBundle } from "@/components/upload/discard-bundle";
import { SplitReview } from "@/components/upload/split-review";
import { pagesLabel, submittedLabel } from "@/lib/documents/bundle";
import { requireAppSession } from "@/lib/auth/session";
import { api, orNotFound } from "@/lib/trpc/server";

export const metadata: Metadata = { title: "Check bills · EmeilSG" };

// A PDF with several bills (.grill/multi-bill-pdf-decisions.md): wait for the OCR, then the uploader
// checks how it is split before anything is recorded.
export default async function SplitPage({ params }: PageProps<"/app/upload/split/[documentId]">) {
  const [, { documentId }] = await Promise.all([requireAppSession(), params]);
  const caller = await api();
  const review = await orNotFound(caller.bundles.review({ documentId }));

  if (review.status === "processing") {
    return (
      <>
        <AutoRefresh active />
        <EmptyState
          icon={Loader2}
          title="Reading your upload"
          message={`${review.fileName} is being read page by page to find each bill. This can take a few minutes; this page updates by itself and you'll get a notification when it's ready.`}
          link={{ href: "/app/submissions?tab=processing", label: "Go to My Submissions" }}
        />
      </>
    );
  }

  if (review.status === "failed") {
    return (
      <EmptyState
        icon={CircleX}
        title="This upload couldn't be read"
        message={review.errorMessage ?? "Processing failed — try uploading it again."}
        action={<DiscardBundle documentId={review.documentId} fileName={review.fileName} />}
        link={{ href: "/app/upload", label: "Upload again" }}
      />
    );
  }

  if (review.status === "done") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Bills recorded"
          description={`${review.fileName}, submitted on ${submittedLabel(review.submittedAt)}, was split into ${review.created.length} ${review.created.length === 1 ? "bill" : "bills"}. Each one now waits for you to check its extracted values.`}
        />
        <ul className="space-y-2">
          {review.created.map((bill) => (
            <li
              key={bill.documentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
            >
              <span className="flex items-center gap-2 text-sm leading-5">
                <CheckCircle2 className="size-4 text-status-success" aria-hidden />
                <span>
                  <span className="font-medium">{bill.metricName ?? "Bill"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {pagesLabel(bill.pageFrom, bill.pageTo)} · {bill.periodLabel}
                  </span>
                </span>
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/verify/${bill.documentId}`}>Open</Link>
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <Button asChild>
            <Link href="/app/submissions">Go to My Submissions</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Check the bills in your upload"
        description="We read every page and guessed where each bill starts, what it is for and its reporting period. Nothing is recorded until you confirm."
        action={<DiscardBundle documentId={review.documentId} fileName={review.fileName} />}
      />
      <SplitReview
        documentId={review.documentId}
        fileName={review.fileName}
        pageCount={review.pageCount}
        parts={review.parts}
        categories={review.categories}
        orgUnitName={review.orgUnitName}
        periods={review.periods}
        defaultPeriodId={review.defaultPeriodId}
        submittedAt={review.submittedAt}
        sources={review.sources}
        declarations={review.declarations}
      />
    </div>
  );
}
