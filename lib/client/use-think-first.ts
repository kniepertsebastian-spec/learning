"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "proofpath-think-first";
const CHANGE_EVENT = "proofpath:think-first-changed";

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // Speicher nicht verfügbar - Standard „aus“
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
 * Modus „Antwort zuerst überlegen“ (roadmap_didaktik 3.2): Die Optionen einer Auswahlfrage bleiben verdeckt, bis man sie bewusst zeigt.
 * Reine Lernhilfe und Anzeigepräferenz dieses Geräts (localStorage), Standard aus. Auf dem Server wird nur vermerkt, ob eine Antwort so
 * entstanden ist (für die Auswertung), nicht die Einstellung selbst.
 */
export function useThinkFirst(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const setEnabled = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // nicht persistierbar
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [enabled, setEnabled];
}
