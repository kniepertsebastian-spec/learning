"use client";

import { InstallBanner } from "@/components/InstallBanner";
import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, CloudDownload, RefreshCw, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/types";
import {
  deleteOfflinePackage,
  getOfflinePackageRecord,
  isOfflineStorageSupported,
  PACKAGES_CHANGED_EVENT,
  type StoredOfflinePackage,
} from "@/lib/client/offline-db";
import { downloadOfflinePackage, fetchOfflinePackageVersion, type DownloadProgress } from "@/lib/client/offline-download";
import { getStorageStatus, type StorageStatus } from "@/lib/client/storage-status";
import { isPackageLocked } from "@/lib/pwa/package-expiry";
import { isUninstalledIosSafari } from "@/lib/client/install-prompt";
import { SectionContent } from "@/components/SectionContent";
import { reviewersText, changeLabel } from "@/lib/reviewers/seal";
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
  const [storage, setStorage] = useState<StorageStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStorageStatus().then((status) => {
      if (!cancelled) setStorage(status);
    });
    return () => {
      cancelled = true;
    };
  }, [record]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const stored = isOfflineStorageSupported()
        ? await getOfflinePackageRecord(userId, certificationId).catch(() => undefined)
        : undefined;
      if (cancelled) return;
      setRecord(stored ?? null);
      setLoadingRecord(false);
    };
    void load();
    // Zugriff entzogen: das Paket wurde vom Gerät entfernt, die Ansicht liest neu.
    window.addEventListener(PACKAGES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(PACKAGES_CHANGED_EVENT, load);
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

  const [showInstallStep, setShowInstallStep] = useState(false);

  async function handleDownload(skipInstallStep = false) {
    // iPhone/iPad in Safari ohne Installation: Safari kann den Speicher nach etwa einer Woche ohne Nutzung räumen, daher zuerst die Installation anbieten (überspringbar).
    if (!record && !skipInstallStep && isUninstalledIosSafari()) {
      setShowInstallStep(true);
      return;
    }
    setShowInstallStep(false);
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

  // Interner Lernpfad mit Ablauf (je Firma): ohne Online-Prüfung gesperrt, bis das Gerät wieder Netz hat.
  const locked = record ? isPackageLocked({ offlineMaxAgeDays: record.data.offlineMaxAgeDays, lastVerifiedAt: record.lastVerifiedAt, downloadedAt: record.downloadedAt }, new Date()) : false;
  const flatSections = (locked ? [] : record?.data.domains ?? []).flatMap((domain) =>
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
          className="mb-4 text-sm text-muted hover:text-foreground"
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

  if (showSession && record?.data.session && !locked) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowSession(false)}
          className="mb-4 text-sm text-muted hover:text-foreground"
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
      <InstallBanner />
      {locked && (
        <div role="alert" data-testid="package-locked" className="rounded-lg border border-warning-text/40 bg-surface p-4 text-sm">
          {locale === "de"
            ? "Dieser Kurs ist gesperrt, weil er zu lange nicht online geprüft wurde. Verbinde das Gerät mit dem Internet und öffne die App, dann ist er wieder nutzbar."
            : "This course is locked because it has not been checked online for too long. Connect to the internet and open the app to unlock it."}
        </div>
      )}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium">{certName}</h2>
        {record?.data.seal && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-mint-text" data-testid="offline-seal">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {locale === "de" ? "Fachlich geprüft von" : "Reviewed by"} {reviewersText(record.data.seal, locale)} · {locale === "de" ? "Version" : "Version"} {record.data.seal.versionLabel} · {locale === "de" ? "Stand" : "as of"} {new Date(record.data.seal.approvedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" })}
              {record.data.seal.changeCount ? ` · ${changeLabel(record.data.seal.changeCount, locale)}` : ""}
            </span>
          </p>
        )}
        {loadingRecord ? (
          <p className="text-sm text-subtle">{locale === "de" ? "Lädt…" : "Loading…"}</p>
        ) : record ? (
          <div className="flex flex-col gap-1 text-sm text-muted">
            <p className="flex items-center gap-1.5 text-success-text dark:text-success-text">
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
              <p className="text-warning-text dark:text-warning-text">
                {locale === "de"
                  ? "Es gibt eine aktuellere Version dieses Kurses."
                  : "A newer version of this course is available."}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-subtle">
            {locale === "de"
              ? "Dieser Kurs ist noch nicht für offline gespeichert."
              : "This course is not yet saved for offline use."}
          </p>
        )}

        {record && storage && (storage.usageBytes !== null || storage.persisted !== null) && (
          <div className="mt-2 flex flex-col gap-1 text-xs text-subtle" data-testid="offline-storage-status">
            {storage.usageBytes !== null && storage.quotaBytes !== null && (
              <p>
                {locale === "de" ? "Speicher belegt" : "Storage used"}: {formatBytes(storage.usageBytes)}{" "}
                {locale === "de" ? "von" : "of"} {formatBytes(storage.quotaBytes)}
              </p>
            )}
            {storage.persisted === true && (
              <p>{locale === "de" ? "Speicher dauerhaft gesichert." : "Storage is persistent."}</p>
            )}
            {storage.persisted === false && (
              <p className="text-warning-text">
                {locale === "de"
                  ? "Der Browser kann Offline-Daten bei Speichermangel löschen. Tipp: App installieren, damit Offline-Daten erhalten bleiben."
                  : "The browser may delete offline data when storage runs low. Tip: install the app to keep offline data."}
              </p>
            )}
          </div>
        )}

        {downloading && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: percent !== null ? `${percent}%` : "30%" }}
              />
            </div>
            <p className="mt-1 text-xs text-subtle">
              {progress ? formatBytes(progress.loadedBytes) : ""}
              {percent !== null ? ` (${percent}%)` : ""}
            </p>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-danger-text dark:text-danger-text">{error}</p>}

        {showInstallStep && (
          <div role="region" aria-label={locale === "de" ? "Zuerst installieren" : "Install first"} data-testid="download-install-step" className="mt-3 rounded-md border border-border bg-surface-inset p-3 text-sm">
            <p className="font-medium">{locale === "de" ? "Installiere die App, bevor du Kurse speicherst" : "Install the app before saving courses"}</p>
            <p className="mt-1 text-subtle">
              {locale === "de"
                ? "Safari kann gespeicherte Kurse und noch nicht übertragene Ergebnisse einer nicht installierten Website nach etwa einer Woche ohne Nutzung löschen."
                : "Safari can delete saved courses and results that are not uploaded yet from a website that is not installed after about a week without use."}
            </p>
            <ol className="mt-2 flex list-decimal flex-col gap-0.5 pl-5">
              <li>{locale === "de" ? "Tippe unten in Safari auf „Teilen“" : "Tap “Share” in Safari"}</li>
              <li>{locale === "de" ? "Wähle „Zum Home-Bildschirm“ und öffne die App von dort" : "Choose “Add to Home Screen” and open the app from there"}</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleDownload(true)} data-testid="download-install-skip" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background">
                {locale === "de" ? "Trotzdem speichern" : "Save anyway"}
              </button>
              <button type="button" onClick={() => setShowInstallStep(false)} className="rounded-md px-3 py-1.5 text-sm text-subtle hover:bg-background">
                {locale === "de" ? "Später" : "Later"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {locale === "de" ? "Offline-Daten löschen" : "Delete offline data"}
            </button>
          )}
        </div>
      </div>

      {record?.data.session && (
        <div className="rounded-lg border border-accent-border bg-accent-soft p-4">
          <p className="mb-1 text-sm font-medium">
            {locale === "de" ? "Heutige Session verfügbar" : "Today's session available"}
          </p>
          <p className="mb-3 text-xs text-subtle">
            {record.data.session.questionItems.length}{" "}
            {locale === "de" ? "Fragen, offline beantwortbar" : "questions, answerable offline"}
          </p>
          <button
            type="button"
            onClick={() => setShowSession(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90"
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
                    <p className="mb-2 text-xs font-medium text-subtle">
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
