import { VerifyEmailButton } from "@/components/AuthRecovery";

export default async function VerifyEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <VerifyEmailButton token={token} />;
}
