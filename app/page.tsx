"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { AddCertModal } from "@/components/AddCertModal";
import { CertificateCard } from "@/components/CertificateCard";
import { useLocale } from "@/lib/i18n";
import { useCertificates } from "@/lib/hooks/queries";

export default function DashboardPage() {
  const { t } = useLocale();
  const certificates = useCertificates();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.dashboard.heading}</h1>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {t.dashboard.addCertificate}
        </button>
      </div>

      {certificates === undefined ? null : certificates.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <GraduationCap className="mb-4 h-12 w-12 text-foreground/40" aria-hidden="true" />
          <h2 className="mb-2 text-lg font-medium">{t.dashboard.emptyTitle}</h2>
          <p className="max-w-sm text-sm text-foreground/70">{t.dashboard.emptyBody}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((certificate) => (
            <CertificateCard key={certificate.id} certificate={certificate} />
          ))}
        </div>
      )}

      {isModalOpen && <AddCertModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}
