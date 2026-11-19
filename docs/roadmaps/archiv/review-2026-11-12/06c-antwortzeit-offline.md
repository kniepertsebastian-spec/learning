# Aufgabe 06c: Antwortzeit in den Offline-Paketen

**Herkunft:** Befund 2 (Teil) aus dem Review vom 12.11.2026 · Phase 2
**Voraussetzung:** Aufgabe 06b
**Priorität:** vor dem Pilot

## Aufgaben
- [x] Offline-Leser füllt das Feld genauso wie der Online-Pfad.
- [x] Test: Antwort mit Zeit offline erfasst landet nach dem Sync in `review_log.response_time_ms`.
- [x] Zeit im Hintergrund zählt auch offline nicht.

## Akzeptanzkriterium
Eine offline beantwortete Frage hat nach dem Sync dieselbe Zeit wie eine online beantwortete.

## Umsetzung (14.11.2026)
- **Kein Code nötig:** Der Offline-Leser (`OfflinePackageManager` → `SectionContent` → `SectionQuiz`, und `StudySession` mit `offline`) nutzt dieselben Komponenten wie der Online-Pfad. Die Stoppuhr aus 06a läuft dort also unverändert, die Zeit steht je Antwort als `responseTimeMs` in der Nutzlast der Warteschlange (`lib/client/sync-queue.ts` reicht die Nutzlast unverändert durch). Der Sync-Pfad wertet das Feld seit 06b aus. Zeit im Hintergrund zählt offline genauso wenig: die Stoppuhr hört auf `visibilitychange`, nicht auf das Netz.
- **Test:** `e2e/response-time-offline.spec.ts` (echter Browser, Flugmodus): eine Frage mit 1 s Nachdenken und 5 s im Hintergrund, zwei weitere mit je 1 s. In der Warteschlange stehen drei Zeiten, die erste liegt zwischen 0,9 und 4 s. Nach dem Sync stehen in `review_log.response_time_ms` genau dieselben drei Werte wie in der Warteschlange, also wie bei einer online beantworteten Frage. Die Server-Seite (Grenzen, Sync-Ereignis) deckt `lib/server/review/response-time.db.test.ts` aus 06b ab.
