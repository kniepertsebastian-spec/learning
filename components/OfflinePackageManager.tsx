"use client";

import { c_offlinePackageManager } from "@/lib/i18n/components/offlinePackageManager";
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
import { downloadOfflinePackage, fetchOfflinePackageVersion, OfflineDownloadError, type DownloadProgress } from "@/lib/client/offline-download";
import { getUnsavedSyncEventCount, onSyncQueueError, retryUnsavedSyncEvents } from "@/lib/client/sync-queue";
import { getStorageStatus, type StorageStatus } from "@/lib/client/storage-status";
import { isPackageLocked } from "@/lib/pwa/package-expiry";
import { isUninstalledIosSafari } from "@/lib/client/install-prompt";
import { reviewersText, changeLabel } from "@/lib/reviewers/seal";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Lektion und Lernsitzung erst laden, wenn sie geöffnet werden (eigene Chunks, offline über den Precache des Service Workers).
const ReaderLoading = () => <Skeleton className="h-96 w-full rounded-2xl" />;
const SectionContent = dynamic(() => import("@/components/SectionContent").then((m) => m.SectionContent), { loading: ReaderLoading });
const StudySession = dynamic(() => import("@/components/StudySession").then((m) => m.StudySession), { loading: ReaderLoading });

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

/** Lokalisierte Meldung zu einem Download-Fehler, nie die rohe Browser-Meldung (`e.message`). */
export function downloadErrorText(error: unknown, locale: Locale): string {
  const t = c_offlinePackageManager(locale);
  return error instanceof OfflineDownloadError && error.code === "QUOTA_EXCEEDED" ? t.storageFullDownload : t.downloadFailed;
}

