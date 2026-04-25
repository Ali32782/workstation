# Migadu Email — DNS Setup

Email is fully outsourced to [Migadu](https://www.migadu.com). No container,
no maintenance. One plan (~CHF 4/mo) covers every domain and alias.

**Managed domains:**

| Domain                          | Primary use for mail                                                              |
|---------------------------------|-----------------------------------------------------------------------------------|
| `kineo360.work`                 | Infrastruktur-Sender: `noreply@` für Hetzner-Alerts, Keycloak-Admin, Uptime Kuma |
| `corehub.kineo360.work` *(neu)* | **Corehub team** — Engineering mailboxes (`ali@`, `eng@`, `noreply@`)            |
| `medtheris.kineo360.work` *(neu)* | **Medtheris team** — Sales + Customer Inquiry (`ali@`, `sales@`, `support@`, `noreply@`) |
| `corehub.io`                    | Legacy Corehub mailboxes (vor Workspace-Aufteilung)                              |
| `medtheris.com`                 | Optional GmbH-Domain (Rechnungen, externe Kommunikation)                          |
| `<practice>.ch`                 | Optional per-Praxis Alias/Identity (Praxis-Onboarding)                           |

> **Setup-Reihenfolge für die zwei Team-Subdomains:**
>
> 1. **Migadu Admin** → Domains → **Add Domain** → `corehub.kineo360.work` (gratis, zählt nicht gegen die Mailbox-Quota; Subdomains sind unbegrenzt unter dem bezahlten Parent-Account).
> 2. Migadu zeigt die nötigen DNS-Werte → in **Cloudflare** unter Zone `kineo360.work` die 6 Records anlegen (siehe unten, „DNS records per domain"). **Alle CNAMEs müssen „DNS only" (graue Wolke)** sein, sonst frisst Cloudflare die Migadu-Verifikation.
> 3. Migadu Admin → **Verify Domain** klicken → grünes Häkchen.
> 4. Mailboxen anlegen: `ali@`, `eng@`, `noreply@`.
> 5. Wiederholen für `medtheris.kineo360.work` mit Mailboxen `ali@`, `sales@`, `support@`, `noreply@`.
> 6. Service-Sender umkonfigurieren via `scripts/wire-smtp.sh` (siehe Abschnitt „Per-Workspace SMTP-Sender" unten).

## DNS records per domain

Replace `example.com` with each managed domain. Set TTL to 3600 (1 h).

### MX

```
example.com.           MX   10   aspmx1.migadu.com.
example.com.           MX   20   aspmx2.migadu.com.
```

### SPF (TXT)

```
example.com.           TXT  "v=spf1 include:spf.migadu.com -all"
```

### DKIM (TXT — three selectors)

Migadu signs with three rotating selectors. Create all three as CNAME:

```
key1._domainkey.example.com.    CNAME   key1.example.com._domainkey.migadu.com.
key2._domainkey.example.com.    CNAME   key2.example.com._domainkey.migadu.com.
key3._domainkey.example.com.    CNAME   key3.example.com._domainkey.migadu.com.
```

### DMARC (TXT)

Start in monitoring mode, tighten later:

```
_dmarc.example.com.    TXT  "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com; adkim=s; aspf=s"
```

Once reports show clean alignment for a few weeks, switch `p=quarantine` to
`p=reject`.

### Autoconfig / Autodiscover (optional but nice)

```
autoconfig.example.com.         CNAME   autoconfig.migadu.com.
_autodiscover._tcp.example.com. SRV     0 1 443 autodiscover.migadu.com.
```

## Add a new practice

Two options:

### Option A — use a Kineo360 mailbox (no extra DNS)

Create `<slug>@kineo360.work` in the Migadu admin. Zero DNS work for the
practice. Recommended default.

### Option B — use the practice's own domain

1. Migadu admin → **Domains → Add alias** → `<practice>.ch`
2. Create MX / SPF / DKIM (×3) / DMARC records at the practice's registrar,
   pointing to Migadu's hosts.
3. Mailboxes on the practice domain now route through Migadu with the same
   quota.

## Per-Workspace SMTP-Sender

Sobald die zwei Team-Subdomains in Migadu verifiziert sind, müssen die
Container ihren `SMTP_FROM_EMAIL` pro Workspace-Stack umstellen, damit
ausgehende Mails das richtige Branding zeigen:

| Container                | `SMTP_FROM_EMAIL`                       |
|--------------------------|------------------------------------------|
| Rocket.Chat (corehub)    | `noreply@corehub.kineo360.work`          |
| Nextcloud (corehub)      | `noreply@corehub.kineo360.work`          |
| Keycloak realm `corehub` | `noreply@corehub.kineo360.work`          |
| Rocket.Chat (medtheris)  | `noreply@medtheris.kineo360.work`        |
| Nextcloud (medtheris)    | `noreply@medtheris.kineo360.work`        |
| Keycloak realm `medtheris-internal` | `noreply@medtheris.kineo360.work` |
| Twenty CRM               | `noreply@kineo360.work` (geteilt)        |
| Hetzner-/Uptime-/Backup-Alerts | `noreply@kineo360.work`           |

`SMTP_USER` bleibt für **alle** Container `noreply@kineo360.work` — Migadu
erlaubt einem Login-User, From-Adressen aller verifizierten Domains zu senden.
Nur `SMTP_FROM_EMAIL` wechselt pro Stack. Das Skript `scripts/wire-smtp.sh`
nimmt zwei optionale Env-Vars `COREHUB_FROM` und `MEDTHERIS_FROM` und setzt
die richtigen Werte je Container.

## Verify

```bash
dig +short MX example.com
dig +short TXT example.com
dig +short TXT _dmarc.example.com
dig +short CNAME key1._domainkey.example.com
```

All four must return Migadu values.
