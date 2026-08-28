import { config } from "dotenv";
config({ path: ".env.local" });

import { getDb } from "../lib/server/db/client";
import { certifications, domains } from "../lib/server/db/schema";

const db = getDb();

/**
 * Seed für roadmap2.md Dev-Order Schritt 1 ("Certification/objective database").
 * Nur Zertifikat + die 5 offiziellen Top-Level-Domain-Namen (öffentlich stabile
 * Fakten) - bewusst OHNE Objectives/Sub-Objectives/Gewichtungen, da diese laut
 * roadmap2.md Phase 2/28 aus dem offiziellen CompTIA-Exam-Objectives-Dokument
 * stammen müssen und nicht aus dem Gedächtnis eines LLMs generiert werden
 * dürfen (Risiko: veraltete/erfundene Anforderungen). Das Einpflegen der
 * echten Objective-Texte ist ein offener Folge-Task, siehe roadmap2.md.
 */
async function seed() {
  const [cert] = await db
    .insert(certifications)
    .values({
      slug: "security-plus-sy0-701",
      name: "CompTIA Security+",
      provider: "CompTIA",
      examName: "Security+",
      examVersion: "SY0-701",
    })
    .onConflictDoNothing({ target: certifications.slug })
    .returning();

  if (!cert) {
    console.log("Zertifikat existiert bereits, überspringe Seed.");
    process.exit(0);
  }

  const domainNames = [
    "General Security Concepts",
    "Threats, Vulnerabilities, and Mitigations",
    "Security Architecture",
    "Security Operations",
    "Security Program Management and Oversight",
  ];

  await db.insert(domains).values(
    domainNames.map((name, index) => ({
      certificationId: cert.id,
      orderNum: index + 1,
      name,
    })),
  );

  console.log(`Seed ok: Zertifikat "${cert.name}" (${cert.examVersion}) + ${domainNames.length} Domains.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed fehlgeschlagen:", err);
  process.exit(1);
});
