import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/admin" }));

import { LocaleProvider } from "@/lib/i18n";
import type { CatalogCert } from "@/components/admin/AdminCatalog";
import { TranslationProgress } from "@/components/admin/TranslationProgress";

const cert = (processed: number, total: number): CatalogCert => ({
  id: "c1",
  slug: "k8s",
  name: "Kubernetes",
  provider: "CNCF",
  examVersion: "v1",
  courseType: "certification",
  categoryId: null,
  categoryIds: [],
  shortCode: null,
  translation: { contentLocale: "de", status: "running", message: null, processed, total },
  stats: { domains: 1, lessons: 4, questions: 10 },
});

const render = (c: CatalogCert) => renderToStaticMarkup(<LocaleProvider><TranslationProgress cert={c} /></LocaleProvider>);

describe("Übersetzungsfortschritt in der Admin-Kursübersicht", () => {
  it("zeigt Teile, Prozent und einen Balken mit dem Wert", () => {
    const html = render(cert(6, 24));
    expect(html).toContain("6 von 24 Teilen bearbeitet");
    expect(html).toContain("25 %");
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain("width:25%");
  });

  it("vor dem Zählen: Hinweis statt Prozent, leerer Balken", () => {
    const html = render(cert(0, 0));
    expect(html).toContain("Übersetzung wird vorbereitet");
    expect(html).not.toContain(" %");
    expect(html).toContain('aria-valuenow="0"');
  });
});
