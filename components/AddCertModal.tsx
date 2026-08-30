"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { createCertificateWithCurriculum } from "@/lib/hooks/mutations";
import { curriculumResponseSchema } from "@/lib/ai/schemas";

interface AddCertModalProps {
  onClose: () => void;
}

export function AddCertModal({ onClose }: AddCertModalProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [certName, setCertName] = useState("");
  const [totalDays, setTotalDays] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNeedsAuth(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/generate/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certName, totalDays }),
      });

      if (response.status === 401) {
        setError(t.generation.signInRequired);
        setNeedsAuth(true);
        setIsLoading(false);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? t.addCertModal.error);
      }

      const data = curriculumResponseSchema.parse(await response.json());
      const certId = await createCertificateWithCurriculum(
        { title: certName, totalDays },
        data.modules,
      );

      router.push(`/cert/${certId}`);
    } catch {
      setError(t.addCertModal.error);
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
            <p className="font-medium">{t.addCertModal.loading}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t.addCertModal.title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 hover:bg-background"
                aria-label={t.common.close}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4">
              <label htmlFor="certName" className="mb-1 block text-sm font-medium">
                {t.addCertModal.certNameLabel}
              </label>
              <input
                id="certName"
                type="text"
                required
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                placeholder={t.addCertModal.certNamePlaceholder}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="totalDays" className="mb-1 block text-sm font-medium">
                {t.addCertModal.totalDaysLabel}
              </label>
              <input
                id="totalDays"
                type="number"
                required
                min={1}
                max={180}
                value={totalDays}
                onChange={(e) => setTotalDays(Number(e.target.value))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>

            {error && (
              <div className="mb-4">
                <p className="text-sm text-red-500">{error}</p>
                {needsAuth && (
                  <Link href="/login" className="text-sm text-accent hover:underline">
                    {t.generation.signInLink}
                  </Link>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-sm font-medium hover:bg-background"
              >
                {t.addCertModal.cancel}
              </button>
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {t.addCertModal.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
