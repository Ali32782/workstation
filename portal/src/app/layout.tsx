import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";
import { localeFromCookies } from "@/lib/i18n/server-locale";

/** iOS notch / home indicator; enables `env(safe-area-inset-*)` in CSS. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Corehub Workstation",
  description:
    "Internes Portal für Corehub, MedTheris und Kineo – Chat, Calls, Mail und mehr.",
  applicationName: "Corehub Workstation",
  /** Web-Manifest: `app/manifest.ts` — Next setzt `<link rel="manifest">` automatisch. */
  icons: {
    icon: [{ url: "/branding/corehub.svg", type: "image/svg+xml" }],
    apple: [{ url: "/branding/corehub-mark.svg", type: "image/svg+xml" }],
  },
  /** Statusleiste / Theme in installierter Web-App; dunkel = Portal-Default. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { color: "#0b0d10" },
  ],
  /**
   * iOS Safari: „Zum Home-Bildschirm“ → näher an Vollblick, besser für Jitsi/getUserMedia.
   * `black-translucent` + `viewportFit: cover` lässt die UI unter die Notch laufen.
   */
  appleWebApp: {
    capable: true,
    title: "Corehub",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// Runs synchronously in <head> BEFORE first paint to stamp the right
// data-theme attribute on <html>, avoiding a flash of the wrong palette.
// Kept tiny + dependency-free on purpose.
const themeInitScript = `
(function () {
  try {
    // Default = dark. The user can opt-in to "light" or "system" via the
    // ThemeToggle in the user menu; otherwise the dark palette is used
    // regardless of the OS preference.
    var stored = localStorage.getItem('corehub:theme');
    var mode = stored || 'dark';
    var resolved =
      mode === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : mode;
    document.documentElement.dataset.theme = resolved;
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialLocale = await localeFromCookies();
  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
