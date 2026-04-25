import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
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
  },
  async headers() {
    return [
      // Default security headers for the whole portal.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
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
