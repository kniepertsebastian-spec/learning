import type { OperatorInfo } from "@/lib/legal/operator";

/** Der Betreiber mit Anschrift und Kontakt, wie ihn Impressum und Datenschutzerklärung nennen. Fehlt eine Pflichtangabe, steht ein Hinweis statt einer erfundenen Angabe. */
export function OperatorNotice({ operator, de }: { operator: OperatorInfo; de: boolean }) {
  return (
    <div data-testid="operator-notice">
      {!operator.complete && (
        <p role="note" className="mb-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-text" data-testid="operator-missing">
          {de
            ? "Die Angaben zum Betreiber sind noch nicht hinterlegt (Name, Anschrift und E-Mail-Adresse). Sie werden in der Umgebung des Servers eingetragen (LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS, LEGAL_CONTACT_EMAIL)."
            : "The operator's details are not set yet (name, address and email address). They are entered in the server environment (LEGAL_OPERATOR_NAME, LEGAL_OPERATOR_ADDRESS, LEGAL_CONTACT_EMAIL)."}
        </p>
      )}
      <address className="text-sm leading-relaxed not-italic text-text-2">
        {operator.name && <div className="font-medium text-foreground">{operator.name}</div>}
        {operator.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        {operator.representative && (
          <div className="mt-2">
            {de ? "Vertreten durch: " : "Represented by: "}
            {operator.representative}
          </div>
        )}
        {operator.email && (
          <div className="mt-2">
            {de ? "E-Mail: " : "Email: "}
            <a href={`mailto:${operator.email}`} className="text-link hover:underline">
              {operator.email}
            </a>
          </div>
        )}
        {operator.phone && (
          <div>
            {de ? "Telefon: " : "Phone: "}
            {operator.phone}
          </div>
        )}
        {operator.register && (
          <div className="mt-2">
            {de ? "Registereintrag: " : "Commercial register: "}
            {operator.register}
          </div>
        )}
        {operator.vatId && (
          <div>
            {de ? "Umsatzsteuer-Identifikationsnummer: " : "VAT ID: "}
            {operator.vatId}
          </div>
        )}
      </address>
    </div>
  );
}
