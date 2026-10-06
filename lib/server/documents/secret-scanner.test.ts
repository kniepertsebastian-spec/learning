import { describe, expect, it } from "vitest";
import { isSuppressible, scanForSecrets, SUPPRESSIBLE_KINDS, SECRET_KIND_LABELS, type SecretKind } from "./secret-scanner";

// Testwerte werden zusammengesetzt, damit weder dieses Repo noch dessen Verlauf echte Token-Formate enthält
// (sonst schlagen Secret-Scanner von Git-Hostern an). Es sind keine echten Zugangsdaten.
const j = (...parts: string[]) => parts.join("");
const SAMPLES: Record<string, { kind: SecretKind; text: string; secret: string }> = {
  pem: { kind: "private_key", text: j("-----BEGIN RSA ", "PRIVATE KEY-----"), secret: "BEGIN RSA" },
  pemOpenssh: { kind: "private_key", text: j("-----BEGIN OPENSSH ", "PRIVATE KEY-----"), secret: "OPENSSH" },
  pemPlain: { kind: "private_key", text: j("-----BEGIN ", "PRIVATE KEY-----"), secret: "BEGIN" },
  awsKey: { kind: "aws_access_key", text: j("key ", "AKIA", "ABCDEFGHIJKLMNOP", " ende"), secret: j("AKIA", "ABCDEFGHIJKLMNOP") },
  awsSecret: {
    kind: "aws_secret_key",
    text: j("aws_secret_access_key = ", "abcdefghijABCDEFGHIJ0123456789abcdefghij"),
    secret: "abcdefghijABCDEFGHIJ0123456789abcdefghij",
  },
  github: { kind: "github_token", text: j("token: ", "gh", "p_", "a".repeat(36)), secret: "a".repeat(36) },
  githubPat: { kind: "github_token", text: j("github", "_pat_", "B".repeat(60)), secret: "B".repeat(60) },
  google: { kind: "google_api_key", text: j("AIza", "x".repeat(35)), secret: "x".repeat(35) },
  slack: { kind: "slack_token", text: j("xox", "b-", "1234567890-abcdefghij"), secret: "1234567890-abcdefghij" },
  stripe: { kind: "stripe_key", text: j("sk_", "live_", "abcdefghijklmnop1234"), secret: "abcdefghijklmnop1234" },
  jwt: { kind: "jwt", text: j("eyJ", "hbGciOiJIUzI1NiJ9.", "eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0.", "abcdefghijkl"), secret: "zdWIiOiIxMjM0NTY3ODkwIn0" },
  urlCreds: { kind: "url_credentials", text: "postgres://admin:S3cretPw!x@db.intern:5432/prod", secret: "S3cretPw!x" },
  bearer: { kind: "auth_header", text: j("Authorization: Bearer ", "abcdefghijklmnopqrstuvwxyz0123"), secret: "abcdefghijklmnopqrstuvwxyz0123" },
  basic: { kind: "auth_header", text: j("Authorization: Basic ", "dXNlcjpwYXNzd29yZDEyMw=="), secret: "dXNlcjpwYXNzd29yZDEyMw" },
  passDe: { kind: "password_assignment", text: "Passwort: Sommer2024!", secret: "Sommer2024!" },
  passEq: { kind: "password_assignment", text: 'DB_PASSWORD = "hunter2hunter2"', secret: "hunter2hunter2" },
  passIst: { kind: "password_assignment", text: "Das Passwort ist Xk9#mP2vLq", secret: "Xk9#mP2vLq" },
  apiKey: { kind: "password_assignment", text: "api_key: 9f8e7d6c5b4a3f2e1d0c", secret: "9f8e7d6c5b4a3f2e1d0c" },
  clientSecret: { kind: "password_assignment", text: "client_secret=Zq8!wErTy12345", secret: "Zq8!wErTy12345" },
};

