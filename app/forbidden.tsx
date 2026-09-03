import Link from "next/link";
import { getServerLocale } from "@/lib/server/locale";

/** Rendered by next/navigation's forbidden() (R0.2) - a real 403, not a hidden button. */
export default async function Forbidden() {
  const locale = await getServerLocale();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold">403</p>
      <p className="text-foreground/70">
        {locale === "de"
          ? "Dieser Bereich ist nur für Administratoren zugänglich."
          : "This area is restricted to administrators."}
      </p>
      <Link href="/" className="mt-4 text-accent hover:underline">
        {locale === "de" ? "Zur Startseite" : "Back to home"}
      </Link>
    </div>
  );
}
