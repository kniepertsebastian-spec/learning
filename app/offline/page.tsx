import { OfflineHome } from "@/components/OfflineHome";

/**
 * „Meine Offline-Kurse“: rein clientseitig aus IndexedDB, ohne Sitzung und Datenbank (roadmap_pwa Phase 2). Vorab im
 * Precache, damit der Einstieg auch funktioniert, wenn vorher keine andere Seite besucht wurde.
 */
export default function OfflinePage() {
  return <OfflineHome />;
}
