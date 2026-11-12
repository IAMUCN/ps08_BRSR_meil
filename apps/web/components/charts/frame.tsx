import type { ReactNode } from "react";

// Shared furniture of the dashboard's own SVG charts: the colour of a series, a legend, a titled frame and the
// text table every chart offers beside its picture (so no figure lives only in a colour or a shape).

/** The nth series colour (--chart-1 … --chart-6 in globals.css; cycles after six). */
export const seriesColor = (i: number) => `var(--chart-${(i % 6) + 1})`;

export type LegendItem = { key: string; label: string; value?: string };

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-4">
      {items.map((item, i) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 shrink-0 rounded-sm"
            style={{ background: seriesColor(i) }}
          />
          <span>{item.label}</span>
          {item.value ? (
            <span className="font-mono text-muted-foreground">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export type ChartTable = { columns: string[]; rows: (string | number | null)[][] };

/** The same figures as a real table, folded away until asked for. */
export function DataTable({ table, caption }: { table: ChartTable; caption: string }) {
  return (
    <details className="text-xs leading-4">
      <summary className="w-fit cursor-pointer rounded-sm text-primary-text underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        View as table
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col" className="border-b px-2 py-1 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row" className="border-b px-2 py-1 font-normal">
                      {cell ?? "—"}
                    </th>
                  ) : (
                    <td key={j} className="border-b px-2 py-1 font-mono tabular-nums">
                      {cell ?? "—"}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A titled chart with its legend and table. `empty` replaces the picture when there is nothing to draw. */
export function ChartFrame({
  title,
  description,
  legend,
  table,
  empty,
  children,
}: {
  title: string;
  description?: string;
  legend?: LegendItem[];
  table: ChartTable;
  /** Said instead of an empty chart, never a chart of zeros. */
  empty?: string;
  children: ReactNode;
}) {
  return (
    <figure className="space-y-3">
      <figcaption>
        <p className="text-sm leading-5 font-semibold">{title}</p>
        {description ? (
          <p className="text-xs leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </figcaption>
      {empty ? (
        <p role="status" className="py-6 text-center text-sm leading-5 text-muted-foreground">
          {empty}
        </p>
      ) : (
        <>
          {children}
          {legend ? <Legend items={legend} /> : null}
          <DataTable table={table} caption={title} />
        </>
      )}
    </figure>
  );
}
