"use client";

import Link from "next/link";
import { GraduationCap, Languages, Moon, Settings, Sun } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function Header() {
  const { locale, setLocale, t } = useLocale();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GraduationCap className="h-6 w-6 text-accent" aria-hidden="true" />
          <span>{t.appTitle}</span>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {t.statusBadge}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border border-border p-2 hover:bg-background"
            aria-label={locale === "de" ? "Admin öffnen" : "Open admin"}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Link>

          <button
            type="button"
            onClick={() => setLocale(locale === "de" ? "en" : "de")}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium hover:bg-background"
            aria-label={`${locale.toUpperCase()} - toggle language`}
          >
            <Languages className="h-4 w-4" aria-hidden="true" />
            {locale.toUpperCase()}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md border border-border p-2 hover:bg-background"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