describe("Secret-Scanner: erkennt Zugangsdaten", () => {
  for (const [name, s] of Object.entries(SAMPLES)) {
    it(`${name} -> ${s.kind}`, () => {
      const findings = scanForSecrets([{ pageNumber: 1, text: s.text }]);
      expect(findings.map((f) => f.kind)).toContain(s.kind);
    });
  }

  it("Funde enthalten nie den gefundenen Wert (nur Art, Seite, Zeile)", () => {
    for (const s of Object.values(SAMPLES)) {
      const json = JSON.stringify(scanForSecrets([{ pageNumber: 1, text: s.text }]));
      expect(json, s.kind).not.toContain(s.secret);
      expect(Object.keys(scanForSecrets([{ pageNumber: 1, text: s.text }])[0]).sort()).toEqual(["kind", "line", "pageNumber"]);
    }
  });

  it("meldet Seite und Zeile richtig, auch bei mehreren Funden", () => {
    const pages = [
      { pageNumber: 1, text: "Einleitung\nnichts Besonderes" },
      { pageNumber: 2, text: `Zeile eins\nZeile zwei\n${SAMPLES.pem.text}\n${SAMPLES.passDe.text}` },
      { pageNumber: 3, text: SAMPLES.github.text },
    ];
    expect(scanForSecrets(pages)).toEqual([
      { kind: "private_key", pageNumber: 2, line: 3 },
      { kind: "password_assignment", pageNumber: 2, line: 4 },
      { kind: "github_token", pageNumber: 3, line: 1 },
    ]);
  });

  it("erkennt auch Windows-Zeilenenden und Funde mitten im Satz", () => {
    expect(scanForSecrets([{ pageNumber: 1, text: `Hallo\r\nbitte nutzt ${SAMPLES.google.text} für die Karte.\r\n` }])).toEqual([
      { kind: "google_api_key", pageNumber: 1, line: 2 },
    ]);
  });
});

describe("Secret-Scanner: lässt normale Dokumente durch", () => {
  const CLEAN = [
    "Passwort: mindestens zwölf Zeichen, keine Wörterbuchwörter.",
    "Das Passwort muss regelmäßig geändert werden.",
    "Passwort: ********",
    "Passwort: <dein-passwort>",
    "password = ${DB_PASSWORD}",
    "password: changeme",
    "password: your_password_here",
    "api_key: xxxxxxxxxxxx",
    "secret = {{ vault.secret }}",
    "Bitte den Token niemals weitergeben.",
    "https://example.com/pfad?seite=2",
    "postgres://user:${DB_PASSWORD}@host/db",
    "ftp://anonymous:<passwort>@ftp.example.com",
    "Authorization: Bearer <token>",
    "Kontonummer 1234567890 und Telefon 0123 4567890",
    "Die Version 2.4.1 erschien am 2026-10-05 mit der Build-Nummer a1b2c3d4e5f6.",
    "Mehrere Wörter und ein Satz mit einem Doppelpunkt: das ist normal.",
    "Der AWS-Schlüssel (Access Key ID) beginnt mit AKIA, ist aber 20 Zeichen lang.",
    "-----BEGIN CERTIFICATE-----", // Zertifikate sind öffentlich
  ];
  for (const line of CLEAN) {
    it(`unbeanstandet: ${line.slice(0, 50)}`, () => {
      expect(scanForSecrets([{ pageNumber: 1, text: line }])).toEqual([]);
    });
  }

  it("leerer Text und leere Seiten", () => {
    expect(scanForSecrets([])).toEqual([]);
    expect(scanForSecrets([{ pageNumber: 1, text: "" }])).toEqual([]);
  });
});

describe("Secret-Scanner: welche Funde sich als Fehlalarm bestätigen lassen", () => {
  it("nur typische Beispiel-Arten, nie echte Betriebsgeheimnisse", () => {
    expect([...SUPPRESSIBLE_KINDS].sort()).toEqual(["auth_header", "aws_access_key", "aws_secret_key", "jwt", "password_assignment", "url_credentials"]);
    for (const kind of ["private_key", "github_token", "google_api_key", "slack_token", "stripe_key"] as SecretKind[]) {
      expect(isSuppressible(kind), kind).toBe(false);
    }
  });
  it("jede Fund-Art ist entweder bestätigbar oder bewusst nicht (keine vergessene Art)", () => {
    const all = Object.keys(SECRET_KIND_LABELS) as SecretKind[];
    const notSuppressible = all.filter((k) => !isSuppressible(k)).sort();
    expect(notSuppressible).toEqual(["github_token", "google_api_key", "private_key", "slack_token", "stripe_key"]);
  });
});
