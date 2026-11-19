import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { c_notFound } from "@/lib/i18n/components/not-found";
import { getServerLocale } from "@/lib/server/locale";

/** 404 im App-Design (R9): für unbekannte Adressen und für notFound() in allen Bereichen ohne eigene Seite. */
export default async function NotFound() {
  const t = c_notFound(await getServerLocale());
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 py-16 text-center" data-testid="not-found-page">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-subtle">
        <SearchX className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-subtle">404</p>
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="text-sm text-subtle">{t.body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">{t.home}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/catalog">{t.catalog}</Link>
        </Button>
      </div>
    </div>
  );
}
