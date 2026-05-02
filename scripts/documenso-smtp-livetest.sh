#!/usr/bin/env bash
# =============================================================================
# Documenso SMTP — LIVE-Test direkt im Container.
#
# Schickt eine echte Test-Mail über die in docker-compose hinterlegten
# DOCUMENSO_SMTP_* Credentials an einen Empfänger deiner Wahl. Damit stellst
# du fest, ob das Postfach + Migadu + Hetzner-Egress wirklich funktionieren —
# vollständig getrennt von der Documenso-App-Logik (Templates, Queues, …).
#
# Usage:
#   bash scripts/documenso-smtp-livetest.sh empfaenger@example.com
#
# Optional:
#   DOCUMENSO_CONTAINER=documenso        # Containername (default: documenso)
# =============================================================================
set -euo pipefail

TO="${1:-}"
CONTAINER="${DOCUMENSO_CONTAINER:-documenso}"

if [ -z "$TO" ]; then
  printf '%s\n' "Usage: $0 empfaenger@example.com" >&2
  exit 2
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  printf '%s\n' "✗ Container „$CONTAINER“ läuft nicht. docker ps prüfen." >&2
  exit 1
fi

read -r ENV_HOST ENV_PORT ENV_SECURE ENV_USER ENV_PASS ENV_FROM ENV_FROM_NAME <<EOF
$(docker exec "$CONTAINER" sh -lc '
  printf "%s %s %s %s %s %s %s" \
    "${NEXT_PRIVATE_SMTP_HOST:-}" \
    "${NEXT_PRIVATE_SMTP_PORT:-}" \
    "${NEXT_PRIVATE_SMTP_SECURE:-}" \
    "${NEXT_PRIVATE_SMTP_USERNAME:-}" \
    "$(printf %s "${NEXT_PRIVATE_SMTP_PASSWORD:-}" | wc -c | tr -d " ")" \
    "${NEXT_PRIVATE_SMTP_FROM_ADDRESS:-}" \
    "${NEXT_PRIVATE_SMTP_FROM_NAME:-Sign}"
')
EOF

echo "Container : $CONTAINER"
echo "SMTP host : $ENV_HOST:$ENV_PORT (secure=$ENV_SECURE)"
echo "SMTP user : $ENV_USER"
echo "Pwd-Länge : $ENV_PASS Zeichen"
echo "Absender  : $ENV_FROM_NAME <$ENV_FROM>"
echo "An        : $TO"
echo "Schicke Test-Mail …"

docker exec -i \
  -e SMTP_TO="$TO" \
  "$CONTAINER" node -e '
const nodemailer = require("nodemailer");

const cfg = {
  host: process.env.NEXT_PRIVATE_SMTP_HOST,
  port: Number(process.env.NEXT_PRIVATE_SMTP_PORT || 587),
  secure: String(process.env.NEXT_PRIVATE_SMTP_SECURE).toLowerCase() === "true",
  auth: {
    user: process.env.NEXT_PRIVATE_SMTP_USERNAME,
    pass: process.env.NEXT_PRIVATE_SMTP_PASSWORD,
  },
  requireTLS: true,
  tls: { minVersion: "TLSv1.2" },
};

(async () => {
  const t = nodemailer.createTransport(cfg);
  try {
    const verify = await t.verify();
    console.log("verify ok:", verify);
  } catch (e) {
    console.error("verify failed:", e.message || e);
    process.exit(1);
  }

  const fromAddr = process.env.NEXT_PRIVATE_SMTP_FROM_ADDRESS;
  const fromName = process.env.NEXT_PRIVATE_SMTP_FROM_NAME || "Sign";
  const to = process.env.SMTP_TO;

  try {
    const info = await t.sendMail({
      from: { name: fromName, address: fromAddr },
      to,
      subject: "Documenso SMTP Live-Test " + new Date().toISOString(),
      text:
        "Dies ist ein direkter SMTP-Test aus dem Documenso-Container.\n" +
        "Wenn du diese Mail erhältst, funktioniert der Mailversand " +
        "von Documenso → Migadu → dein Postfach grundsätzlich.\n",
    });
    console.log("SEND_OK messageId:", info.messageId);
    console.log("response:", info.response);
    console.log("accepted:", JSON.stringify(info.accepted));
    console.log("rejected:", JSON.stringify(info.rejected));
  } catch (e) {
    console.error("send failed:", e.message || e);
    if (e.responseCode) console.error("responseCode:", e.responseCode);
    if (e.command) console.error("smtp command:", e.command);
    process.exit(1);
  }
})();
'
