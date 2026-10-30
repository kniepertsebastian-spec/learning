import { cn } from "@/lib/cn";

/** Markenzeichen: Navy-Kachel mit Indigo-„K“, in beiden Themes gleich (wie das App-Icon). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-border-strong bg-logo-tile text-sm font-bold text-logo-mark", className)} aria-hidden="true">
      K
    </span>
  );
}
