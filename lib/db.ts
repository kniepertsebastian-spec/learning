import Dexie, { type EntityTable } from "dexie";
import type { Certificate, Module, MockExam, Quiz } from "./types";

export class CertStudyDB extends Dexie {
  certificates!: EntityTable<Certificate, "id">;
  modules!: EntityTable<Module, "id">;
  quizzes!: EntityTable<Quiz, "id">;
  mockExams!: EntityTable<MockExam, "id">;

  constructor() {
    super("certstudy-ai");
    this.version(1).stores({
      certificates: "id, title, targetDate, createdAt, progress",
      modules: "id, certId, day, isCompleted, [certId+day]",
      quizzes: "id, certId, moduleId, completedAt",
      mockExams: "id, certId, completedAt",
    });
  }
}

export const db = new CertStudyDB();

export type { Certificate, Module, MockExam, Quiz } from "./types";
