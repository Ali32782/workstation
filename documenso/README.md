# Documenso

Self-hosted DocuSign-Alternative für Kineo360 / Corehub / MedTheris.

- **URL**: https://sign.kineo360.work
- **Login**: SSO via Keycloak `main` Realm
- **SMTP**: Migadu (johannes@medtheris.kineo360.work)
- **Signing-Cert**: Self-signed PKCS#12 (Phase 1, später Production-Cert via Anbieter)

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
