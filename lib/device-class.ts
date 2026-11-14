import type { DeviceClass } from "@/lib/server/db/schema";

/**
 * Grobe Größenklasse des Bildschirms (Aufgabe 16, Faktor 4.12): schmal ist ein Smartphone im Hochformat, alles andere ist breit.
 * Mehr wird nicht gespeichert: keine Gerätekennung, kein Modell, keine genaue Breite. Die Grenze entspricht dem Breakpoint `sm`.
 */
export const NARROW_MAX_WIDTH_PX = 639;

export type { DeviceClass };

/** Macht aus unbekannter Eingabe (API, Sync-Warteschlange) eine gültige Klasse oder null. */
export function parseDeviceClass(raw: unknown): DeviceClass | null {
  return raw === "narrow" || raw === "wide" ? raw : null;
}
