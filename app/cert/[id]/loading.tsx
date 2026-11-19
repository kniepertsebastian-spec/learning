import { PageSkeleton } from "@/components/PageSkeleton";

/** Ladezustand: Kurs (alle Seiten unter /cert/[id] ohne eigenen Platzhalter) (R9). */
export default function Loading() {
  return <PageSkeleton variant="course" />;
}
