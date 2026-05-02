import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,

  // Modern image formats by default — Next will pick AVIF/WebP when the
  // browser sends Accept headers for it, falling back to the original
  // format otherwise. Saves ~30-50 % on lead-form / login hero imagery.
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // Aggressive tree-shaking for known-fat packages. Next 14+ rewrites
  // barrel imports (e.g. `import { Foo } from "lucide-react"`) into
  // path-imports that only pull the component you actually use.
  // Saves an estimated 40-100 KB on every route that touches one of
  // these libraries.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/extension-highlight",
      "@tiptap/extension-image",
      "@tiptap/extension-link",
      "@tiptap/extension-table",
      "@tiptap/extension-table-cell",
      "@tiptap/extension-table-header",
      "@tiptap/extension-table-row",
      "@tiptap/extension-task-item",
      "@tiptap/extension-task-list",
      "@tiptap/extension-text-align",
      "@tiptap/extension-typography",
      "@tiptap/extension-underline",
    ],
  },

  // These packages have dynamic requires / native deps the Next.js NFT
  // tracer can't follow — keep them as runtime externals so the npm-installed
  // copy is used and bundle them via outputFileTracingIncludes.
  serverExternalPackages: [
    "imapflow",
    "nodemailer",
    "mailparser",
    "sanitize-html",
    "mongodb",
    "bson",
  ],
  outputFileTracingIncludes: {
    "/api/dashboard/pulse": ["./node_modules/imapflow/**/*"],
    "/[workspace]/mail": [
      "./node_modules/imapflow/**/*",
      "./node_modules/mailparser/**/*",
      "./node_modules/sanitize-html/**/*",
    ],
    "/[workspace]/chat": [
      "./node_modules/mongodb/**/*",
      "./node_modules/bson/**/*",
    ],
    "/api/mail/folders": ["./node_modules/imapflow/**/*"],
    "/api/mail/messages": ["./node_modules/imapflow/**/*"],
    "/api/mail/message/[folder]/[uid]": [
      "./node_modules/imapflow/**/*",
      "./node_modules/mailparser/**/*",
      "./node_modules/sanitize-html/**/*",
    ],
    "/api/mail/message/[folder]/[uid]/attachment/[partId]": [
      "./node_modules/imapflow/**/*",
      "./node_modules/mailparser/**/*",
    ],
    "/api/mail/send": [
      "./node_modules/imapflow/**/*",
      "./node_modules/nodemailer/**/*",
    ],
    "/api/chat/rooms": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/messages": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/send": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/upload": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/call": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/users": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/dm": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/chat/read": ["./node_modules/mongodb/**/*", "./node_modules/bson/**/*"],
    "/api/helpdesk/tickets": ["./node_modules/sanitize-html/**/*"],
    "/api/helpdesk/ticket/[id]": ["./node_modules/sanitize-html/**/*"],
    "/api/projects/issue/[id]": ["./node_modules/sanitize-html/**/*"],
    "/api/projects/issue/[id]/comment": ["./node_modules/sanitize-html/**/*"],
    "/api/projects/issues": ["./node_modules/sanitize-html/**/*"],
    "/api/projects/projects": ["./node_modules/sanitize-html/**/*"],
    "/[workspace]/files": [],
    "/[workspace]/office": [],
    "/api/cloud/list": [],
    "/api/cloud/download": [],
    "/api/cloud/upload": [],
    "/api/cloud/mkdir": [],
    "/api/cloud/delete": [],
    "/api/cloud/create-doc": [],
  },
  async headers() {
    // Build the Content-Security-Policy as a single multi-line string.
    // Notes / decisions:
    //   • script-src: 'self' is enough — we don't load 3rd-party JS into the
    //     portal shell. 'unsafe-inline' is required because Next.js still
    //     emits a small inline boot script; remove once we move to nonce-based
    //     CSP (next/script with nonce).
    //   • style-src: same reason — Tailwind injects a few inline styles.
    //   • img-src: data: for inline SVG / file-icons, blob: for in-browser
    //     PDF rendering (pdf.js), https: for everything from S3-style storage.
    //   • connect-src: include every internal service the portal calls from
    //     the browser. Server-side fetches are not subject to CSP.
    //   • frame-src: every iframe target (Jitsi, Plane, Snappymail, Collabora,
    //     OpenCut, Postiz, Mautic builder).
    //   • frame-ancestors 'self' — neither Plane SSO nor the legacy embed
    //     paths need cross-origin embedding; per-route overrides set looser
    //     policies further down.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://meet.kineo360.work",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://meet.kineo360.work wss://meet.kineo360.work " +
        "https://crm.kineo360.work https://chat.kineo360.work " +
        "https://files.kineo360.work https://files.medtheris.kineo360.work " +
        "https://office.kineo360.work " +
        "https://videos.kineo360.work https://social.kineo360.work " +
        "https://marketing.medtheris.kineo360.work",
      "frame-src 'self' https://meet.kineo360.work https://chat.kineo360.work " +
        "https://files.kineo360.work https://files.medtheris.kineo360.work " +
        "https://office.kineo360.work " +
        "https://videos.kineo360.work https://social.kineo360.work " +
        "https://marketing.medtheris.kineo360.work " +
        "https://plane.kineo360.work https://gitea.kineo360.work " +
        "https://webmail.kineo360.work",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      // Default security headers for the whole portal.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // CSP applied only when CSP_ENFORCE=1 (default: report-only via
          // env so we can roll it out without immediately breaking embeds).
          // Add CSP_REPORT_URI later when we have a sink.
          {
            key:
              process.env.CSP_ENFORCE === "1"
                ? "Content-Security-Policy"
                : "Content-Security-Policy-Report-Only",
            value: csp,
          },
          // HSTS — 1 year, includeSubDomains, no preload (operator opt-in
          // via DNS preload list separately). Only meaningful behind TLS,
          // so harmless on localhost dev where browsers ignore it.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Allow Mic/Kamera for eingebettetes Jitsi (meet.*) + Portal-eigene UI.
          // Leeres camera=() würde iFrames blockieren, selbst mit allow-Attribut.
          {
            key: "Permissions-Policy",
            value:
              'camera=(self "https://meet.kineo360.work"), microphone=(self "https://meet.kineo360.work"), display-capture=(self "https://meet.kineo360.work"), geolocation=()',
          },
        ],
      },
      // SSO bridges that must be embeddable in our own AppFrame iframe.
      // The route handler additionally sets x-frame-options: SAMEORIGIN.
      {
        source: "/api/plane/sso",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: "/api/webmail/sso",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
