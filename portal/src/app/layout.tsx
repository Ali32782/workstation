import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";

export const metadata: Metadata = {
  title: "Corehub Workstation",
  description: "Internal portal for Corehub + MedTheris teams",
  icons: {
    icon: "/branding/corehub.svg",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
