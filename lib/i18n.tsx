"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Locale } from "./types";

const STORAGE_KEY = "certstudy-locale";

let listeners: Array<() => void> = [];
let currentLocale: Locale | null = null;

function computeInitialLocale(): Locale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") return stored;
  return window.navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

function getSnapshot(): Locale {
  if (currentLocale === null) {
    currentLocale = computeInitialLocale();
  }
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return "de";
}

function subscribe(callback: () => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function persistLocale(next: Locale) {
  currentLocale = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  document.cookie = `certstudy-locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
  for (const listener of listeners) listener();
}

import { uiStrings, type UiStrings } from "./i18n-strings";

export { uiStrings };
export type { UiStrings };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: UiStrings;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: uiStrings[locale] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/** Wie useLocale, aber ohne Provider (z. B. in Tests oder beim Server-Rendern außerhalb der App): Deutsch als Standard. */
export function useLocaleOptional(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  return ctx ?? { locale: "de", setLocale: () => {}, t: uiStrings.de };
}
