import * as React from "react";
import { cn } from "@/lib/cn";

export type Column<Row> = { key: string; header: string; align?: "left" | "right"; className?: string; render: (row: Row) => React.ReactNode };

/**
 * Tabelle: Kopfzeile 12 px `--text-faint`, Zeilen mit `--border-subtle` oben, Zeilenhöhe ≥ 52 px, horizontal scrollbarer
 * Container (Radius 14), Zahlen rechtsbündig mit tabular-nums.
 */
export function DataTable<Row>({ columns, rows, rowKey, caption, empty, className }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; caption?: string; empty?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", className)}>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 text-xs font-medium text-faint", c.align === "right" && "text-right tabular-nums")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border-subtle">
              {columns.map((c) => (
                <td key={c.key} className={cn("h-[52px] px-4 py-2", c.align === "right" && "text-right tabular-nums", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-border-subtle">
              <td colSpan={columns.length} className="px-4 py-8 text-center text-subtle">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