/** Aktionsbuttons: auf Touch-Geräten mindestens 44 px hoch, ab `sm` kompakter. */
const TOUCH_TARGET = "min-h-11 sm:min-h-9";

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
  // Offline beendete Quiz/Sessions, die wegen vollen Speichers nicht gesichert werden konnten (lib/client/sync-queue.ts).
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [savedAgain, setSavedAgain] = useState(false);

  useEffect(() => {
    setUnsavedCount(getUnsavedSyncEventCount());
    return onSyncQueueError((detail) => {
      setSavedAgain(false);
      setUnsavedCount(detail.unsavedCount);
    });
  }, []);

  async function retryUnsaved() {
    const remaining = await retryUnsavedSyncEvents().catch(() => getUnsavedSyncEventCount());
    setUnsavedCount(remaining);
    setSavedAgain(remaining === 0);
  }

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
        c_offlinePackageManager(locale).offlineStorageIsNotSupported,
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
      setError(downloadErrorText(e, locale));
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  }

  async function handleDelete() {
    await deleteOfflinePackage(userId, certificationId);
    setRecord(null);
    setSelectedSectionId(null);
    setError(null);
    // Freigewordener Speicher: ungesicherte Ergebnisse gleich noch einmal sichern.
    if (getUnsavedSyncEventCount() > 0) await retryUnsaved();
  }

  const syncWarning =
    unsavedCount > 0 ? (
      <div role="alert" data-testid="sync-quota-warning" className="mb-4 rounded-lg border border-danger-text/40 bg-surface p-4 text-sm">
        <p className="font-medium text-danger-text">
          {c_offlinePackageManager(locale).unsavedResults}: {unsavedCount}
        </p>
        <p className="mt-1 text-muted">{c_offlinePackageManager(locale).storageFullSync}</p>
        <button
          type="button"
          onClick={() => void retryUnsaved()}
          className={`mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background ${TOUCH_TARGET}`}
        >
          {c_offlinePackageManager(locale).retrySave}
        </button>
      </div>
    ) : savedAgain ? (
      <p role="status" className="mb-4 text-sm text-success-text">
        {c_offlinePackageManager(locale).resultsSavedAgain}
      </p>
    ) : null;

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
        {syncWarning}
        <button
          type="button"
          onClick={() => setSelectedSectionId(null)}
          className={`mb-4 inline-flex items-center text-sm text-muted hover:text-foreground ${TOUCH_TARGET}`}
        >
          {c_offlinePackageManager(locale).backToOfflineOverview}
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
        {syncWarning}
        <button
          type="button"
          onClick={() => setShowSession(false)}
          className={`mb-4 inline-flex items-center text-sm text-muted hover:text-foreground ${TOUCH_TARGET}`}
        >
          {c_offlinePackageManager(locale).backToOfflineOverview}
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
      {syncWarning}
      {locked && (
        <div role="alert" data-testid="package-locked" className="rounded-lg border border-warning-text/40 bg-surface p-4 text-sm">
          {c_offlinePackageManager(locale).thisCourseIsLockedBecause}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-medium">{certName}</h2>
        {record?.data.seal && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-mint-text" data-testid="offline-seal">
            <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {c_offlinePackageManager(locale).reviewedBy} {reviewersText(record.data.seal, locale)} · {c_offlinePackageManager(locale).version} {record.data.seal.versionLabel} · {c_offlinePackageManager(locale).asOf} {new Date(record.data.seal.approvedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" })}
              {record.data.seal.changeCount ? ` · ${changeLabel(record.data.seal.changeCount, locale)}` : ""}
            </span>
          </p>
        )}
        {loadingRecord ? (
          <p className="text-sm text-subtle">{c_offlinePackageManager(locale).loading}</p>
        ) : record ? (
          <div className="flex flex-col gap-1 text-sm text-muted">
            <p className="flex items-center gap-1.5 text-success-text dark:text-success-text">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {c_offlinePackageManager(locale).availableOffline}
            </p>
            <p>
              {c_offlinePackageManager(locale).size}: {formatBytes(record.sizeBytes)}
            </p>
            <p>
              {c_offlinePackageManager(locale).downloaded}: {formatDate(record.downloadedAt, locale)}
            </p>
            {hasUpdate && (
              <p className="text-warning-text dark:text-warning-text">
                {c_offlinePackageManager(locale).aNewerVersionOfThis}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-subtle">
            {c_offlinePackageManager(locale).thisCourseIsNotYet}
          </p>
        )}

        {record && storage && (storage.usageBytes !== null || storage.persisted !== null) && (
          <div className="mt-2 flex flex-col gap-1 text-xs text-subtle" data-testid="offline-storage-status">
            {storage.usageBytes !== null && storage.quotaBytes !== null && (
              <p>
                {c_offlinePackageManager(locale).storageUsed}: {formatBytes(storage.usageBytes)}{" "}
                {c_offlinePackageManager(locale).of} {formatBytes(storage.quotaBytes)}
              </p>
            )}
            {storage.persisted === true && (
              <p>{c_offlinePackageManager(locale).storageIsPersistent}</p>
            )}
            {storage.persisted === false && (
              <p className="text-warning-text">
                {c_offlinePackageManager(locale).theBrowserMayDeleteOffline}
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
          <div role="region" aria-label={c_offlinePackageManager(locale).installFirst} data-testid="download-install-step" className="mt-3 rounded-md border border-border bg-surface-inset p-3 text-sm">
            <p className="font-medium">{c_offlinePackageManager(locale).installTheAppBeforeSaving}</p>
            <p className="mt-1 text-subtle">
              {c_offlinePackageManager(locale).safariCanDeleteSavedCourses}
            </p>
            <ol className="mt-2 flex list-decimal flex-col gap-0.5 pl-5">
              <li>{c_offlinePackageManager(locale).tapShareInSafari}</li>
              <li>{c_offlinePackageManager(locale).chooseAddToHomeScreen}</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleDownload(true)} data-testid="download-install-skip" className={`rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background ${TOUCH_TARGET}`}>
                {c_offlinePackageManager(locale).saveAnyway}
              </button>
              <button type="button" onClick={() => setShowInstallStep(false)} className={`rounded-md px-3 py-1.5 text-sm text-subtle hover:bg-background ${TOUCH_TARGET}`}>
                {c_offlinePackageManager(locale).later}
              </button>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloading}
            className={`flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${TOUCH_TARGET}`}
          >
            {hasUpdate ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />}
            {record
              ? hasUpdate
                ? c_offlinePackageManager(locale).update
                : c_offlinePackageManager(locale).reDownload
              : c_offlinePackageManager(locale).saveForOffline}
          </button>
          {record && (
            <button
              type="button"
              onClick={handleDelete}
              className={`flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-background ${TOUCH_TARGET}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {c_offlinePackageManager(locale).deleteOfflineData}
            </button>
          )}
        </div>
      </div>

      {record?.data.session && (
        <div className="rounded-lg border border-accent-border bg-accent-soft p-4">
          <p className="mb-1 text-sm font-medium">
            {c_offlinePackageManager(locale).todaySSessionAvailable}
          </p>
          <p className="mb-3 text-xs text-subtle">
            {record.data.session.questionItems.length}{" "}
            {c_offlinePackageManager(locale).questionsAnswerableOffline}
          </p>
          <button
            type="button"
            onClick={() => setShowSession(true)}
            className={`rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 ${TOUCH_TARGET}`}
          >
            {c_offlinePackageManager(locale).startSession}
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
                          className={`flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:border-accent hover:bg-background ${TOUCH_TARGET}`}
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
