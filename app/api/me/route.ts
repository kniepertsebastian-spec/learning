import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";

/** Beispiel-Route zum Verifizieren, dass Auth.js-Sessions funktionieren. */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  return NextResponse.json({ user: session.user });
}
