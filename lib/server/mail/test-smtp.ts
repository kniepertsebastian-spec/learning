/**
 * Test-Hilfe (kein Test): lokaler SMTP-Server, der wie Gmail eine Anmeldung verlangt und alle Mails
 * abfängt. Nur für Tests und manuelle Browser-Läufe (smtp-server und mailparser sind devDependencies).
 */
import { simpleParser, type ParsedMail } from "mailparser";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";

export type SmtpSink = {
  port: number;
  messages: ParsedMail[];
  /** Wartet auf die erste Mail, die `predicate` erfüllt (Versand läuft nach der API-Antwort). */
  waitFor(predicate: (mail: ParsedMail) => boolean, timeoutMs?: number): Promise<ParsedMail>;
  close(): Promise<void>;
};

export async function startSmtpSink(
  credentials = { user: "sender@example.test", pass: "app-passwort-123" },
  options: { port?: number; tls?: { key: string; cert: string } } = {},
): Promise<SmtpSink> {
  const messages: ParsedMail[] = [];
  const secure = Boolean(options.tls);
  const server = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: !secure,
    disabledCommands: secure ? [] : ["STARTTLS"],
    secure,
    ...(options.tls ?? {}),
    onAuth(auth, _session, callback) {
      if (auth.username === credentials.user && auth.password === credentials.pass) {
        callback(null, { user: auth.username });
      } else {
        callback(new Error("Invalid login"));
      }
    },
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((mail) => {
          messages.push(mail);
          callback();
        })
        .catch((err) => callback(err));
    },
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.server.address() as AddressInfo).port;

  return {
    port,
    messages,
    async waitFor(predicate, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`Keine passende Mail innerhalb von ${timeoutMs} ms (${messages.length} empfangen)`);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Setzt die MAIL_*-Variablen auf den Test-Server (unverschlüsselt, nur außerhalb von Produktion erlaubt). */
export function useSmtpSinkEnv(port: number, credentials = { user: "sender@example.test", pass: "app-passwort-123" }) {
  const keys = [
    "MAIL_SMTP_HOST",
    "MAIL_SMTP_PORT",
    "MAIL_SMTP_USER",
    "MAIL_SMTP_PASSWORD",
    "MAIL_FROM",
    "APP_BASE_URL",
    "MAIL_SMTP_INSECURE",
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, {
    MAIL_SMTP_HOST: "127.0.0.1",
    MAIL_SMTP_PORT: String(port),
    MAIL_SMTP_USER: credentials.user,
    MAIL_SMTP_PASSWORD: credentials.pass,
    MAIL_FROM: "Learning <sender@example.test>",
    APP_BASE_URL: "https://learning.example.test",
    MAIL_SMTP_INSECURE: "1",
  });
  return () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

export function linkFrom(mail: ParsedMail, pathPrefix: string): string {
  const text = mail.text ?? "";
  const match = text.match(new RegExp(`https?://[^\\s]*${pathPrefix}[A-Za-z0-9_-]+`));
  if (!match) throw new Error(`Kein Link mit ${pathPrefix} in der Mail:\n${text}`);
  return match[0];
}
