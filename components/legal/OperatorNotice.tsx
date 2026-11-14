import { c_legalPages } from "@/lib/i18n/components/legalPages";
import type { OperatorInfo } from "@/lib/legal/operator";

/** Der Betreiber mit Anschrift und Kontakt, wie ihn Impressum und Datenschutzerklärung nennen. Fehlt eine Pflichtangabe, steht ein Hinweis statt einer erfundenen Angabe. */
export function OperatorNotice({ operator, de }: { operator: OperatorInfo; de: boolean }) {
  const t = c_legalPages(de);
  return (
    <div data-testid="operator-notice">
      {!operator.complete && (
        <p role="note" className="mb-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="operator-missing">
          {t.operatorMissing}
        </p>
      )}
      <address className="text-sm leading-relaxed not-italic text-text-2">
        {operator.name && <div className="font-medium text-foreground">{operator.name}</div>}
        {operator.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {operator.representative && (
          <div className="mt-2">
            {t.representedBy}
            {operator.representative}
          </div>
        )}
        {operator.email && (
          <div className="mt-2">
            {t.email}
            <a href={`mailto:${operator.email}`} className="text-link hover:underline">
              {operator.email}
            </a>
          </div>
        )}
        {operator.phone && (
          <div>
            {t.phone}
            {operator.phone}
          </div>
        )}
        {operator.register && (
          <div className="mt-2">
            {t.register}
            {operator.register}
          </div>
        )}
        {operator.vatId && (
          <div>
            {t.vatId}
            {operator.vatId}
          </div>
        )}
      </address>
    </div>
  );
}
