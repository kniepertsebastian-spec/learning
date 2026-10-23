/**
 * Architektur-Test (Leitplanke „Arbeitgeber sieht nur Status“): Der
 * Firmenbereich darf Lerndetails technisch gar nicht erst lesen können. Er
 * importiert deshalb nur eine feste Liste von Tabellen und keine der
 * Lern-Module (Fortschritt, Quiz, Remediation, Prüfung, Studiensitzungen ...).
 * Wer hier etwas erweitert, trifft eine bewusste Entscheidung im Review.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SCOPES = ["lib/server/company", "app/api/company", "app/company"];
const ALLOWED_TABLES = new Set([
  "users",
  "certifications",
  "organizations",
  "organizationMemberships",
  "companyAssignments",
  "companyInvitations",
  "companyClaims",
  "companyDocuments",
  "companyDocumentFiles",
  "companyDocumentImages",
  "companyCourseEntitlements",
  "courseRequests",
  "courseRequestEvents",
  "organizationAiSettings",
  // Firmenmodule (Unterlagen der Firma, Verantwortlicher, gültig bis)
  "companyModules",
  // Praxisaufgaben und ihre Abgaben (von der Firma verwaltet, Bestätigung durch den Mentor)
  "practiceTasks",
  "practiceTaskSubmissions",
  // Kursstruktur für die Lernziel-Auswahl der Praxisaufgaben (Domains und Lernziele, keine Lerndaten)
  "domains",
  "objectives",
  // Lektionen als Kursstruktur (Praxisaufgabe wird nach einer Lektion freigeschaltet), keine Lerndaten
  "sections",
  // Onboarding-Pläne (benötigte Lernpfade, Mentor) und der Stand je Person
  "onboardingPlans",
  "onboardingPlanCourses",
  "onboardings",
  // „Mentor fragen“: nur der Text, den die Person selbst geprüft und gesendet hat (kein Lernverlauf); sichtbar nur für den Empfänger-Mentor und Firmen-Admin
  "mentorRequests",
  // Pflichtschulungen: Regeln je Firma und welche Erinnerungen verschickt wurden (nur Art und Zeitpunkt)
  "mandatoryRules",
  "assignmentNotices",
  "departments",
  "mandatoryRuleDepartments",
  // Aufträge der internen Lernpfade: nur Stand und Meldung, keine Lerndaten
  "courseGenerationJobs",
  // Anmeldung über das Firmenkonto: Einstellungen der Firma und ihre bestätigten E-Mail-Domains (keine Lerndaten)
  "organizationSso",
  "organizationDomains",
  // Kursgruppen der Firma (UI U6): Zusammenstellungen von Kursen, keine Lerndaten
  "companyCourseGroups",
  "companyCourseGroupItems",
  // Zertifikats-Register (UI U9): nur über lib/server/company/certificates.ts (siehe Test unten) und nur freigegebene Daten
  "userCertificates",
  "examPlans",
  "examVouchers",
]);
// Erlaubte Imports aus lib/server/* (alles andere, z. B. progress, quiz, remediation, exam, study, sync, analytics, review, sections, offline, ai, admin, wäre ein Zugriff auf Lerndetails).
// "audit/service" schreibt nur Audit-Ereignisse, "email" normalisiert Adressen, "auth-rate-limit"
// zählt Anfragen und die "mail/*"-Module verschicken Nachrichten (Konfiguration, SMTP, Texte) -
// keines davon liest Lerndaten.
const ALLOWED_SERVER_MODULES = new Set([
  "auth",
  "auth-rate-limit",
  "audit/service",
  "db/client",
  "db/schema",
  "email",
  "mail/config",
  "mail/mailer",
  "mail/templates",
  "company",
  "locale",
  // Freischaltung von Praxisaufgaben: fragt nur, ob die Person selbst die Lektion abgeschlossen hat; liefert der Firma nichts zurück (sie sieht nur „x von y bestätigt“)
  "sections/completed",
  // Firmendokumente: PDF-Text, Upload-Prüfung und Secret-Scanner (reine Funktionen, keine Lerndaten)
  "documents",
  // KI-Zugang der Firma: Verschlüsselung der Schlüssel und Prüfung des Schlüssels (keine Lerndaten)
  "crypto",
  "byok",
  // Merkzettel nachträglich erzeugen: zählt Lektionen mit/ohne Merkzettel (Kursinhalt, keine Lerndaten) und startet den Lauf
  "internal-courses",
  // Anmeldung über das Firmenkonto: OIDC-Abruf und Adresse der Rückkehr (Identität und Rolle, keine Lerndaten)
  "sso",
]);

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let out: string[] = [];
  try {
    for (const name of readdirSync(abs)) {
      const full = path.join(abs, name);
      if (statSync(full).isDirectory()) out = out.concat(sourceFiles(path.join(dir, name)));
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
  } catch {
    /* Verzeichnis existiert noch nicht */
  }
  return out;
}

