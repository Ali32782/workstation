# Documenso

Self-hosted DocuSign-Alternative für Kineo360 / Corehub / MedTheris.

- **URL**: https://sign.kineo360.work
- **Login**: SSO via Keycloak `main` Realm
- **SMTP**: Migadu. **Absender-Mailbox** muss in Migadu existieren und stimmen (`DOCUMENSO_SMTP_USERNAME` = `DOCUMENSO_SMTP_FROM_ADDRESS`). Solange **`medtheris.kineo360.work`** in Migadu noch nicht verifiziert ist, nutzt ihr z. B. **`johannes@kineo360.work`** (Parent-Domain oft schon *Active*). **Hetzner:** ausgehend oft kein 465 — im Compose nutzt Documenso **587 + STARTTLS** (`NEXT_PRIVATE_SMTP_SECURE=false`).
- **Signing-Cert**: Self-signed PKCS#12 (Phase 1, später Production-Cert via Anbieter)

## Einladungs-Mail / „E-Mail nicht gesendet“

- **Schnellcheck auf dem Server**: `bash scripts/check-documenso-smtp.sh` (lädt `/opt/corelab/.env` oder `CORELAB_ENV=…`; prüft `DOCUMENSO_SMTP_*` und TCP 587).
- **535 / authentication failed**: Migadu lehnt USER/PASS ab (typisch nach `/document/redistribute`). Passwort der Mailbox in **Migadu** prüfen oder neu setzen; in `/opt/corelab/.env` **`DOCUMENSO_SMTP_PASSWORD`** (und bei Bedarf **`TWENTY_SMTP_PASSWORD`** gleich halten) aktualisieren, dann `docker compose up -d documenso`. Manuell testen im Container:  
  `docker exec documenso node -e "require('nodemailer').createTransport({host:process.env.NEXT_PRIVATE_SMTP_HOST,port:+process.env.NEXT_PRIVATE_SMTP_PORT,secure:process.env.NEXT_PRIVATE_SMTP_SECURE==='true',auth:{user:process.env.NEXT_PRIVATE_SMTP_USERNAME,pass:process.env.NEXT_PRIVATE_SMTP_PASSWORD}}).verify((e)=>console.log(e?e.message:'SMTP OK'))"`
- **SMTP in Documenso**: Admin → E-Mail / SMTP testen; Logs des `documenso`-Containers prüfen (TLS, Zugangsdaten, From-Adresse).
- **Reihenfolge (sequential signing)**: Spätere Unterzeichner zeigen oft weiterhin „nicht gesendet“, bis alle **vorherigen** Schritte unterschrieben haben — kein Versandfehler.
- **Parallel**: Wenn alle gleichzeitig unterschreiben sollen, in Documenso/Portal die **Reihenfolge** pro Empfänger prüfen (gleiche oder keine Order).
- **Manuell**: Persönlichen Unterzeichnen-Link aus dem Portal kopieren oder „Erinnern“ auslösen.
- **Portal → Documenso Felder**: Der Corelab-Code sendet seit dem Fix `documentData.envelopeItemId` mit (OpenAPI v2), falls Documenso sie liefert — ohne diese ID können Felder in neueren Builds schief landen. Fehlt `envelopeId` in der Document-Antwort, wird `/document/field/create-many` mit `pageNumber` genutzt.

## Files in diesem Verzeichnis

| File | Zweck | Im Git? |
|---|---|---|
| `cert.p12` | PKCS#12 Signing-Cert für PDF-Signaturen | NEIN (gitignored) |
| `secrets.local.env` | Generierte Secrets, Passphrasen, Client-IDs | NEIN (gitignored) |
| `README.md` | Diese Datei | Ja |

`cert.p12` und `secrets.local.env` werden **lokal generiert** und auf den Server kopiert. Der Server speichert das `.env` als Teil seiner Konfiguration unter `/opt/corelab/.env`.

## Cert erneuern

Wenn das self-signed Cert abläuft (Default: 10 Jahre):

```bash
cd documenso
SIGNING_PASSPHRASE=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)

openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout /tmp/documenso.key -out /tmp/documenso.crt \
  -subj "/C=CH/ST=Zurich/L=Zurich/O=Kineo360/OU=Documenso Signer/CN=sign.kineo360.work/emailAddress=admin@corehub.kineo360.work"

openssl pkcs12 -export \
  -inkey /tmp/documenso.key -in /tmp/documenso.crt \
  -out cert.p12 -name "Kineo360 Documenso Signer" \
  -password "pass:$SIGNING_PASSPHRASE"

rm /tmp/documenso.key /tmp/documenso.crt

# Push to server, update env, restart container:
scp cert.p12 deploy@server:/opt/corelab/documenso/cert.p12
ssh deploy@server "sed -i 's|^DOCUMENSO_SIGNING_PASSPHRASE=.*|DOCUMENSO_SIGNING_PASSPHRASE=$SIGNING_PASSPHRASE|' /opt/corelab/.env && cd /opt/corelab && docker compose up -d documenso"
```
