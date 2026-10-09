export const dynamic = "force-dynamic";

import { requireAdminPage } from "@/lib/server/auth-guards";
import { UiGallery } from "@/components/ui-gallery/UiGallery";

/** Sichtprüfung aller UI-Bausteine in hell und dunkel, je Kontext (nur für Admins). */
export default async function AdminUiPage() {
  await requireAdminPage("/admin/ui");
  return <UiGallery />;
}
