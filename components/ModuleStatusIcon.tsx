import { CheckCircle2, Circle, Lock } from "lucide-react";

export type ModuleStatus = "completed" | "active" | "locked";

export function ModuleStatusIcon({ status }: { status: ModuleStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />;
  }
  if (status === "active") {
    return <Circle className="h-5 w-5 shrink-0 fill-accent text-accent" aria-hidden="true" />;
  }
  return <Lock className="h-5 w-5 shrink-0 text-foreground/30" aria-hidden="true" />;
}
