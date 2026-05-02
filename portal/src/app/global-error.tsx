"use client";

/**
 * Last-line error boundary for the entire portal — Next.js renders this
 * if the root layout itself throws (e.g. provider misconfig, invalid
 * cookie shape). It MUST be a client component and MUST render its own
 * `<html>` + `<body>` since at this point Next can't trust the root
 * layout's wrappers.
 *
 * Keep it minimal. The user's only useful action at this depth is
 * "reload" — anything fancier risks repeating whatever broke the root.
 *
 * For per-route errors, see `app/[workspace]/error.tsx`.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.error("[portal] global-error", error);
    }
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0d10",
          color: "#e4e6ea",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 24,
            borderRadius: 12,
            border: "1px solid #232628",
            background: "#15171a",
          }}
        >
          <h1 style={{ fontSize: 18, margin: 0, marginBottom: 8 }}>
            Etwas ist schiefgelaufen
          </h1>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 13,
              color: "#a1a4a8",
              lineHeight: 1.5,
            }}
          >
            Der Portal-Root konnte nicht gerendert werden. Lade die Seite neu —
            wenn der Fehler bleibt, melde dich im Helpdesk mit der Fehler-ID.
          </p>
          {error.digest && (
            <p
              style={{
                margin: 0,
                marginBottom: 16,
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                color: "#7d8186",
              }}
            >
              Fehler-ID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #2d3034",
              background: "#1d2024",
              color: "#e4e6ea",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
