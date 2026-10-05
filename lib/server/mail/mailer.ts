import nodemailer from "nodemailer";
import { getMailConfig } from "./config";

export type MailMessage = { to: string; subject: string; text: string };

/**
 * Versendet eine Nur-Text-Mail. Gibt true bei Erfolg zurück, false bei fehlender Konfiguration
 * oder Fehler (wird protokolliert, nie mit Zugangsdaten). Der Aufrufer entscheidet, ob ein
 * Fehlschlag die Aktion abbricht; für Reset und Bestätigung antwortet die API unabhängig davon
 * gleich, damit sich nicht erkennen lässt, ob eine Adresse existiert.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const config = getMailConfig();
  if (!config) {
    console.warn("E-Mail nicht gesendet: Versand ist nicht konfiguriert (MAIL_* und APP_BASE_URL).");
    return false;
  }

  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    transport.close();
    return true;
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : "unbekannter Fehler";
    console.error(`E-Mail-Versand fehlgeschlagen (${config.host}:${config.port}): ${reason}`);
    return false;
  }
}
