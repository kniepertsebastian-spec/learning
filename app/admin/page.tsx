export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import { auth } from "@/lib/server/auth";
import { getServerLocale } from "@/lib/server/locale";
import { getCertificationsWithStats } from "@/lib/server/admin/stats";

export default async function AdminDashboard() {
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  // Query directly instead of self-fetching /api/admin/certifications - a
  // server-to-server fetch from a server component doesn't carry the
  // browser's session cookie, so that always returned 401 -> [] silently.
  const certifications = session?.user?.id ? await getCertificationsWithStats() : [];

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-foreground/70">{locale === "de" ? "Nicht authentifiziert" : "Not authenticated"}</p>
        <Link href="/login" className="mt-4 text-accent hover:underline">
          {locale === "de" ? "Anmelden" : "Sign in"}
        </Link>
      </div>
    );
  }

  // TODO: Add admin role verification
  if (!session.user.email?.includes("admin")) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-yellow-500" />
        <p className="mt-2 text-foreground/70">{locale === "de" ? "Admin-Zugriff erforderlich" : "Admin access required"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 text-2xl font-semibold">{locale === "de" ? "Admin-Dashboard" : "Admin Dashboard"}</h1>
      <p className="mb-6 text-sm text-foreground/70">
        {locale === "de" ? "Verwaltung von Zertifizierungen und Inhalten" : "Manage certifications and content"}
      </p>

      <div className="flex flex-col gap-6">
        <div>
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
              {certifications.map((cert) => (
                <Link
                  key={cert.id}
                  href={`/admin/certifications/${cert.slug}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:border-accent hover:bg-background"
                >
                  <div className="flex-1">
                    <p className="font-medium">{cert.name}</p>
                    <p className="text-sm text-foreground/60">
                      {cert.provider} • {cert.examName} {cert.examVersion}
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-foreground/50">
                      <span>{cert.stats.domains} domains</span>
                      <span>•</span>
                      <span>{cert.stats.objectives} objectives</span>
                      <span>•</span>
                      <span>{cert.stats.lessons} lessons</span>
                      <span>•</span>
                      <span>{cert.stats.questions} questions</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-foreground/40" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-2 font-medium">{locale === "de" ? "Admin-Funktionen" : "Admin Functions"}</h3>
          <ul className="space-y-1 text-sm text-foreground/70">
            <li>• {locale === "de" ? "Inhalte validieren" : "Validate content"}</li>
            <li>• {locale === "de" ? "Inhalte genehmigen/ablehnen" : "Approve/reject content"}</li>
            <li>• {locale === "de" ? "Problematische Inhalte markieren" : "Flag problematic content"}</li>
            <li>• {locale === "de" ? "Inhalte bearbeiten" : "Edit content"}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
