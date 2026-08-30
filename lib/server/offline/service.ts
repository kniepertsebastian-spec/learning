/**
 * Offline PWA service for syncing data and managing offline state.
 * Works with service worker to cache backend-sourced content.
 */

export interface OfflineSyncData {
  lessons: Array<{
    id: string;
    sectionId: string;
    content: string;
  }>;
  questions: Array<{
    id: string;
    objectiveId: string;
    question: string;
  }>;
  progress: Array<{
    objectiveId: string;
    masteryScore: number;
  }>;
  quizAttempts: Array<{
    id: string;
    score: number;
    completedAt: string;
  }>;
}

export class OfflineService {
  /**
   * Prepares data for offline sync
   * Includes lessons, questions, progress, and attempts
   */
  static prepareSyncData(
    lessons: any[],
    questions: any[],
    progress: any[],
    attempts: any[],
  ): OfflineSyncData {
    return {
      lessons: lessons.map((l) => ({
        id: l.id,
        sectionId: l.sectionId,
        content: JSON.stringify(l.content),
      })),
      questions: questions.map((q) => ({
        id: q.id,
        objectiveId: q.objectiveId,
        question: JSON.stringify(q.question),
      })),
      progress: progress.map((p) => ({
        objectiveId: p.objectiveId,
        masteryScore: Number(p.masteryScore),
      })),
      quizAttempts: attempts.map((a) => ({
        id: a.id,
        score: Number(a.score) || 0,
        completedAt: a.completedAt?.toISOString() || new Date().toISOString(),
      })),
    };
  }

  /**
   * Calculates storage needed for offline content
   */
  static calculateStorageNeeded(syncData: OfflineSyncData): {
    totalBytes: number;
    estimatedMB: number;
  } {
    const json = JSON.stringify(syncData);
    const totalBytes = new Blob([json]).size;
    const estimatedMB = Math.round((totalBytes / 1024 / 1024) * 100) / 100;

    return {
      totalBytes,
      estimatedMB,
    };
  }

  /**
   * Service worker configuration for offline content
   * Returns cache strategies and versioning
   */
  static getOfflineStrategy() {
    return {
      version: "v1-offline",
      cacheName: "cert-study-offline-v1",
      assets: {
        lessons: "lessons-v1",
        questions: "questions-v1",
        progress: "progress-v1",
      },
      ttl: {
        lessons: 30 * 24 * 60 * 60 * 1000, // 30 days
        questions: 30 * 24 * 60 * 60 * 1000, // 30 days
        progress: 1 * 60 * 60 * 1000, // 1 hour (sync frequently)
      },
    };
  }

  /**
   * Tracks offline changes to sync when back online
   */
  static buildSyncQueue(
    localChanges: Array<{
      type: "quiz_attempt" | "progress_update" | "remediation";
      data: Record<string, unknown>;
      timestamp: number;
    }>,
  ) {
    return {
      pending: localChanges,
      count: localChanges.length,
      oldestChange: localChanges.length > 0 ? localChanges[0].timestamp : null,
    };
  }
}
