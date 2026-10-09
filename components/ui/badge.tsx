import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Pille: weiche Fläche (12–14 % Alpha) + farbiger Text. `accent` folgt dem Kontext, `violet` nur als Kategoriefarbe. */
export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      accent: "bg-accent-soft text-link",
      mint: "bg-mint-soft text-mint-text",
      info: "bg-info-soft text-info-text",
      warning: "bg-warning-soft text-warning-text",
      danger: "bg-danger-soft text-danger-text",
      neutral: "bg-surface-2 text-muted",
      violet: "bg-surface-2 text-violet",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
