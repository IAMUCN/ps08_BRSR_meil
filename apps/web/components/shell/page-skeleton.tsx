// UI brief §15.1: skeleton blocks in the page's eventual shape (header, summary cards, table), never a bare
// spinner. Shown by the route-level loading.tsx while a page's server data loads.

const block = "animate-pulse rounded-md bg-surface-elevated";

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="max-w-7xl space-y-6">
      <div className="space-y-2">
        <div className={`h-8 w-64 ${block}`} />
        <div className={`h-4 w-full max-w-xl ${block}`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-md border">
        <div className="h-10 bg-table-header" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-11 rounded-none ${block}`} />
        ))}
      </div>
    </div>
  );
}
