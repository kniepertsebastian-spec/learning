"use client";

import * as React from "react";
import { FLUSH_AT_SECONDS, MAX_BATCH_SECONDS, tick, TICK_SECONDS, type TimerState } from "@/lib/client/learning-time";
import { sendLessonTime } from "@/lib/client/lesson-reading-time";

/**
 * Unsichtbar in der Lektion (Aufgabe 16, Faktor 4.9): zählt die aktive Lesezeit, solange der Lektionstext angezeigt ist, und meldet
 * das Öffnen. Mit `active={false}` (z. B. beim Lektionstest) steht die Uhr. Ob etwas gespeichert wird, entscheidet der Server
 * (Flag `reading_time`).
 */
export function LessonReadingTracker({ sectionId, active = true }: { sectionId: string; active?: boolean }) {
  React.useEffect(() => {
    if (!active) return;
    let state: TimerState = { pending: 0, lastInput: Date.now() };
    sendLessonTime(sectionId, 0, true);
    const flush = () => {
      if (state.pending <= 0) return;
      if (sendLessonTime(sectionId, state.pending)) state = { ...state, pending: Math.max(0, state.pending - MAX_BATCH_SECONDS) };
    };
    const onInput = () => {
      state = { ...state, lastInput: Date.now() };
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else onInput();
    };
    const timer = window.setInterval(() => {
      state = tick(state, Date.now(), document.visibilityState === "visible");
      if (state.pending >= FLUSH_AT_SECONDS) flush();
    }, TICK_SECONDS * 1000);
    const events = ["keydown", "pointerdown", "pointermove", "scroll", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", flush);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", flush);
      flush();
    };
  }, [sectionId, active]);
  return null;
}
