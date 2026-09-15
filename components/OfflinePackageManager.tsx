"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CloudDownload, RefreshCw, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/types";
import {
  deleteOfflinePackage,
  getOfflinePackageRecord,
  isOfflineStorageSupported,
  type StoredOfflinePackage,
} from "@/lib/client/offline-db";
import { downloadOfflinePackage, fetchOfflinePackageVersion, type DownloadProgress } from "@/lib/client/offline-download";
import { SectionContent } from "@/components/SectionContent";
import { StudySession } from "@/components/StudySession";

interface OfflinePackageManagerProps {
  certificationId: string;
  certSlug: string;
  certName: string;
  userId: string;
  locale: Locale;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "de" ? "de-DE" : "en-US");
}

/**
 * R4.1/4.2/4.3 (roadmap.md): Download, lokale Speicherung (IndexedDB) und
 * Offline-Ansicht eines Kurspakets - eigene Route statt jede bestehende
 * Server-Seite offline-fähig zu machen (die sind `force-dynamic` und setzen
 * eine Live-DB-Verbindung voraus; das einzeln umzubauen wäre ein deutlich
 * größerer, risikoreicherer Eingriff und bewusst nicht Teil dieser Arbeit).
 */
export function OfflinePackageManager({
  certificationId,
  certSlug,
  certName,
  userId,
  locale,
}: OfflinePackageManagerProps) {
  const [record, setRecord] = useState<StoredOfflinePackage | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showSession, setShowSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = isOfflineStorageSupported()
        ? await getOfflinePackageRecord(userId, certificationId).catch(() => undefined)
        : undefined;
      if (cancelled) return;
      setRecord(stored ?? null);
      setLoadingRecord(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, certificationId]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let cancelled = false;
    (async () => {
      const version = await fetchOfflinePackageVersion(certificationId).catch(() => null);
      if (!cancelled) setRemoteVersion(version);
    })();
    return () => {
      cancelled = true;
    };
  }, [certificationId]);

  async function handleDownload() {
    if (!isOfflineStorageSupported()) {
      setError(
        locale === "de"
          ? "Offline-Speicherung wird von diesem Browser nicht unterstützt."
          : "Offline storage is not supported in this browser.",
      );
      return;
    }
    setDownloading(true);
    setError(null);
    setProgress({ loadedBytes: 0, totalBytes: null });
    try {
      const stored = await downloadOfflinePackage(certificationId, userId, setProgress);
      setRecord(stored);
      setRemoteVersion(stored.version);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : locale === "de"
            ? "Download fehlgeschlagen."
            : "Download failed.",
      );
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  async function handleDelete() {
    await deleteOfflinePackage(userId, certificationId);
    setRecord(null);
    setSelectedSectionId(null);
  }

  const hasUpdate = !!(record && remoteVersion && record.version !== remoteVersion);
  const percent =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.round((progress.loadedBytes / progress.totalBytes) * 100)
      : null;

  const flatSections = (record?.data.domains ?? []).flatMap((domain) =>
    domain.objectives.flatMap((objective) =>
      objective.sections.map((section) => ({ section, objective, domainName: domain.name })),
    ),
  );
  const selected = selectedSectionId
    ? (flatSections.find((entry) => entry.section.id === selectedSectionId) ?? null)
    : null;

  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedSectionId(null)}
          className="mb-4 text-sm text-foreground/70 hover:text-foreground"
        >
          {locale === "de" ? "← Zurück zur Offline-Übersicht" : "← Back to offline overview"}
        </button>
        <SectionContent
          certSlug={certSlug}
          sectionId={selected.section.id}
          sectionTitle={selected.section.title}
          objectiveCode={selected.objective.code}
          objectiveTitle={selected.objective.title}
          domainName={selected.domainName}
          lesson={selected.section.lesson}
          questions={selected.objective.questions}
          offline={{ userId }}
        />
      </div>
    );
  }

  if (showSession && record?.data.session) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowSession(false)}
          className="mb-4 text-sm text-foreground/70 hover:text-foreground"
        >
          {locale === "de" ? "← Zurück zur Offline-Übersicht" : "← Back to offline overview"}
        </button>
        <StudySession
          certSlug={certSlug}
          sessionId={record.data.session.sessionId}
          questionItems={record.data.session.questionItems}
          lessonItems={[]}
          locale={locale}
          offline={{ userId }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">{certName}</h2>
        {loadingRecord ? (
          <p className="text-sm text-foreground/60">{locale === "de" ? "Lädt…" : "Loading…"}</p>
        ) : record ? (
          <div className="flex flex-col gap-1 text-sm text-foreground/70">
            <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {locale === "de" ? "Für offline verfügbar" : "Available offline"}
            </p>
            <p>
              {locale === "de" ? "Größe" : "Size"}: {formatBytes(record.sizeBytes)}
            </p>
            <p>
              {locale === "de" ? "Heruntergeladen am" : "Downloaded"}: {formatDate(record.downloadedAt, locale)}
            </p>
            {hasUpdate && (
              <p className="text-amber-600 dark:text-amber-400">
                {locale === "de"
                  ? "Es gibt eine aktuellere Version dieses Kurses."
                  : "A newer version of this course is available."}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-foreground/60">
            {locale === "de"
              ? "Dieser Kurs ist noch nicht für offline gespeichert."
              : "This course is not yet saved for offline use."}
          </p>
        )}

        {downloading && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: percent !== null ? `${percent}%` : "30%" }}
              />
            </div>
            <p className="mt-1 text-xs text-foreground/60">
              {progress ? formatBytes(progress.loadedBytes) : ""}
              {percent !== null ? ` (${percent}%)` : ""}
            </p>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {hasUpdate ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />}
            {record
              ? hasUpdate
                ? locale === "de"
                  ? "Aktualisieren"
                  : "Update"
                : locale === "de"
                  ? "Erneut speichern"
                  : "Re-download"
              : locale === "de"
                ? "Für offline speichern"
                : "Save for offline"}
          </button>
          {record && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:bg-background"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {locale === "de" ? "Offline-Daten löschen" : "Delete offline data"}
            </button>
          )}
        </div>
      </div>

      {record?.data.session && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
          <p className="mb-1 text-sm font-medium">
            {locale === "de" ? "Heutige Session verfügbar" : "Today's session available"}
          </p>
          <p className="mb-3 text-xs text-foreground/60">
            {record.data.session.questionItems.length}{" "}
            {locale === "de" ? "Fragen, offline beantwortbar" : "questions, answerable offline"}
          </p>
          <button
            type="button"
            onClick={() => setShowSession(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {locale === "de" ? "Session starten" : "Start session"}
          </button>
        </div>
      )}

      {record && (
        <div className="flex flex-col gap-4">
          {record.data.domains.map((domain) => (
            <div key={domain.id}>
              <h3 className="mb-2 text-sm font-semibold">{domain.name}</h3>
              <div className="flex flex-col gap-3">
                {domain.objectives.map((objective) => (
                  <div key={objective.id} className="rounded-lg border border-border bg-surface p-3">
                    <p className="mb-2 text-xs font-medium text-foreground/60">
                      <span className="mr-1.5 font-mono">{objective.code}</span>
                      {objective.title}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {objective.sections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setSelectedSectionId(section.id)}
                          className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:border-accent hover:bg-background"
                        >
                          {section.title[locale]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
