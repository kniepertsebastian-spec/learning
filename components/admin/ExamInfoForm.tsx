"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const field = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";

export interface ExamInfo {
  examProvider: "pearson_vue" | "psi" | "linux_foundation" | "other" | null;
  deliveryModes: Array<"online" | "test_center">;
  bookingUrl: string | null;
  testCenterUrl: string | null;
  validityMonths: number | null;
  successorNote: string | null;
}

/** Prüfungsdaten eines Kurses für den Prüfungsplaner der Lernenden (Anbieter, Buchungslink, Gültigkeit, Nachfolgeversion). */
export function ExamInfoForm({ certId, initial, locale }: { certId: string; initial: ExamInfo; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [v, setV] = useState({ ...initial, bookingUrl: initial.bookingUrl ?? "", testCenterUrl: initial.testCenterUrl ?? "", successorNote: initial.successorNote ?? "", validityMonths: initial.validityMonths?.toString() ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (m: "online" | "test_center") => setV((s) => ({ ...s, deliveryModes: s.deliveryModes.includes(m) ? s.deliveryModes.filter((x) => x !== m) : [...s.deliveryModes, m] }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/admin/certifications/${certId}/exam-info`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examProvider: v.examProvider || null, deliveryModes: v.deliveryModes, bookingUrl: v.bookingUrl || null, testCenterUrl: v.testCenterUrl || null, validityMonths: v.validityMonths ? Number(v.validityMonths) : null, successorNote: v.successorNote || null }),
    });
    setMsg(res.ok ? (de ? "Gespeichert." : "Saved.") : de ? "Ungültige Angaben (Links müssen mit https:// beginnen)." : "Invalid input (links must start with https://).");
    if (res.ok) router.refresh();
  }

  return (
    <Card data-testid="exam-info-form">
      <h2 className="text-lg font-semibold">{de ? "Prüfungsdaten (Prüfungsplaner)" : "Exam details (exam planner)"}</h2>
      <p className="mt-1 text-sm text-subtle">{de ? "Erscheinen im Prüfungsplaner der Lernenden: Buchungslink, Testcenter, Gültigkeit, Hinweis auf eine Nachfolgeversion." : "Shown in learners' exam planner: booking link, test center, validity, successor version note."}</p>
      <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block font-medium">{de ? "Prüfungsanbieter" : "Exam provider"}</span>
          <select value={v.examProvider ?? ""} onChange={(e) => setV({ ...v, examProvider: (e.target.value || null) as ExamInfo["examProvider"] })} className={field} data-testid="exam-provider">
            <option value="">–</option><option value="pearson_vue">Pearson VUE</option><option value="psi">PSI</option><option value="linux_foundation">Linux Foundation</option><option value="other">{de ? "Anderer" : "Other"}</option>
          </select>
        </label>
        <fieldset className="text-sm"><legend className="mb-1 font-medium">{de ? "Prüfungsformen" : "Delivery"}</legend>
          <label className="mr-4 inline-flex items-center gap-2"><input type="checkbox" checked={v.deliveryModes.includes("online")} onChange={() => toggle("online")} />{de ? "Online" : "Online"}</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={v.deliveryModes.includes("test_center")} onChange={() => toggle("test_center")} />{de ? "Testcenter" : "Test center"}</label>
        </fieldset>
        <label className="block text-sm"><span className="mb-1 block font-medium">{de ? "Buchungslink" : "Booking link"}</span><input value={v.bookingUrl} onChange={(e) => setV({ ...v, bookingUrl: e.target.value })} placeholder="https://" className={field} data-testid="exam-booking-url" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">{de ? "Testcenter-Link" : "Test center link"}</span><input value={v.testCenterUrl} onChange={(e) => setV({ ...v, testCenterUrl: e.target.value })} placeholder="https://" className={field} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">{de ? "Gültigkeit (Monate, leer = unbegrenzt)" : "Validity (months, empty = unlimited)"}</span><input type="number" min={1} max={240} value={v.validityMonths} onChange={(e) => setV({ ...v, validityMonths: e.target.value })} className={field} /></label>
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium">{de ? "Hinweis auf Nachfolgeversion (optional)" : "Successor version note (optional)"}</span><input value={v.successorNote} onChange={(e) => setV({ ...v, successorNote: e.target.value })} maxLength={500} className={field} /></label>
        <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" data-testid="exam-info-save">{de ? "Speichern" : "Save"}</Button>{msg && <span role="status" className="text-sm text-subtle">{msg}</span>}</div>
      </form>
    </Card>
  );
}
