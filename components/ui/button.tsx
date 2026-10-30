import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Buttons: `primary` (Kontextakzent, Text in --ctx-on-accent), `secondary`, `ghost` (Rahmen), `inverted` (Admin: Koralle
 * bleibt Warnfarbe). Größen sm 36, md 44, lg 46 px; Touch-Ziele nie unter 36 px, primäre Aktionen 44+.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:opacity-90",
        secondary: "border border-border-strong bg-control text-foreground hover:bg-surface-2",
        ghost: "border border-border bg-transparent text-muted hover:bg-surface-2 hover:text-foreground",
        inverted: "bg-foreground text-background hover:opacity-90",
      },
      size: { sm: "h-9 px-3 text-meta", md: "h-11 px-4 text-sm", lg: "h-[46px] px-5 text-body" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  iconLeft?: React.ReactNode;
  /** z. B. Pfeil rechts bei „Weiter“-Aktionen */
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, iconLeft, iconRight, children, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} ref={ref as React.Ref<HTMLElement>} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...props}>
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
