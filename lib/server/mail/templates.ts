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

/** Mentor: eine lernende Person hat um Hilfe gebeten. Bewusst ohne den Inhalt der Anfrage (der steht nur im Firmenbereich). */
export function mentorRequestMessage(to: string, input: { learner: string; topic: string; link: string }): MailMessage {
  return {
    to,
    subject: `${input.learner} bittet um Hilfe: ${input.topic}`,
    text: `Hallo,\n\n${input.learner} hat dich um Hilfe gebeten (Thema: ${input.topic}). Die Anfrage steht im Firmenbereich:\n\n${input.link}`,
  };
}

const formatDate = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** Lernende: die Frist eines zugewiesenen Lernpfads läuft bald ab. */
export function deadlineReminderMessage(to: string, input: { courseName: string; organizationName: string; dueAt: Date; link: string }): MailMessage {
  return {
    to,
    subject: `Erinnerung: „${input.courseName}“ bis ${formatDate(input.dueAt)}`,
    text:
      `Hallo,\n\n${input.organizationName} hat dir den Lernpfad „${input.courseName}“ zugewiesen. Die Frist ist der ${formatDate(input.dueAt)}.\n\n` +
      `Hier geht es weiter:\n\n${input.link}`,
  };
}

/** Lernende: die Frist ist abgelaufen. */
export function overdueMessage(to: string, input: { courseName: string; organizationName: string; dueAt: Date; link: string }): MailMessage {
  return {
    to,
    subject: `Frist abgelaufen: „${input.courseName}“`,
    text:
      `Hallo,\n\ndie Frist für den Lernpfad „${input.courseName}“ (${input.organizationName}) war der ${formatDate(input.dueAt)}. ` +
      `Bitte schließe ihn möglichst bald ab.\n\nHier geht es weiter:\n\n${input.link}`,
  };
}

/** Mentor und Firmen-Admin: Zuweisungen, die schon länger überfällig sind (nur Person, Lernpfad, Frist; nie Lerndaten). */
export function overdueDigestMessage(
  to: string,
  input: { organizationName: string; items: { person: string; courseName: string; dueAt: Date }[]; link: string },
): MailMessage {
  return {
    to,
    subject: `${input.organizationName}: ${input.items.length} überfällige Zuweisung${input.items.length === 1 ? "" : "en"}`,
    text:
      `Hallo,\n\nfolgende Zuweisungen sind überfällig:\n\n` +
      input.items.map((i) => `  ${i.person}: ${i.courseName} (Frist ${formatDate(i.dueAt)})`).join("\n") +
      `\n\nÜbersicht im Firmenbereich:\n\n${input.link}`,
  };
}

/** Lernende: eine Pflichtschulung beginnt erneut (Wiederholung). */
export function repeatDueMessage(to: string, input: { courseName: string; organizationName: string; dueAt: Date; link: string }): MailMessage {
  return {
    to,
    subject: `Wiederholung fällig: „${input.courseName}“`,
    text:
      `Hallo,\n\nder Lernpfad „${input.courseName}“ (${input.organizationName}) ist eine Pflichtschulung mit Wiederholung und beginnt erneut. ` +
      `Dein Stand wurde zurückgesetzt, die neue Frist ist der ${formatDate(input.dueAt)}.\n\nHier geht es los:\n\n${input.link}`,
  };
}

/** Erinnerung des Prüfungsplaners (UI U8); `kind` aus lib/exams/plan.ts. */
export function examReminderMessage(to: string, input: { kind: "voucher_expiring" | "exam_soon" | "retake_included"; courseName: string; when: Date | null; link: string }): MailMessage {
  const date = input.when ? input.when.toLocaleDateString("de-DE", { timeZone: "UTC" }) : "";
  const subject = input.kind === "voucher_expiring" ? `Dein Voucher für ${input.courseName} läuft bald ab` : input.kind === "exam_soon" ? `Deine Prüfung ${input.courseName} steht bevor` : `Wiederholungsversuch für ${input.courseName}`;
  const body =
    input.kind === "voucher_expiring"
      ? `Dein Voucher für „${input.courseName}“ ist bis ${date} gültig.`
      : input.kind === "exam_soon"
        ? `Deine Prüfung „${input.courseName}“ ist am ${date}. Letzte Woche: wiederholen, Merkzettel durchgehen, keine neuen Themen.`
        : `In deinem Prüfungspaket für „${input.courseName}“ ist ein Wiederholungsversuch enthalten.`;
  return { to, subject, text: `Hallo,\n\n${body}\n\nZum Prüfungsplaner:\n\n${input.link}\n\nDiese Erinnerungen kannst du in deinem Konto abstellen.` };
}

/** Erinnerung vor Ablauf eines eigenen Zertifikats (UI U9), 90 oder 30 Tage vorher. */
export function certificateExpiryMessage(to: string, input: { title: string; expiresAt: Date; link: string; days: 90 | 30 }): MailMessage {
  return {
    to,
    subject: `Dein Zertifikat „${input.title}“ läuft in ${input.days} Tagen ab`,
    text: `Hallo,\n\ndein Zertifikat „${input.title}“ ist bis ${input.expiresAt.toLocaleDateString("de-DE", { timeZone: "UTC" })} gültig.\n\nZu deinen Zertifikaten:\n\n${input.link}\n\nDiese Erinnerungen kannst du in deinem Konto abstellen.`,
  };
}

/** Reaktivierung nach einer Pause: freundlich, ohne Zähler, Rückstandszahl oder Warnung. Nie an Arbeitgeber oder Mentor. */
export function reactivationMessage(to: string, input: { link: string; unsubscribeLink: string; stage: "d5" | "d12" | "d26" }): MailMessage {
  const lead =
    input.stage === "d5"
      ? "Schön, dass du da bist, wenn du Zeit hast."
      : input.stage === "d12"
        ? "Deine Lernreihe läuft nicht weg. Wenn du magst, fang einfach klein an."
        : "Das ist die letzte Nachricht dazu. Die Tür bleibt offen, du kannst jederzeit wieder einsteigen.";
  return {
    to,
    subject: "3 Minuten reichen heute",
    text:
      `Hallo,\n\n${lead}\n\n3 Minuten reichen heute. Dieser Link startet direkt eine kurze Runde:\n\n${input.link}\n\n` +
      `Was liegen geblieben ist, verteilt die Planung für dich ruhig über die nächsten Tage.\n\n` +
      `Keine Erinnerungen dieser Art mehr? Hier abmelden:\n${input.unsubscribeLink}`,
    headers: { "List-Unsubscribe": `<${input.unsubscribeLink}>` },
  };
}

/** Einladung als fachliche Prüferin oder Prüfer eines Kurses. */
export function reviewerInvitationMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Einladung als fachlicher Prüfer",
    text:
      `Hallo,\n\ndu wurdest eingeladen, Kurse fachlich zu prüfen und freizugeben. Du siehst nur die Kurse, die dir zugewiesen sind.\n\n` +
      `Hier kannst du die Einladung annehmen (Registrieren oder Anmelden mit genau dieser E-Mail-Adresse):\n\n${link}\n\n` +
      `Der Link ist 7 Tage gültig und nur einmal verwendbar.${FOOTER}`,
  };
}
