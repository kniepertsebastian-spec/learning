import Link from "next/link";
import { c_accountAccountFormsSection } from "@/lib/i18n/components/accountAccountFormsSection";
import { ChangePasswordForm, CompanyForm, DeleteAccountForm } from "@/components/AccountForms";

export function AccountForms({
  userId,
  email,
  locale,
  company,
  confirmWith = "password",
}: {
  userId: string;
  email: string;
  locale: "de" | "en";
  company: { name: string; role: string } | null;
  /** Aufgabe 09: SSO-Konten ohne lokales Passwort bestätigen mit der E-Mail-Adresse und sehen kein Passwortformular. */
  confirmWith?: "password" | "email";
}) {
  const de = locale === "de";
  const card = "rounded-lg border border-border bg-surface p-6";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{c_accountAccountFormsSection(de).myAccount}</h1>
        <p className="mt-1 text-sm text-muted" data-testid="account-email">
          {email}
        </p>
      </div>

      <section className={card}>
        <h2 className="text-lg font-medium">{c_accountAccountFormsSection(de).company}</h2>
        {company ? (
          <p className="mt-2 text-sm text-muted" data-testid="account-company">
            {c_accountAccountFormsSection(de).youBelongTo} <strong>{company.name}</strong>.
          </p>
        ) : (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted">
              {c_accountAccountFormsSection(de).youUseThePlatformAs}
            </p>
            <CompanyForm locale={locale} />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">{c_accountAccountFormsSection(de).changePassword}</h2>
        {confirmWith === "email" ? (
          <p className="mt-2 text-sm text-muted" data-testid="no-local-password">
            {c_accountAccountFormsSection(de).noLocalPassword}{" "}
            <Link href="/forgot-password" className="text-accent underline">
              {c_accountAccountFormsSection(de).forgotPassword}
            </Link>
            .
          </p>
        ) : (
          <div className="mt-3">
            <ChangePasswordForm userId={userId} locale={locale} />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-medium">{c_accountAccountFormsSection(de).exportMyData}</h2>
        <p className="mt-2 text-sm text-muted">
          {c_accountAccountFormsSection(de).downloadsAllYourStoredData}
        </p>
        <a
          href="/api/account/export"
          download
          data-testid="export-link"
          className="mt-3 inline-block rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-background"
        >
          {c_accountAccountFormsSection(de).downloadData}
        </a>
      </section>

      <section className={`${card} border-danger/40`}>
        <h2 className="text-lg font-medium text-danger-text">{c_accountAccountFormsSection(de).deleteAccount}</h2>
        <div className="mt-3">
          <DeleteAccountForm userId={userId} locale={locale} confirmWith={confirmWith} />
        </div>
      </section>
    </div>
  );
}
