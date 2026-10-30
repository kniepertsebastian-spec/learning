"use client";

import { ChevronsUpDown, Check, Shield } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ContextIcon, NAV_ICONS } from "@/components/shell/nav-icons";
import { LogoMark } from "@/components/shell/Logo";
import { UserMenu } from "@/components/shell/UserMenu";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { isNavActive, navItems, type CompanyNavOptions, type ShellContext } from "@/lib/shell/nav";

export type ShellUser = { id: string; email: string };

export type ShellData = {
  contexts: ShellContext[];
  companyName: string | null;
  nav: CompanyNavOptions;
  user: ShellUser;
};

function contextName(ctx: ShellContext, data: ShellData, t: ReturnType<typeof useLocale>["t"]) {
  if (ctx === "company") return data.companyName ?? t.shell.contextCompany;
  return ctx === "admin" ? t.shell.contextAdmin : t.shell.contextPersonal;
}

function contextHref(ctx: ShellContext) {
  return ctx === "company" ? "/company" : ctx === "admin" ? "/admin" : "/";
}

function ContextTile({ ctx, name }: { ctx: ShellContext; name: string }) {
  if (ctx === "personal") return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-link"><ContextIcon className="h-4 w-4" aria-hidden="true" /></span>;
  if (ctx === "admin") return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent"><Shield className="h-4 w-4" aria-hidden="true" /></span>;
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-on-accent">{name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "F"}</span>;
}

/** Kontext-Switcher: zeigt nur Kontexte, für die der Server Rechte ermittelt hat. */
function ContextSwitcher({ ctx, data, onNavigate }: { ctx: ShellContext; data: ShellData; onNavigate?: () => void }) {
  const { t } = useLocale();
  const name = contextName(ctx, data, t);
  const multi = data.contexts.length > 1;
  const body = (
    <>
      <ContextTile ctx={ctx} name={name} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-2xs font-medium tracking-overline text-ctx-label uppercase">{t.shell.context}</span>
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
      </span>
      {multi && <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />}
    </>
  );
  const cls = "flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-switcher-border bg-switcher px-2.5 py-2";
  if (!multi) return <div className={cls} data-testid="context-switcher">{body}</div>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(cls, "hover:border-border-strong")} aria-label={t.shell.switchContext} data-testid="context-switcher">
        {body}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuLabel>{t.shell.switchContext}</DropdownMenuLabel>
        {data.contexts.map((c) => (
          <DropdownMenuItem key={c} asChild>
            <Link href={contextHref(c)} onClick={onNavigate} data-testid={`context-option-${c}`} className="justify-between">
              <span className="flex items-center gap-2.5">
                <span className={cn("h-2 w-2 rounded-full", c === "company" ? "bg-warning" : c === "admin" ? "bg-danger" : "bg-brand")} aria-hidden="true" />
                {contextName(c, data, t)}
              </span>
              {c === ctx && <Check className="h-4 w-4 text-link" aria-hidden="true" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarContent({ ctx, data, onNavigate }: { ctx: ShellContext; data: ShellData; onNavigate?: () => void }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const items = navItems(ctx, data.nav);
  const otherContexts = ctx === "personal" ? data.contexts.filter((c) => c !== "personal") : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md px-1 py-1 font-semibold">
        <LogoMark />
        <span>{t.appTitle}</span>
        <Badge tone="accent">{t.statusBadge}</Badge>
      </Link>

      <ContextSwitcher ctx={ctx} data={data} onNavigate={onNavigate} />

      <nav aria-label={t.shell.navLabel} className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isNavActive(item, pathname, tab);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              data-testid={`nav-${item.label}`}
              className={cn("flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium", active ? "bg-nav-active text-foreground" : "text-muted hover:bg-nav-active/60 hover:text-foreground")}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-link" : "text-faint")} aria-hidden="true" />
              <span className="truncate">{t.shell[item.label]}</span>
            </Link>
          );
        })}

        {otherContexts.length > 0 && (
          <div className="mt-4">
            <p className="px-2.5 pb-1 text-2xs font-semibold tracking-overline text-ctx-label uppercase">{t.shell.areas}</p>
            {otherContexts.map((c) => (
              <Link key={c} href={contextHref(c)} onClick={onNavigate} data-testid={`area-${c}`} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted hover:bg-nav-active/60 hover:text-foreground">
                <span className={cn("h-2 w-2 rounded-full", c === "company" ? "bg-warning" : "bg-danger")} aria-hidden="true" />
                {contextName(c, data, t)}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <UserMenu user={data.user} />
    </div>
  );
}
