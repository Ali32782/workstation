import type { MetadataRoute } from "next";

/**
 * Web-App-Manifest (installierbar / „Zum Startbildschirm“).
 * iOS Safari nutzt zusätzlich die Meta-Tags in {@link layout.tsx} (`appleWebApp`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Corehub Workstation",
    short_name: "Corehub",
    description:
      "Internes Portal für Corehub, MedTheris und Kineo – Chat, Calls, Mail und mehr.",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    orientation: "any",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/branding/corehub-mark.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/branding/corehub.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
