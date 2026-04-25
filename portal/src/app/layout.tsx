import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corehub Workstation",
  description: "Internal portal for Corehub + MedTheris teams",
  icons: {
    icon: "/branding/corehub.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
