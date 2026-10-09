import * as React from "react";
import { cn } from "@/lib/cn";

/** Platzhalter beim Laden. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-track", className)} {...props} />;
}
