import * as React from "react";
import { cn } from "@/lib/cn";

export type Column<Row> = { key: string; header: string; align?: "left" | "right"; className?: string; render: (row: Row) => React.ReactNode };

/**
 * Tabelle: Kopfzeile 12 px `--text-faint`, Zeilen mit `--border-subtle` oben, Zeilenhöhe ≥ 52 px, horizontal scrollbarer
 * Container (Radius 14), Zahlen rechtsbündig mit tabular-nums.
 */
export function DataTable<Row>({ columns, rows, rowKey, caption, empty, className, stackOnMobile = false }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; caption?: string; empty?: React.ReactNode; className?: string; /** Unter 640 px jede Zeile als Karte (Spaltenname links, Wert rechts) statt seitlich zu scrollen. */ stackOnMobile?: boolean }) {
  const stack = stackOnMobile;
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", className)}>
      <table className={cn("w-full border-collapse text-left text-sm", stack ? "sm:min-w-[560px] max-sm:block" : "min-w-[560px]")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={cn(stack && "max-sm:sr-only")}>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 text-xs font-medium text-faint", c.align === "right" && "text-right tabular-nums")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn(stack && "max-sm:block")}>
          {rows.map((row) => (
            <tr key={rowKey(row)} className={cn("border-t border-border-subtle", stack && "max-sm:block max-sm:py-2 max-sm:first:border-t-0")}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header || undefined}
                  className={cn(
                    "h-[52px] px-4 py-2",
                    c.align === "right" && "text-right tabular-nums",
                    stack && "max-sm:flex max-sm:h-auto max-sm:min-h-9 max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:py-1 max-sm:text-right max-sm:before:text-xs max-sm:before:text-faint max-sm:before:content-[attr(data-label)]",
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className={cn("border-t border-border-subtle", stack && "max-sm:block")}>
              <td colSpan={columns.length} className={cn("px-4 py-8 text-center text-subtle", stack && "max-sm:block")}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
