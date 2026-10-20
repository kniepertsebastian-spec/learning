export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AutoSkillsToggle } from "@/components/AutoSkillsToggle";
import { ExamRemindersToggle } from "@/components/ExamRemindersToggle";
import { getDb } from "@/lib/server/db/client";
import { userProfiles, users } from "@/lib/server/db/schema";
import { AccountForms } from "./account-forms-section";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCompanyMembership } from "@/lib/server/company/access";
import { getServerLocale } from "@/lib/server/locale";

/** Konto (Self-Service): Passwort ändern, Daten exportieren, Konto löschen. */
export default async function AccountPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Faccount");
  const membership = await getCompanyMembership(user.id);
  const [prefs] = await getDb().select({ optOut: users.examRemindersOptOut }).from(users).where(eq(users.id, user.id)).limit(1);
  const [profile] = await getDb().select({ autoSkills: userProfiles.autoSkills }).from(userProfiles).where(eq(userProfiles.userId, user.id)).limit(1);
  return (
    <div className="flex flex-col gap-6">
      <AccountForms
        userId={user.id}
        email={user.email}
        locale={locale}
        company={membership ? { name: membership.organizationName, role: membership.role } : null}
      />
      <ExamRemindersToggle initialOptOut={prefs?.optOut ?? false} />
      <AutoSkillsToggle initialEnabled={profile?.autoSkills ?? false} />
    </div>
  );
}
