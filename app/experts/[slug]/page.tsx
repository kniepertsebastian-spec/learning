export const dynamic = "force-dynamic";

import { c_expertsSlugPage } from "@/lib/i18n/components/expertsSlugPage";
import { fill } from "@/lib/i18n/fill";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpertProfileView } from "@/components/experts/ExpertProfileView";
import { getServerLocale } from "@/lib/server/locale";
import { getPublicProfile } from "@/lib/server/reviewers/profile-service";

type Props = { params: Promise<{ slug: string }> };

/** Titel und Beschreibung nur für veröffentlichte Profile; Suchmaschinen dürfen das Profil nur bei ausdrücklicher Einwilligung indexieren. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicProfile(slug);
  if (!data) return { title: "Profil nicht gefunden", robots: { index: false, follow: false } };
  const locale = await getServerLocale();
  const { profile } = data;
  const description = (profile.bio?.[locale] || profile.bio?.de || profile.bio?.en || "").slice(0, 160) || (fill(c_expertsSlugPage(locale).expertReviewer0, profile.country));
  return {
    title: `${profile.name} · ${c_expertsSlugPage(locale).expertReviewer}`,
    description,
    robots: profile.indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/** Öffentliches Expertenprofil, ohne Anmeldung erreichbar. Nicht veröffentlichte oder zurückgezogene Profile gibt es hier nicht (404). */
export default async function ExpertPage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicProfile(slug);
  if (!data) notFound();
  const locale = await getServerLocale();
  return (
    <div className="py-6">
      <ExpertProfileView profile={data.profile} courses={data.courses} locale={locale} />
    </div>
  );
}
