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
  "companyCourseEntitlements",
  "courseRequests",
  "courseRequestEvents",
  "organizationAiSettings",
  // Firmenmodule (Unterlagen der Firma, Verantwortlicher, gültig bis)
  "companyModules",
  // Praxisaufgaben und ihre Abgaben (von der Firma verwaltet, Bestätigung durch den Mentor)
  "practiceTasks",
  "practiceTaskSubmissions",
  // Onboarding-Pläne (benötigte Lernpfade, Mentor) und der Stand je Person
  "onboardingPlans",
  "onboardingPlanCourses",
  "onboardings",
  // Aufträge der internen Lernpfade: nur Stand und Meldung, keine Lerndaten
  "courseGenerationJobs",
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
  // Firmendokumente: PDF-Text, Upload-Prüfung und Secret-Scanner (reine Funktionen, keine Lerndaten)
  "documents",
  // KI-Zugang der Firma: Verschlüsselung der Schlüssel und Prüfung des Schlüssels (keine Lerndaten)
  "crypto",
  "byok",
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
