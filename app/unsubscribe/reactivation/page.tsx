export const dynamic = "force-dynamic";

import { c_unsubscribeReactivationPage } from "@/lib/i18n/components/unsubscribeReactivationPage";
import { getServerLocale } from "@/lib/server/locale";
import { verifyUnsubscribeToken } from "@/lib/server/reactivation/token";
import { UnsubscribeReactivation } from "@/components/UnsubscribeReactivation";

/** Abmeldeseite aus der Reaktivierungs-Mail: ohne Anmeldung, erst ein Klick meldet ab (Mail-Scanner rufen den Link nur ab). */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = "", t = "" } = await searchParams;
  const locale = await getServerLocale();
  const valid = Boolean(u) && verifyUnsubscribeToken(u, t);
  const de = locale === "de";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-10" data-testid="unsubscribe-page">
      <h1 className="text-2xl font-semibold">{c_unsubscribeReactivationPage(de).noMoreReminders}</h1>
      {valid ? (
        <UnsubscribeReactivation userId={u} token={t} locale={locale} />
      ) : (
        <p className="text-sm text-subtle">{c_unsubscribeReactivationPage(de).thisLinkIsNotValid}</p>
      )}
    </div>
  );
}
