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
