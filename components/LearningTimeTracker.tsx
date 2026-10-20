"use client";

import * as React from "react";
import { FLUSH_AT_SECONDS, sendLearningTime, tick, TICK_SECONDS, type TimerState } from "@/lib/client/learning-time";

/** Unsichtbar auf allen Kursseiten (app/cert/[id]/layout.tsx): misst aktive Lernzeit, siehe lib/client/learning-time.ts. */
export function LearningTimeTracker({ certificationId }: { certificationId: string }) {
  React.useEffect(() => {
    let state: TimerState = { pending: 0, lastInput: Date.now() };
    const flush = () => {
      sendLearningTime(certificationId, state.pending);
      state = { ...state, pending: 0 };
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
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [certificationId]);
  return null;
}
