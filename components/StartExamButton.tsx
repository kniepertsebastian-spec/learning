"use client";

import { c_startExamButton } from "@/lib/i18n/components/startExamButton";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Locale } from "@/lib/types";

interface StartExamButtonProps {
  certId: string;
  certSlug: string;
  locale: Locale;
}

export function StartExamButton({ certId, certSlug, locale }: StartExamButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/exams/${certId}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to start exam");
        setLoading(false);
        return;
      }
      router.push(`/cert/${certSlug}/final-exam/${data.examId}`);
    } catch {
      setError(c_startExamButton(locale).failedToStartExam);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleStart}
        disabled={loading}
        className="flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading
          ? c_startExamButton(locale).creatingExam
          : c_startExamButton(locale).startExam}
      </button>
      {error && <p className="text-sm text-danger-text">{error}</p>}
    </div>
  );
}