describe("Firmenbereich liest keine Lerndetails", () => {
  const files = SCOPES.flatMap(sourceFiles);

  it("findet die Firmen-Dateien (sonst prüft der Test nichts)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("importiert nur freigegebene Tabellen aus dem Schema", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/server\/db\/schema"/g)) {
        const names = m[1]
          .split(",")
          .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
          .filter((n) => n && /^[a-z]/.test(n)); // Tabellen sind camelCase-Werte, Typen PascalCase
        for (const name of names) {
          expect(ALLOWED_TABLES, `${path.relative(ROOT, file)} importiert Tabelle "${name}"`).toContain(name);
        }
      }
    }
  });

  it("importiert keine Lern-Module aus lib/server", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/from\s*"@\/lib\/server\/([^"]+)"/g)) {
        const mod = m[1];
        const ok = [...ALLOWED_SERVER_MODULES].some((a) => mod === a || mod.startsWith(a + "/"));
        expect(ok, `${path.relative(ROOT, file)} importiert lib/server/${mod}`).toBe(true);
      }
    }
  });

  it("die Status-Felder sind genau die freigegebenen (neue Felder = bewusste Entscheidung)", async () => {
    const { COMPANY_STATUS_FIELDS } = await import("./status");
    expect([...COMPANY_STATUS_FIELDS]).toEqual([
      "assignmentId",
      "memberId",
      "memberName",
      "memberEmail",
      "learningPath",
      "learningPathKind",
      "status",
      "assignedAt",
      "dueAt",
      "completedAt",
      // bewusst ergänzt (Praxisaufgaben): nur Zahlen „x von y bestätigt“, keine Inhalte der Abgaben
      "practiceConfirmed",
      "practiceTotal",
    ]);
  });
});

describe("Zertifikatsdaten der Personen (UI U9)", () => {
  it("die festgeschriebenen Felder: Zertifikate, geplante Prüfungen, Gutscheine (neue Felder = bewusste Entscheidung)", async () => {
    const { COMPANY_CERTIFICATE_FIELDS, COMPANY_PLANNED_EXAM_FIELDS, COMPANY_VOUCHER_FIELDS } = await import("./certificates");
    expect([...COMPANY_CERTIFICATE_FIELDS]).toEqual(["id", "memberName", "memberEmail", "title", "vendor", "earnedAt", "expiresAt", "status"]);
    expect([...COMPANY_PLANNED_EXAM_FIELDS]).toEqual(["id", "memberName", "memberEmail", "certification", "scheduledAt"]);
    expect([...COMPANY_VOUCHER_FIELDS]).toEqual(["id", "certification", "assignedTo", "expiresAt", "redeemedAt", "note", "state", "hasCode"]);
  });

  it("nur lib/server/company/certificates.ts liest user_certificates, exam_plans und exam_vouchers", () => {
    const guarded = ["userCertificates", "examPlans", "examVouchers"];
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of sourceFiles(scope)) {
        if (file.endsWith("lib/server/company/certificates.ts")) continue;
        const source = readFileSync(file, "utf8");
        for (const table of guarded) if (new RegExp(`\\b${table}\\b`).test(source)) offenders.push(`${path.relative(ROOT, file)}: ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
