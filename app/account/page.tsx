export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { AccountForms } from "./account-forms-section";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCompanyMembership } from "@/lib/server/company/access";
import { getServerLocale } from "@/lib/server/locale";

/** Konto (Self-Service): Passwort ändern, Daten exportieren, Konto löschen. */
export default async function AccountPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Faccount");
  const membership = await getCompanyMembership(user.id);
  return (
    <AccountForms
      userId={user.id}
      email={user.email}
      locale={locale}
      company={membership ? { name: membership.organizationName, role: membership.role } : null}
    />
  );
}
