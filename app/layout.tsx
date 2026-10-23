import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import type { ShellData } from "@/components/shell/Sidebar";
import { availableContexts, type ShellContext } from "@/lib/shell/nav";
import { getLearningContext } from "@/lib/server/study/learning-context";
import { LocaleProvider } from "@/lib/i18n";
import { getServerLocale } from "@/lib/server/locale";
import { ThemeProvider } from "@/lib/theme";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { isOfflineShellPath } from "@/lib/pwa/offline-routes";
import {
  getCompanyMembership,
  ASSIGN_ROLES,
  isRoleAllowed,
  STATUS_VIEW_ROLES,
} from "@/lib/server/company/access";
import { ServiceWorkerManager } from "@/components/ServiceWorkerManager";
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

// Dateien erzeugt scripts/generate-icons.mjs (Gerät in Punkten und Pixelfaktor, Hochformat).
const IOS_STARTUP_IMAGES = [
  { name: "iphone-430x932", pw: 430, ph: 932, ratio: 3 },
  { name: "iphone-393x852", pw: 393, ph: 852, ratio: 3 },
  { name: "iphone-390x844", pw: 390, ph: 844, ratio: 3 },
  { name: "iphone-414x896", pw: 414, ph: 896, ratio: 2 },
  { name: "iphone-375x667", pw: 375, ph: 667, ratio: 2 },
  { name: "ipad-834x1194", pw: 834, ph: 1194, ratio: 2 },
];

export const metadata: Metadata = {
  title: "ProofPath",
  description:
    "KI-gestützte Lern- und Prüfungsvorbereitung für IT-Zertifikate / AI-powered study and exam prep for IT certifications",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // Die Leiste läuft unter der Statusleiste (viewportFit „cover“); die Abstände setzen die env(safe-area-inset-*)-Werte im Layout.
    statusBarStyle: "black-translucent",
    title: "ProofPath",
    startupImage: IOS_STARTUP_IMAGES.map((d) => ({
      url: `/splash/${d.name}.png`,
      media: `(device-width: ${d.pw}px) and (device-height: ${d.ph}px) and (-webkit-device-pixel-ratio: ${d.ratio}) and (orientation: portrait)`,
    })),
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Chrome auf Android berechnet das kleinste Zoom-Level sonst selbst so, dass der ganze Inhalt passt: ist beim Laden auch nur
  // ein Element breiter als der Bildschirm, wird der Viewport aufgeweitet und die Seite herausgezoomt (keine „mobile Ansicht“ mehr).
  // Mit minimum-scale=1 bleibt die Seite in Gerätebreite; Hineinzoomen bleibt erlaubt.
  minimumScale: 1,
  // Inhalt bis unter Notch und Home-Indikator; die Bedienelemente halten Abstand über env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0C10" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Offline-Einstieg (/offline, /~offline): wird vorab zwischengespeichert und darf keinen Nutzer enthalten.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const user = isOfflineShellPath(pathname) ? null : await getCurrentUser();
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
  // Wochenziel statt Tagesserie; die Serie (mit Serienschutz) nur, wenn die Person sie eingeschaltet hat.
  const learning = user ? await getLearningContext(user.id).catch(() => null) : null;
  const streak = learning?.preferences.showStreak ? learning.streak : 0;
  const weekly = learning ? { days: learning.weekly.daysLearned, goal: learning.weekly.goal } : null;
  // Nonce aus proxy.ts (CSP ohne 'unsafe-inline' für Skripte).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = await getServerLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleProvider>
          <ThemeProvider>
            <TooltipProvider delayDuration={200}>
              <AppShell shell={shell} streak={streak} weekly={weekly}>
                {children}
              </AppShell>
              <Toaster />
              <ServiceWorkerManager userId={user?.id ?? null} />
            </TooltipProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
