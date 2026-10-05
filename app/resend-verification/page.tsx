import { EmailRequestForm } from "@/components/AuthRecovery";

export default function ResendVerificationPage() {
  return (
    <EmailRequestForm
      endpoint="/api/recovery/resend-verification"
      title={{ de: "Bestätigungs-E-Mail erneut senden", en: "Resend confirmation email" }}
      intro={{
        de: "Gib die E-Mail-Adresse ein, mit der du dich registriert hast.",
        en: "Enter the email address you registered with.",
      }}
      submitLabel={{ de: "Erneut senden", en: "Resend" }}
      doneMessage={{
        de: "Wenn es ein unbestätigtes Konto zu dieser Adresse gibt, ist eine E-Mail mit dem Link unterwegs.",
        en: "If an unconfirmed account exists for this address, an email with the link is on its way.",
      }}
    />
  );
}
