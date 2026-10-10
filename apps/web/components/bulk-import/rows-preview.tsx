// Shared preview table for a parsed-but-not-yet-submitted bulk import sheet.
export function RowsPreview({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-table-header text-table-header-foreground">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2 text-left text-[11px] font-medium tracking-wide uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-table-border bg-table-row even:bg-table-row-alt">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
