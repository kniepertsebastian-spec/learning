import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import type { ShellData } from "@/components/shell/Sidebar";
import { availableContexts, type ShellContext } from "@/lib/shell/nav";
import { getUserStudyStreak } from "@/lib/server/study/session-service";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { getCurrentUser } from "@/lib/server/auth-guards";
import {
  getCompanyMembership,
  ASSIGN_ROLES,
  isRoleAllowed,
  STATUS_VIEW_ROLES,
} from "@/lib/server/company/access";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("certstudy-theme");
    var dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProofPath",
  description:
    "KI-gestützte Lern- und Prüfungsvorbereitung für IT-Zertifikate / AI-powered study and exam prep for IT certifications",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ProofPath",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0C10" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const membership = user ? await getCompanyMembership(user.id) : null;
  const hasCompanyAccess = isRoleAllowed(membership, STATUS_VIEW_ROLES);
  // Kontexte ermittelt der Server aus den Rechten; die Seiten prüfen ihre Rechte zusätzlich selbst.
  const contexts: ShellContext[] = availableContexts({ hasCompanyAccess, isAdmin: user?.role === "admin" });
  const shell: ShellData | null = user
    ? {
        contexts,
        companyName: hasCompanyAccess ? (membership?.organizationName ?? null) : null,
        nav: { canAssign: isRoleAllowed(membership, ASSIGN_ROLES), isCompanyAdmin: membership?.role === "company_admin" },
        user: { id: user.id, email: user.email },
      }
    : null;
  const streak = user ? await getUserStudyStreak(user.id).catch(() => 0) : 0;
  // Nonce aus proxy.ts (CSP ohne 'unsafe-inline' für Skripte).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleProvider>
          <ThemeProvider>
            <TooltipProvider delayDuration={200}>
              <AppShell shell={shell} streak={streak}>
                {children}
              </AppShell>
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
