"use client";

import { CalendarCheck, Flame, Languages, Menu, Moon, ShieldAlert, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SidebarContent, type ShellData } from "@/components/shell/Sidebar";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "@/components/ui/search-field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import { useSwitchLocale } from "@/lib/client/use-switch-locale";
import { contextForPath, isPublicPath } from "@/lib/shell/nav";
import { useTheme } from "@/lib/theme";

/** Seiten ohne Anmeldung (Login, Einladung, …): schlanke Leiste mit Sprache und Theme, keine Navigation. */
function PublicFrame({ children }: { children: React.ReactNode }) {
  const { locale, t } = useLocale();
  const switchLocale = useSwitchLocale();
  const { theme, toggleTheme } = useTheme();
  const btn = "flex h-10 items-center gap-1.5 rounded-md border border-border-strong bg-control px-2.5 text-sm font-medium hover:bg-surface-2";
  return (
    <div data-context="personal" className="flex min-h-dvh flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <OfflineBanner />
      <header className="flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-mint text-sm font-bold text-on-accent" aria-hidden="true">P</span>
          {t.appTitle}
        </Link>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => switchLocale(locale === "de" ? "en" : "de")} aria-label={`${locale.toUpperCase()} – ${t.shell.language}`}>
            <Languages className="h-4 w-4" aria-hidden="true" />{locale.toUpperCase()}
          </button>
          <button type="button" className={cn(btn, "w-10 justify-center px-0")} onClick={toggleTheme} aria-label={t.shell.theme}>
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">{children}</main>
    </div>
  );
}

export function AppShell({ shell, streak, weekly = null, children }: { shell: ShellData | null; streak: number; weekly?: { days: number; goal: number } | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!shell || isPublicPath(pathname)) return <PublicFrame>{children}</PublicFrame>;

  // Ein Kontext, den die Person nicht hat, wird nicht gezeigt; die Seite selbst antwortet dann mit 403/Weiterleitung.
  const requested = contextForPath(pathname);
  const ctx = shell.contexts.includes(requested) ? requested : "personal";
  const sidebarWidth = ctx === "admin" ? "md:w-[232px]" : "md:w-[248px]";

  return (
    <div data-app-shell data-context={ctx} className="flex min-h-dvh flex-col bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">{t.shell.skipToContent}</a>
      <OfflineBanner />

      {ctx === "admin" && (
        <div role="note" className="z-40 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-sm text-warning-text md:sticky md:top-0 md:h-10 md:py-0 md:pt-0" data-testid="admin-strip">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <strong className="font-semibold tracking-[0.06em]">{t.shell.adminStrip}</strong>
          <span>{t.shell.adminStripText}</span>
          <Link href="/" className="ml-auto font-medium underline underline-offset-2">{t.shell.adminStripLink}</Link>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Mobil: obere Leiste mit Sheet */}
        <div className={cn("sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden", ctx === "admin" ? "h-14" : "h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]")}>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-sm font-bold text-on-accent" aria-hidden="true">P</span>
            {t.appTitle}
          </Link>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t.shell.openMenu} data-testid="mobile-menu" className="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong bg-control">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" closeLabel={t.shell.closeMenu} className="w-[min(300px,85vw)] bg-sidebar" data-context={ctx}>
            <SheetTitle className="sr-only">{t.shell.navLabel}</SheetTitle>
            <SheetDescription className="sr-only">{t.shell.switchContext}</SheetDescription>
            <SidebarContent ctx={ctx} data={shell} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        <aside className={cn("hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:sticky md:flex", ctx === "admin" ? "md:top-10 md:h-[calc(100vh-2.5rem)]" : "md:top-0 md:h-screen", sidebarWidth)} data-testid="sidebar">
          <SidebarContent ctx={ctx} data={shell} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-6 lg:px-8">
            {ctx === "personal" ? (
              <SearchField disabled aria-label={t.shell.searchLabel} placeholder={t.shell.search} className="max-w-[460px] flex-1 opacity-70" />
            ) : (
              <div className="flex-1" />
            )}
            <div className="ml-auto flex items-center gap-2">
              {ctx === "personal" && weekly && (
                <Badge tone={weekly.days >= weekly.goal ? "mint" : "neutral"} className="h-8 gap-1.5 px-3 text-sm" data-testid="weekly-goal-pill">
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  {fmt(t.shell.weeklyGoal, { a: weekly.days, b: weekly.goal })}
                </Badge>
              )}
              {ctx === "personal" && streak > 0 && (
                <Badge tone="warning" className="h-8 gap-1.5 px-3 text-sm" data-testid="streak-pill">
                  <Flame className="h-4 w-4" aria-hidden="true" />
                  {streak} {t.shell.streak}
                </Badge>
              )}
              <SyncStatusBadge userId={shell.user.id} locale={locale} />
            </div>
          </div>
          <main id="main" className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
