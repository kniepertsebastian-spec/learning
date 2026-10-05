export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AccountForms } from "./account-forms-section";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";

/** Konto (Self-Service): Passwort ändern, Daten exportieren, Konto löschen. */
export default async function AccountPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Faccount");
  return <AccountForms userId={user.id} email={user.email} locale={locale} />;
}
