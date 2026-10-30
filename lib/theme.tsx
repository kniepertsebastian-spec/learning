"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
/** Gewählte Darstellung: „system“ folgt der Geräteeinstellung (Standard für neue Nutzer). */
export type ThemePreference = "system" | Theme;

const STORAGE_KEY = "certstudy-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

let listeners: Array<() => void> = [];
let currentPreference: ThemePreference | null = null;
let mediaBound = false;

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    /* Speicher gesperrt: Systemeinstellung */
  }
  return "system";
}

function resolve(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0A1118" : "#F4F7F9");
}

function notify() {
  for (const listener of listeners) listener();
}

function bindMedia() {
  if (mediaBound || !window.matchMedia) return;
  mediaBound = true;
  window.matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (getPreference() !== "system") return;
    applyTheme(resolve("system"));
    notify();
  });
}

function getPreference(): ThemePreference {
  if (currentPreference === null) {
    currentPreference = readPreference();
    applyTheme(resolve(currentPreference));
    bindMedia();
  }
  return currentPreference;
}

/** Snapshot als String „Wahl:aufgelöst“, damit ein Systemwechsel bei „system“ ebenfalls neu rendert. */
function getSnapshot(): string {
  const preference = getPreference();
  return `${preference}:${resolve(preference)}`;
}

function getServerSnapshot(): string {
  return "system:dark";
}

function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function setPreference(next: ThemePreference) {
  currentPreference = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* nur für diese Sitzung */
  }
  applyTheme(resolve(next));
  notify();
}

interface ThemeContextValue {
  /** Tatsächlich angezeigte Darstellung */
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, theme] = snapshot.split(":") as [ThemePreference, Theme];

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, preference, setPreference, toggleTheme }), [theme, preference, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
