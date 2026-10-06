import { ConfirmCompanyButton } from "@/components/AuthRecovery";

export default async function ConfirmCompanyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ConfirmCompanyButton token={token} />;
}
