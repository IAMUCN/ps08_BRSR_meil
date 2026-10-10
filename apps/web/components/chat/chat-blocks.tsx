import { cn } from "cn";
import { formatNumber, type Block } from "@/lib/chat/blocks";

/**
 * The figures, tables and charts of an answer (.grill/chat-analyst-decisions.md). Every block was built by
 * the server from the records and validated; all of it is rendered as text and SVG, never as markup.
 */
export function ChatBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, index) => (
        <ChatBlock key={index} block={block} />
      ))}
    </div>
  );
}

function ChatBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "stats":
      return (
        <dl className="grid grid-cols-2 gap-2">
          {block.items.map((item) => (
            <div key={item.label} className="rounded-md border bg-card px-3 py-2">
              <dt className="text-xs leading-4 text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 font-mono text-base leading-6 font-semibold">
                {item.value} <span className="text-xs font-normal">{item.unit}</span>
              </dd>
              {item.sub ? (
                <dd className="text-xs leading-4 text-muted-foreground">{item.sub}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <figure className="rounded-md border bg-card">
          <figcaption className="border-b px-3 py-2 text-xs leading-4 font-semibold">
            {block.title}
          </figcaption>
          {/* Focusable so a wide table can be scrolled from the keyboard. */}
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label={block.title}>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  {block.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-t border-table-border bg-table-row align-top">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn("px-3 py-2", c > 0 && "font-mono whitespace-nowrap")}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </figure>
      );
    case "chart":
      return block.kind === "bar" ? <BarChart block={block} /> : <LineChart block={block} />;
    case "note":
      return (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-xs leading-5",
            block.tone === "warning" ? "border-status-warning text-status-warning" : "bg-card",
          )}
        >
          {block.text}
        </p>
      );
    case "source":
      return <p className="text-xs leading-5 text-muted-foreground">Covers: {block.text}</p>;
  }
}

type Chart = Extract<Block, { type: "chart" }>;

/** Bars as the Control Tower draws them: each row's length against the largest value. */
function BarChart({ block }: { block: Chart }) {
  const max = Math.max(0, ...block.points.map((p) => p.value ?? 0));
  return (
    <figure className="rounded-md border bg-card px-3 py-2">
      <figcaption className="text-xs leading-4 font-semibold">
        {block.title} <span className="font-normal text-muted-foreground">({block.unit})</span>
      </figcaption>
      <ul className="mt-2 space-y-2">
        {block.points.map((point) => (
          <li key={point.label} className="text-xs">
            <div className="flex justify-between gap-3">
              <span>{point.label}</span>
              <span className="font-mono whitespace-nowrap">
                {point.value === null ? "No data" : formatNumber(point.value)}
              </span>
            </div>
            {point.value === null ? null : (
              <span
                aria-hidden
                className="mt-1 block h-2 rounded-full bg-primary"
                style={{ width: `${max > 0 ? Math.max(2, (point.value / max) * 100) : 2}%` }}
              />
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD = 8;

/** A line over the reporting periods. A period with no data is a gap in the line, never a zero. */
function LineChart({ block }: { block: Chart }) {
  const values = block.points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (i: number) =>
    PAD + (block.points.length > 1 ? (i / (block.points.length - 1)) * (WIDTH - 2 * PAD) : 0);
  const y = (v: number) =>
    HEIGHT - PAD - (max > min ? ((v - min) / (max - min)) * (HEIGHT - 2 * PAD) : 0);
  // Consecutive periods with data are joined; a gap starts a new segment.
  const segments: string[][] = [[]];
  block.points.forEach((p, i) => {
    if (p.value === null) segments.push([]);
    else segments[segments.length - 1].push(`${x(i)},${y(p.value)}`);
  });
  const first = block.points[0];
  const last = block.points[block.points.length - 1];
  return (
    <figure className="rounded-md border bg-card px-3 py-2">
      <figcaption className="text-xs leading-4 font-semibold">
        {block.title} <span className="font-normal text-muted-foreground">({block.unit})</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 w-full text-primary-text"
        role="img"
        aria-label={`${block.title}: ${values.length} periods with data, from ${formatNumber(Math.min(...values))} to ${formatNumber(max)} ${block.unit}. The table below lists every value.`}
      >
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={y(min)}
          y2={y(min)}
          className="stroke-border"
          strokeWidth="1"
        />
        {segments.map((points, i) =>
          points.length > 1 ? (
            <polyline
              key={i}
              points={points.join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ) : null,
        )}
        {block.points.map((p, i) =>
          p.value === null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r="3" fill="currentColor">
              <title>{`${p.label}: ${formatNumber(p.value)} ${block.unit}`}</title>
            </circle>
          ),
        )}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{first?.label}</span>
        <span>
          highest {formatNumber(max)} {block.unit}
        </span>
        <span>{block.points.length > 1 ? last?.label : null}</span>
      </div>
    </figure>
  );
}
