"use client";

import { useEffect, useState } from "react";
import { InterruptionCounter } from "./interruption-counter";

/** Unterbrechungen der laufenden Sitzung (Aufgabe 12): hört auf `visibilitychange`. Das Objekt bleibt über Renderings hinweg dasselbe. */
export function useInterruptionCounter(): InterruptionCounter {
  const [counter] = useState(() => new InterruptionCounter(() => performance.now(), typeof document !== "undefined" && document.visibilityState === "hidden"));
  useEffect(() => {
    const onChange = () => counter.setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [counter]);
  return counter;
}
