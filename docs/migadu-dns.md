# Migadu Email — DNS Setup

Email is fully outsourced to [Migadu](https://www.migadu.com). No container,
no maintenance. One plan (~CHF 4/mo) covers every domain and alias.

**Managed domains:**

| Domain          | Primary use for mail                                      |
|-----------------|-----------------------------------------------------------|
| `corehub.io`    | Corehub team mailboxes (ali@, richard@, diana@)           |
| `kineo360.work` | Platform mailboxes: `info@`, `support@`, `noreply@`, plus per-tenant identities `<slug>@kineo360.work` |
| `medtheris.com` | Optional MedTheris GmbH company mailboxes                 |
| `<practice>.ch` | Optional per-practice alias/identity                      |

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

## Verify

```bash
dig +short MX example.com
dig +short TXT example.com
dig +short TXT _dmarc.example.com
dig +short CNAME key1._domainkey.example.com
```

All four must return Migadu values.
