import { c_forbidden } from "@/lib/i18n/components/forbidden";
import Link from "next/link";
import { getServerLocale } from "@/lib/server/locale";

/** Rendered by next/navigation's forbidden() (R0.2, Admin- und Firmenbereich) - a real 403, not a hidden button. */
export default async function Forbidden() {
  const locale = await getServerLocale();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold">403</p>
      <p className="text-muted">
        {c_forbidden(locale).youDonTHaveAccess}
      </p>
      <Link href="/" className="mt-4 text-link hover:underline">
        {c_forbidden(locale).backToHome}
      </Link>
    </div>
  );
}
