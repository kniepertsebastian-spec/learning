import { NextResponse } from "next/server";
import { signIn } from "@/lib/server/auth";
import { completeSso, SSO_COOKIE, SsoError } from "@/lib/server/sso/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const back = (request: Request, message: string) => {
  const url = new URL("/sso", request.url);
  url.searchParams.set("error", message);
  const response = NextResponse.redirect(url);
  response.cookies.delete({ name: SSO_COOKIE, path: "/api/sso" });
  return response;
};

/** Rückkehr vom IdP: prüft die Anmeldung und macht daraus die Sitzung (über ein einmaliges Ticket). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) return back(request, "Die Anmeldung beim Firmenkonto wurde abgebrochen oder abgelehnt.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back(request, "Ungültige Rückkehr vom Anmeldedienst.");
  const cookie = request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${SSO_COOKIE}=`))?.slice(SSO_COOKIE.length + 1);

  let ticket: string;
  try {
    ({ ticket } = await completeSso({ code, state, cookie: cookie ? decodeURIComponent(cookie) : undefined }));
  } catch (error) {
    if (error instanceof SsoError) return back(request, error.message);
    throw error;
  }
  // Wirft eine Weiterleitung (Next.js) auf die Startseite; das Ticket ist danach verbraucht.
  await signIn("sso", { ticket, redirectTo: "/" });
  return NextResponse.redirect(new URL("/", request.url));
}
