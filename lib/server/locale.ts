import { cookies, headers } from "next/headers";
import type { Locale } from "@/lib/types";

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const stored = cookieStore.get("certstudy-locale")?.value;
  if (stored === "de" || stored === "en") return stored;
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("Accept-Language") ?? "";
  return acceptLanguage.toLowerCase().includes("de") ? "de" : "en";
}
