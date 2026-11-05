export const dynamic = "force-dynamic";

import { CertificateRegister } from "@/components/certificates/CertificateRegister";
import { ASSIGN_ROLES, STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { listAssignableLearningPaths, listAssignableMembers } from "@/lib/server/company/assignments";
import { getRegisterOverview, getTeamSkillCoverage } from "@/lib/server/company/certificates";
import { TeamSkillCoverage } from "@/components/company/TeamSkillCoverage";
import { getServerLocale } from "@/lib/server/locale";
import { requireCompanyPage } from "@/lib/server/company/guard";

/** Zertifikats-Register der Firma: nur, was die Personen einzeln freigegeben haben (Datenschutztest: certificates-privacy.test.ts). */
export default async function CompanyCertificatesPage() {
  const membership = await requireCompanyPage(STATUS_VIEW_ROLES, "/company/certificates");
  const canEdit = ASSIGN_ROLES.includes(membership.role);
  const [overview, members, paths, coverage, locale] = await Promise.all([getRegisterOverview(membership.organizationId), canEdit ? listAssignableMembers(membership.organizationId) : [], canEdit ? listAssignableLearningPaths(membership.organizationId) : [], getTeamSkillCoverage(membership.organizationId), getServerLocale()]);
  const name = (m: { name: string | null; memberName?: string | null; email?: string; memberEmail?: string }) => m.name ?? m.memberName ?? m.email ?? m.memberEmail ?? "";
  return (
    <div className="flex flex-col gap-8">
    <CertificateRegister
      certs={overview.certificates.map((c) => ({ id: c.id, person: name({ name: c.memberName, memberEmail: c.memberEmail }), email: c.memberEmail, title: c.title, vendor: c.vendor, earnedAt: c.earnedAt.toISOString(), expiresAt: c.expiresAt?.toISOString() ?? null, status: c.status }))}
      vouchers={overview.vouchers.map((v) => ({ ...v, expiresAt: v.expiresAt.toISOString(), redeemedAt: v.redeemedAt?.toISOString() ?? null }))}
      planned={overview.planned.map((p) => ({ id: p.id, person: name({ name: p.memberName, memberEmail: p.memberEmail }), certification: p.certification, scheduledAt: p.scheduledAt.toISOString() }))}
      stats={overview.stats}
      months={overview.months.map((m) => ({ key: m.key, label: m.label.toISOString(), count: m.count, soon: m.soon }))}
      members={members.map((m) => ({ userId: m.userId, label: m.name ? `${m.name} (${m.email})` : m.email }))}
      courses={paths.map((p) => ({ id: p.id, name: p.name }))}
      canEdit={canEdit}
    />
    <TeamSkillCoverage coverage={coverage} locale={locale} />
    </div>
  );
}
