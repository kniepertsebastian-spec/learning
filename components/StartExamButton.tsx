"use client";

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
      setError(locale === "de" ? "Fehler beim Starten der Prüfung." : "Failed to start exam.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleStart}
        disabled={loading}
        className="flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading
          ? locale === "de"
            ? "Prüfung wird erstellt..."
            : "Creating exam..."
          : locale === "de"
            ? "Prüfung starten"
            : "Start exam"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
