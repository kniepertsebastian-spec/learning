import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Certificate, MockExam, Module, Quiz } from "@/lib/types";

/** Liefert alle Zertifikate, neueste zuerst. */
export function useCertificates(): Certificate[] | undefined {
  return useLiveQuery(() => db.certificates.orderBy("createdAt").reverse().toArray(), []);
}

export interface CertificateDetail {
  certificate: Certificate | undefined;
  modules: Module[];
  quizzes: Quiz[];
  mockExams: MockExam[];
}

/** Liefert Zertifikat, Module, Quizzes & Probeprüfungen für die Detailansicht. */
export function useCertificateDetail(certId: string | undefined): CertificateDetail | undefined {
  return useLiveQuery(async () => {
    if (!certId) return undefined;

    const [certificate, modules, quizzes, mockExams] = await Promise.all([
      db.certificates.get(certId),
      db.modules.where({ certId }).sortBy("day"),
      db.quizzes.where({ certId }).toArray(),
      db.mockExams.where({ certId }).reverse().sortBy("completedAt"),
    ]);

    return { certificate, modules, quizzes, mockExams };
  }, [certId]);
}
