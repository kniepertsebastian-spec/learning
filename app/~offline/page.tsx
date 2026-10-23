import { OfflineFallback } from "@/components/OfflineFallback";

/**
 * Fallback für Seiten, die offline weder im Cache liegen noch erreichbar sind (roadmap_pwa Phase 2). Rein statisch:
 * kein Datenbank- oder Sitzungszugriff, das Layout zeigt hier keinen Nutzer (lib/pwa/offline-routes.ts).
 */
export default function OfflineFallbackPage() {
  return <OfflineFallback />;
}
