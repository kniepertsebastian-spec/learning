import { NARROW_MAX_WIDTH_PX, type DeviceClass } from "@/lib/device-class";

/** Die aktuelle Größenklasse des Fensters (nur schmal oder breit, siehe lib/device-class.ts). Ohne Browser: undefined. */
export function currentDeviceClass(): DeviceClass | undefined {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH_PX}px)`).matches ? "narrow" : "wide";
}
