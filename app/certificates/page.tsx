export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { MyCertificates } from "@/components/certificates/MyCertificates";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { listMyVouchers, listOwnCertificates } from "@/lib/server/certificates/person";
import { visibleCertificationsCondition } from "@/lib/server/catalog/visibility";
import { getCompanyMembership } from "@/lib/server/company/access";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";

/** Eigene Zertifikate und zugewiesene Prüfungsgutscheine. Die Firma sieht nur, was die Person einzeln freigibt. */
export default async function CertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=%2Fcertificates");
  const viewer = { id: user.id, role: user.role };
  const [certs, vouchers, membership, catalog] = await Promise.all([
    listOwnCertificates(user.id),
    listMyVouchers(user.id),
    getCompanyMembership(user.id),
    getDb().select({ id: certifications.id, name: certifications.name, provider: certifications.provider, validityMonths: certifications.validityMonths }).from(certifications).where(await visibleCertificationsCondition(viewer)).orderBy(asc(certifications.name)),
  ]);
  return (
    <MyCertificates
      certs={certs.map((c) => ({ id: c.id, title: c.title, vendor: c.vendor, earnedAt: c.earnedAt.toISOString(), expiresAt: c.expiresAt?.toISOString() ?? null, evidenceUrl: c.evidenceUrl, shared: c.sharedWithCompany }))}
      vouchers={vouchers.map((v) => ({ id: v.id, certName: v.certName, orgName: v.orgName, expiresAt: v.expiresAt.toISOString(), redeemed: Boolean(v.redeemedAt), hasCode: Boolean(v.hasCode), note: v.note }))}
      catalog={catalog}
      companyName={membership?.organizationName ?? null}
    />
  );
}
