import { EmailRequestForm } from "@/components/AuthRecovery";

export default function ForgotPasswordPage() {
  return (
    <EmailRequestForm
      endpoint="/api/recovery/forgot-password"
      title={{ de: "Passwort vergessen", en: "Forgot password" }}
      intro={{
        de: "Gib deine E-Mail-Adresse ein. Wenn es ein Konto dazu gibt, schicken wir dir einen Link zum Zurücksetzen.",
        en: "Enter your email address. If an account exists, we send you a link to reset your password.",
      }}
      submitLabel={{ de: "Link anfordern", en: "Request link" }}
      doneMessage={{
        de: "Wenn es ein Konto zu dieser Adresse gibt, ist eine E-Mail mit dem Link unterwegs. Er gilt 1 Stunde.",
        en: "If an account exists for this address, an email with the link is on its way. It is valid for 1 hour.",
      }}
    />
  );
}
