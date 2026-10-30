import { ChangePasswordForm, CompanyForm, DeleteAccountForm } from "@/components/AccountForms";

export function AccountForms({
  userId,
  email,
  locale,
  company,
}: {
  userId: string;
  email: string;
  locale: "de" | "en";
  company: { name: string; role: string } | null;
}) {
  const de = locale === "de";
  const card = "rounded-lg border border-border bg-surface p-6";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{de ? "Mein Konto" : "My account"}</h1>
        <p className="mt-1 text-sm text-muted" data-testid="account-email">
          {email}
        </p>
      </div>

      <section className={card}>
        <h2 className="text-lg font-medium">{de ? "Unternehmen" : "Company"}</h2>
        {company ? (
          <p className="mt-2 text-sm text-muted" data-testid="account-company">
            {de ? "Du gehörst zu" : "You belong to"} <strong>{company.name}</strong>.
          </p>
        ) : (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted">
              {de
                ? "Du nutzt die Plattform als Privatperson. Wenn du für ein Unternehmen Lernpfade verwalten willst, lege es hier fest: Wir schicken einen Bestätigungslink an deine Firmen-E-Mail-Adresse."
                : "You use the platform as a private person. To manage learning for a company, set it up here: we send a confirmation link to your company email address."}
            </p>
            <CompanyForm locale={locale} />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">{de ? "Passwort ändern" : "Change password"}</h2>
        <div className="mt-3">
          <ChangePasswordForm userId={userId} locale={locale} />
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">{de ? "Meine Daten exportieren" : "Export my data"}</h2>
        <p className="mt-2 text-sm text-muted">
          {de
            ? "Lädt alle deine gespeicherten Daten als JSON-Datei herunter: Konto, Mitgliedschaft, Lernfortschritt, Versuche, Lernsitzungen und deine Aktivitäten. Das Passwort ist nicht enthalten."
            : "Downloads all your stored data as a JSON file: account, membership, learning progress, attempts, study sessions and your activity. Your password is not included."}
        </p>
        <a
          href="/api/account/export"
          download
          data-testid="export-link"
          className="mt-3 inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background"
        >
          {de ? "Daten herunterladen" : "Download data"}
        </a>
      </section>

      <section className={`${card} border-danger/40`}>
        <h2 className="text-lg font-medium text-danger-text">{de ? "Konto löschen" : "Delete account"}</h2>
        <div className="mt-3">
          <DeleteAccountForm userId={userId} locale={locale} />
        </div>
      </section>
    </div>
  );
}
