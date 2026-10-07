import type { CompanyRole } from "@/lib/server/db/schema";
import type { MailMessage } from "./mailer";

const ROLE_LABELS: Record<CompanyRole, string> = {
  company_admin: "Firmen-Admin",
  mentor: "Mentor",
  learner: "Lernender",
};

const FOOTER = "\n\nWenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.";

export function verifyEmailMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text:
      `Hallo,\n\nbitte bestätige deine E-Mail-Adresse, um dein Konto zu nutzen:\n\n${link}\n\n` +
      `Der Link ist 24 Stunden gültig und nur einmal verwendbar.${FOOTER}`,
  };
}

export function resetPasswordMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Passwort zurücksetzen",
    text:
      `Hallo,\n\nüber diesen Link kannst du ein neues Passwort festlegen:\n\n${link}\n\n` +
      `Der Link ist 1 Stunde gültig und nur einmal verwendbar. Danach wirst du auf allen Geräten abgemeldet.${FOOTER}`,
  };
}

export function invitationMessage(
  to: string,
  link: string,
  organizationName: string,
  role: CompanyRole,
): MailMessage {
  return {
    to,
    subject: `Einladung zu ${organizationName}`,
    text:
      `Hallo,\n\ndu wurdest zu „${organizationName}“ eingeladen, als ${ROLE_LABELS[role]}.\n\n` +
      `Hier kannst du die Einladung annehmen (Registrieren oder Anmelden mit genau dieser E-Mail-Adresse):\n\n${link}\n\n` +
      `Der Link ist 7 Tage gültig und nur einmal verwendbar.${FOOTER}`,
  };
}

export function companyConfirmMessage(to: string, link: string, companyName: string): MailMessage {
  return {
    to,
    subject: `Firma „${companyName}“ bestätigen`,
    text:
      `Hallo,\n\ndu möchtest dein Konto dem Unternehmen „${companyName}“ zuordnen und dort als Firmen-Admin starten. ` +
      `Mit diesem Link bestätigst du, dass diese Firmen-E-Mail-Adresse dir gehört:\n\n${link}\n\n` +
      `Der Link ist 24 Stunden gültig und nur einmal verwendbar.${FOOTER}`,
  };
}

/** Betreiber: eine Firma hat einen Lernpfad angefragt. */
export function newCourseRequestMessage(
  to: string,
  input: { organizationName: string; requester: string; title: string; wish: boolean; link: string },
): MailMessage {
  return {
    to,
    subject: `Neue Anfrage von ${input.organizationName}`,
    text:
      `Hallo,\n\n${input.organizationName} hat ${input.wish ? "einen Lernpfad gewünscht" : "einen Lernpfad aus dem Katalog angefragt"}:\n\n` +
      `  ${input.title}\n  Angefragt von: ${input.requester}\n\nHier bearbeiten:\n\n${input.link}`,
  };
}

/** Firma: Stand ihrer Anfrage hat sich geändert (inklusive Freigabe, Ablehnung, entzogener Freigabe). */
export function courseRequestStatusMessage(
  to: string,
  input: { title: string; statusLabel: string; note: string | null; link: string },
): MailMessage {
  return {
    to,
    subject: `Ihre Anfrage „${input.title}“: ${input.statusLabel}`,
    text:
      `Hallo,\n\nder Stand Ihrer Anfrage „${input.title}“ ist jetzt: ${input.statusLabel}.\n` +
      (input.note ? `\nHinweis: ${input.note}\n` : "") +
      `\nDie Anfragen finden Sie im Firmenbereich:\n\n${input.link}`,
  };
}
