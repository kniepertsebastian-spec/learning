"use client";

import { useCallback, useSyncExternalStore } from "react";

export type FeedbackMode = "instant" | "end";

const STORAGE_KEY = "proofpath-session-feedback";
const CHANGE_EVENT = "proofpath:feedback-mode-changed";

function readMode(): FeedbackMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "end" ? "end" : "instant";
  } catch {
    return "instant"; // Speicher nicht verfügbar - Standard
  }
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Einstellung „Feedback erst am Ende“ (roadmap_didaktik Phase 2) für Nutzer, die
 * Prüfungsbedingungen üben wollen. Rein eine Anzeigepräferenz des Geräts, daher
 * localStorage; ohne Speicher (privater Modus) gilt der Standard „sofort“.
 */
export function useFeedbackMode(): [FeedbackMode, (mode: FeedbackMode) => void] {
  const mode = useSyncExternalStore(subscribe, readMode, () => "instant" as FeedbackMode);
  const setMode = useCallback((next: FeedbackMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // nicht persistierbar
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [mode, setMode];
}
