"use client";

import Link from "next/link";
import { c_legalLinks } from "@/lib/i18n/components/legalLinks";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** Links zu Datenschutz, Impressum und AGB: im Fuß jeder Seite und auf Login und Registrierung (Aufgabe 07a). */
export function LegalLinks({ className }: { className?: string }) {
  const { locale } = useLocale();
  const t = c_legalLinks(locale);
  return (
    <nav aria-label={t.nav} className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-subtle", className)} data-testid="legal-links">
      <Link href="/datenschutz" className="hover:text-foreground hover:underline" data-testid="legal-link-privacy">{t.privacy}</Link>
      <Link href="/impressum" className="hover:text-foreground hover:underline" data-testid="legal-link-imprint">{t.imprint}</Link>
      <Link href="/agb" className="hover:text-foreground hover:underline" data-testid="legal-link-terms">{t.terms}</Link>
    </nav>
  );
}
