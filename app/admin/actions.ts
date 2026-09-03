"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { CertificationManagementService } from "@/lib/server/admin/certification-management";

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${name}`);
  }
  return value.trim();
}

export async function createCertificationAction(formData: FormData) {
  await requireAdminPage("/admin");

  const name = requiredField(formData, "name");
  const provider = requiredField(formData, "provider");
  const examName = requiredField(formData, "examName");
  const examVersion = requiredField(formData, "examVersion");
  const slug = requiredField(formData, "slug").toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Slug may only contain lowercase letters, numbers and hyphens.");
  }

  const domainLines = requiredField(formData, "domains")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedDomains = domainLines.map((line, index) => {
    const [domainName, rawWeight] = line.split("|").map((part) => part.trim());
    const weight = rawWeight ? Number(rawWeight) : 0;
    if (!domainName || !Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error(`Invalid domain line: ${line}`);
    }
    return { orderNum: index + 1, name: domainName, weightPercent: weight };
  });

  const db = getDb();
  const [existing] = await db
    .select({ slug: certifications.slug })
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!existing) {
    await CertificationManagementService.createCertificationWithDomains({
      slug,
      name,
      provider,
      examName,
      examVersion,
      domains: parsedDomains,
    });
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect(`/admin/certifications/${slug}`);
}
