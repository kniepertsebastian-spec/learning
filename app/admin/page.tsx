export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { getCertificationsWithStats } from "@/lib/server/admin/stats";
import { createCertificationAction } from "./actions";

export default async function AdminDashboard() {
  await requireAdminPage("/admin");
  const locale = await getServerLocale();
  const certifications = await getCertificationsWithStats();

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 text-2xl font-semibold">
        {locale === "de" ? "Admin-Dashboard" : "Admin Dashboard"}
      </h1>
      <p className="mb-6 text-sm text-foreground/70">
        {locale === "de"
          ? "Zertifizierungen und Lerninhalte verwalten"
          : "Manage certifications and learning content"}
      </p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="mb-4 text-lg font-semibold">
            {locale === "de" ? "Zertifizierungen" : "Certifications"}
          </h2>

          {certifications.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
              <p className="text-sm text-foreground/70">
                {locale === "de" ? "Keine Zertifizierungen gefunden" : "No certifications found"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {certifications.map((cert) => {
                const contentReady = cert.stats.sections > 0 && cert.stats.lessons > 0;
                return (
                  <Link
                    key={cert.id}
                    href={`/admin/certifications/${cert.slug}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:border-accent hover:bg-background"
                  >
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{cert.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            contentReady
                              ? "bg-green-500/10 text-green-600"
                              : "bg-yellow-500/10 text-yellow-600"
                          }`}
                        >
                          {contentReady
                            ? locale === "de" ? "Lerninhalt bereit" : "Content ready"
                            : locale === "de" ? "Inhalt fehlt" : "Content missing"}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/60">
                        {cert.provider} · {cert.examName} {cert.examVersion}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-foreground/50">
                        <span>{cert.stats.domains} Domains</span>
                        <span>{cert.stats.objectives} Objectives</span>
                        <span>{cert.stats.sections} Sections</span>
                        <span>{cert.stats.lessons} Lessons</span>
                        <span>{cert.stats.questions} Questions</span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-foreground/40" />
                  </Link>
                );
              })}
            </div>
          )}

          {certifications.some((cert) => cert.stats.lessons === 0) && (
            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="flex gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
                <div>
                  <p className="font-medium">
                    {locale === "de" ? "Lerninhalte müssen noch erzeugt werden" : "Learning content still needs generation"}
                  </p>
                  <p className="mt-1 text-sm text-foreground/70">
                    {locale === "de"
                      ? "Kurs öffnen und dort auf \"Inhalte generieren\" klicken - läuft im Hintergrund mit Fortschrittsanzeige, kein Terminal-/CLI-Zugriff nötig:"
                      : "Open the course and click \"Generate content\" there - runs in the background with a progress bar, no terminal/CLI access needed:"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {certifications
                      .filter((cert) => cert.stats.lessons === 0)
                      .map((cert) => (
                        <Link
                          key={cert.id}
                          href={`/admin/certifications/${cert.slug}`}
                          className="rounded-md border border-yellow-500/40 bg-white px-2.5 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-100"
                        >
                          {cert.name}
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="h-fit rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-1 text-lg font-semibold">
            {locale === "de" ? "Kurs hinzufügen" : "Add course"}
          </h2>
          <p className="mb-4 text-sm text-foreground/60">
            {locale === "de"
              ? "Legt nur die Kursstruktur an (Domains). Lektionen/Fragen folgen später per content:draft-curriculum."
              : "Only creates the course structure (domains). Lessons/questions follow later via content:draft-curriculum."}
          </p>
          <form action={createCertificationAction} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{locale === "de" ? "Name" : "Name"}</span>
              <input
                name="name"
                required
                placeholder="CompTIA Network+"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
              <span className="mt-1 block text-xs text-foreground/50">
                {locale === "de" ? "Anzeigename des Kurses." : "Display name of the course."}
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                {locale === "de" ? "URL-Name" : "URL name"}
                <span className="ml-1 font-normal text-foreground/40">(Slug)</span>
              </span>
              <input
                name="slug"
                required
                placeholder="network-plus-n10-009"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Nur a-z, 0-9 und Bindestriche, z. B. network-plus-n10-009"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono"
              />
              <span className="mt-1 block text-xs text-foreground/50">
                {locale === "de"
                  ? <>Erlaubt: <code className="rounded bg-background px-1">a-z 0-9 -</code> - erscheint in der URL, z. B. /cert/network-plus-n10-009</>
                  : <>Allowed: <code className="rounded bg-background px-1">a-z 0-9 -</code> - appears in the URL, e.g. /cert/network-plus-n10-009</>}
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Provider</span>
              <input
                name="provider"
                required
                placeholder="CompTIA"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{locale === "de" ? "Prüfung" : "Exam"}</span>
                <input
                  name="examName"
                  required
                  placeholder="Network+"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">{locale === "de" ? "Version" : "Version"}</span>
                <input
                  name="examVersion"
                  required
                  placeholder="N10-009"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Domains
                <span className="ml-1.5 font-normal text-foreground/50">
                  {locale === "de" ? "- eine Zeile pro Domain" : "- one line per domain"}
                </span>
              </span>
              <div className="mb-1.5 rounded-md border border-dashed border-border bg-background px-3 py-2 font-mono text-xs text-foreground/60">
                Name<span className="text-accent"> | </span>Gewichtung
                <span className="ml-2 text-foreground/40">
                  {locale === "de" ? "(Gewichtung optional, Zahl 0-100)" : "(weight optional, number 0-100)"}
                </span>
              </div>
              <textarea
                name="domains"
                required
                rows={5}
                placeholder={"Networking Concepts | 23\nNetwork Security | 20\nNetwork Troubleshooting"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono"
              />
              <span className="mt-1 block text-xs text-foreground/50">
                {locale === "de"
                  ? "Ohne \"| Zahl\" wird die Gewichtung auf 0 gesetzt. Leerzeilen werden ignoriert."
                  : "Without \"| number\" the weight defaults to 0. Blank lines are ignored."}
              </span>
            </label>
            <button type="submit" className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              {locale === "de" ? "Kursstruktur anlegen" : "Create course structure"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
