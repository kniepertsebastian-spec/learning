import { describe, expect, it, vi } from "vitest";

vi.mock("./uploads", async () => {
  const refs = await import("@/lib/course-generation/source-refs");
  return {
    isUploadRef: refs.isUploadRef,
    loadCourseGenerationUpload: vi.fn(async (ref: string) =>
      ref.endsWith("11111111-1111-4111-8111-111111111111")
        ? { filename: "CEH-Handbuch.pdf", excerpts: [{ locator: "S. 1", text: "Inhalt ".repeat(60) }] }
        : null,
    ),
  };
});

import { isValidSourceRef } from "@/lib/course-generation/source-refs";
import { fetchSource, SourceFetchError } from "./sources";

describe("hochgeladene Dateien als Quelle", () => {
  it("liest eine hochgeladene Datei wie eine Adresse, mit Dateiname als Titel", async () => {
    const out = await fetchSource("src-1", "upload:11111111-1111-4111-8111-111111111111");
    expect(out.title).toBe("CEH-Handbuch.pdf");
    expect(out.excerpts[0].locator).toBe("S. 1");
  });

  it("meldet eine nicht mehr vorhandene Datei als Quellenfehler", async () => {
    await expect(fetchSource("src-1", "upload:22222222-2222-4222-8222-222222222222")).rejects.toBeInstanceOf(SourceFetchError);
  });

  it("akzeptiert Links und Upload-Verweise in derselben Liste, sonst nichts", () => {
    expect(isValidSourceRef("https://cert.eccouncil.org/x.pdf")).toBe(true);
    expect(isValidSourceRef("upload:11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isValidSourceRef("upload:../etc")).toBe(false);
    expect(isValidSourceRef("ftp://example.org")).toBe(false);
  });
});
