"use client";

import { useEffect, useRef } from "react";
import { quizKeyAction, type KeyLike, type QuizKeyAction } from "@/lib/quiz/keys";

const INTERACTIVE_ENTER_SELECTOR = "button, a, summary, [role=button], [role=radio], [role=tab], [role=checkbox]";

/** Registriert die Quiz-Kürzel auf der Seite. Esc ignorieren wir, solange ein Dialog offen ist (Radix schließt ihn selbst). */
export function useQuizHotkeys(optionCount: number, handler: (action: QuizKeyAction) => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const action = quizKeyAction(e as unknown as KeyLike, optionCount);
      if (!action) return;
      if (action.type === "escape" && document.querySelector('[role="dialog"]')) return;
      if (action.type === "enter" && (e.target as HTMLElement | null)?.closest?.(INTERACTIVE_ENTER_SELECTOR)) return;
      e.preventDefault();
      ref.current(action);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [optionCount, enabled]);
}
