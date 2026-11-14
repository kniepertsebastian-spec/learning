"use client";

import { useEffect, useState } from "react";
import { ResponseTimer } from "./response-timer";

/**
 * Eine Antwortzeit-Stoppuhr für eine Seite (Aufgabe 06a). Hört auf `visibilitychange`: ist die Seite im Hintergrund, steht die
 * Uhr. `show(frage)` beim Anzeigen jeder Frage aufrufen, `answer()` im Moment der Antwort (vor einer Sicherheitsabfrage).
 * Das Objekt bleibt über Renderings hinweg dasselbe.
 */
export function useResponseTimer(): ResponseTimer {
  const [timer] = useState(() => new ResponseTimer(() => performance.now(), typeof document !== "undefined" && document.visibilityState === "hidden"));
  useEffect(() => {
    const onChange = () => timer.setHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [timer]);
  return timer;
}
