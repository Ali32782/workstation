/**
 * Process-level safety net.
 *
 * Several runtime libraries we depend on (imapflow, the MongoDB driver, the
 * native http client used inside our app-clients) emit sporadic socket-level
 * errors well after the originating request has completed. Without a guard
 * those bubble up as uncaughtException / unhandledRejection and Next.js kills
 * the entire server, taking every active session with it.
 *
 * We log them at warn level and keep going. Real, actionable errors continue
 * to surface through the awaited promises in the route handlers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  process.on("uncaughtException", (err: Error & { code?: string }) => {
    // Known harmless background failures from imapflow when an IDLE/socket
    // dies after the response has already been written.
    if (err?.code === "ETIMEOUT" || err?.code === "NoConnection") {
      console.warn(`[uncaughtException] ${err.code}: ${err.message}`);
      return;
    }
    console.error("[uncaughtException]", err);
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason as Error & { code?: string };
    if (err?.code === "ETIMEOUT" || err?.code === "NoConnection") {
      console.warn(`[unhandledRejection] ${err.code}: ${err.message}`);
      return;
    }
    console.error("[unhandledRejection]", reason);
  });
}
