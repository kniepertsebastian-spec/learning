import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendMail } from "./mailer";
import { startSmtpSink, useSmtpSinkEnv, type SmtpSink } from "./test-smtp";

describe("sendMail (gegen lokalen SMTP-Server mit Anmeldung)", () => {
  let sink: SmtpSink;
  let restoreEnv: () => void;

  beforeAll(async () => {
    sink = await startSmtpSink();
    restoreEnv = useSmtpSinkEnv(sink.port);
  });
  afterAll(async () => {
    restoreEnv();
    await sink.close();
  });

  it("verschickt Absender, Empfänger, Betreff und Text", async () => {
    const ok = await sendMail({ to: "empfaenger@example.test", subject: "Betreff äöü", text: "Hallo Welt\nZeile 2" });
    expect(ok).toBe(true);
    const mail = await sink.waitFor((m) => m.subject === "Betreff äöü");
    const to = Array.isArray(mail.to) ? mail.to[0] : mail.to;
    expect(to?.value[0].address).toBe("empfaenger@example.test");
    expect(mail.from?.value[0]).toMatchObject({ name: "Learning", address: "sender@example.test" });
    expect(mail.text?.trim()).toBe("Hallo Welt\nZeile 2");
  });

  it("falsche Zugangsdaten: false, Fehler wird ohne Passwort protokolliert", async () => {
    const original = process.env.MAIL_SMTP_PASSWORD;
    process.env.MAIL_SMTP_PASSWORD = "falsches-passwort-xyz";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sendMail({ to: "a@example.test", subject: "X", text: "X" })).toBe(false);
      const logged = spy.mock.calls.flat().join(" ");
      expect(logged).toContain("E-Mail-Versand fehlgeschlagen");
      expect(logged).not.toContain("falsches-passwort-xyz");
      expect(logged).not.toContain("app-passwort-123");
    } finally {
      spy.mockRestore();
      process.env.MAIL_SMTP_PASSWORD = original;
    }
  });

  it("nicht erreichbarer Server: false statt Ausnahme", async () => {
    const original = process.env.MAIL_SMTP_PORT;
    process.env.MAIL_SMTP_PORT = "1";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sendMail({ to: "a@example.test", subject: "X", text: "X" })).toBe(false);
    } finally {
      spy.mockRestore();
      process.env.MAIL_SMTP_PORT = original;
    }
  });

  it("ohne Konfiguration: false und keine Verbindung", async () => {
    const saved = process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_HOST;
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const before = sink.messages.length;
      expect(await sendMail({ to: "a@example.test", subject: "Nie", text: "Nie" })).toBe(false);
      expect(sink.messages.length).toBe(before);
    } finally {
      spy.mockRestore();
      process.env.MAIL_SMTP_HOST = saved;
    }
  });
});
