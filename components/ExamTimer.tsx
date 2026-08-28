"use client";

import { useEffect, useRef } from "react";
import { Timer } from "lucide-react";
import { useLocale } from "@/lib/i18n";

interface ExamTimerProps {
  secondsLeft: number;
  onTick: (secondsLeft: number) => void;
  onExpire: () => void;
}

export function ExamTimer({ secondsLeft, onTick, onExpire }: ExamTimerProps) {
  const { t } = useLocale();
  const onTickRef = useRef(onTick);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onTickRef.current = onTick;
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      onTickRef.current(secondsLeft - 1);
      if (secondsLeft - 1 <= 0) onExpireRef.current();
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const minutes = Math.max(0, Math.floor(secondsLeft / 60));
  const seconds = Math.max(0, secondsLeft % 60);
  const isLow = secondsLeft <= 300;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium tabular-nums ${
        isLow ? "text-red-500" : ""
      }`}
    >
      <Timer className="h-4 w-4" aria-hidden="true" />
      <span title={t.exam.timeLeft}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
