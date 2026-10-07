import type { CatalogStatus, CourseRequestStatus } from "@/lib/server/db/schema";

/** Anzeigetexte für den Stand einer Kundenanfrage (Kunde und Betreiber sehen dieselben Begriffe). */
export const REQUEST_STATUS_LABELS: Record<CourseRequestStatus, { de: string; en: string }> = {
  submitted: { de: "Eingegangen", en: "Received" },
  on_hold: { de: "Wartet (hold)", en: "On hold" },
  in_creation: { de: "In Erstellung", en: "Being created" },
  in_review: { de: "In fachlicher Prüfung", en: "In expert review" },
  released: { de: "Freigegeben", en: "Released" },
  rejected: { de: "Abgelehnt", en: "Declined" },
  withdrawn: { de: "Zurückgezogen", en: "Withdrawn" },
  revoked: { de: "Freigabe entzogen", en: "Release revoked" },
};

/** Stati, die der Betreiber von Hand setzen darf. „Freigegeben“ gibt es nur über die Freigabe selbst. */
export const SETTABLE_REQUEST_STATUSES: readonly CourseRequestStatus[] = [
  "submitted",
  "on_hold",
  "in_creation",
  "in_review",
  "rejected",
];

export const CATALOG_STATUS_LABELS: Record<CatalogStatus, { de: string; en: string }> = {
  draft: { de: "Entwurf", en: "Draft" },
  in_review: { de: "In Prüfung", en: "In review" },
  approved: { de: "Freigegeben", en: "Approved" },
};

export const COURSE_KIND_LABELS = {
  general: { de: "Allgemein", en: "General" },
  internal: { de: "Intern", en: "Internal" },
} as const;
