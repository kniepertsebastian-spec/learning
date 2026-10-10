"use client";

import { LogOut, Moon, Sun, UserRound, Languages, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSignOut } from "@/lib/client/use-sign-out";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocale } from "@/lib/i18n";
import { useSwitchLocale } from "@/lib/client/use-switch-locale";
import { useTheme } from "@/lib/theme";
import type { ShellUser } from "@/components/shell/Sidebar";

/** Benutzerzeile unten in der Sidebar; hier – und nur hier – liegt „Abmelden“. */
export function UserMenu({ user }: { user: ShellUser }) {
  const { locale, t } = useLocale();
  const switchLocale = useSwitchLocale();
  const { theme, toggleTheme } = useTheme();
  const { signOut, isPending } = useSignOut(user.id);
  const name = user.email.split("@")[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t.shell.userMenu} data-testid="user-menu" className="flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left hover:border-sidebar-border hover:bg-nav-active/60">
        <Avatar name={name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{name}</span>
          <span className="block truncate text-xs text-faint">{t.shell.userMenuHint}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="truncate normal-case tracking-normal">{user.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link href="/profile"><UserRound className="h-4 w-4" aria-hidden="true" />{t.shell.profile}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/account"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t.shell.account}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); switchLocale(locale === "de" ? "en" : "de"); }} data-testid="menu-language">
          <Languages className="h-4 w-4" aria-hidden="true" />{t.shell.language}: {locale.toUpperCase()}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleTheme(); }} data-testid="menu-theme">
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          {t.shell.theme}: {theme === "dark" ? t.shell.themeDark : t.shell.themeLight}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isPending} onSelect={signOut} data-testid="header-logout"><LogOut className="h-4 w-4" aria-hidden="true" />{t.shell.signOut}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
