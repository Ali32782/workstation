# DNS Setup — Option A (Cloudflare + Vercel split)

Single source of truth for which domain lives at which provider, and the
exact records to create.

## The split

| Domain            | DNS Provider | Why                                                          |
|-------------------|--------------|--------------------------------------------------------------|
| `kineo360.work`   | **Cloudflare** | Multi-level wildcards + DNS-01 challenge → automatic wildcard LE certs, zero per-tenant DNS work |
| `corehub.io`      | Vercel       | No multi-tenancy here; a handful of static A records is fine |
| `medtheris.com`   | Vercel       | Only needed for optional mail via Migadu                     |

The `kineo360.work` registrar stays where it is — only the **nameservers**
move to Cloudflare. You can keep ordering / renewing through Vercel.

---

## Part 1 — Move `kineo360.work` DNS to Cloudflare

### 1.1 Create the zone (5 min)

1. Sign up for a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
2. **Add a Site** → enter `kineo360.work`.
3. Choose the **Free** plan.
4. Cloudflare scans Vercel's records and imports whatever exists. Review,
   delete the Vercel-specific ones — we'll set the records we need manually
   in step 1.3.
5. Cloudflare shows **two nameservers** assigned to your zone, e.g.
   `sasha.ns.cloudflare.com` and `todd.ns.cloudflare.com`. Copy them.

### 1.2 Delegate from Vercel (5 min, then wait 5–60 min for propagation)

1. Open [Vercel Dashboard → Domains](https://vercel.com/domains) → click
   `kineo360.work`.
2. **Nameservers** → switch from Vercel to *Custom Nameservers*.
3. Paste the two Cloudflare nameservers from step 1.1.
4. Save. Propagation is typically <15 min, max 1 h.
5. Verify: `dig +short NS kineo360.work` should return the Cloudflare
   nameservers. Cloudflare's dashboard will also show a green
   "Active" banner once propagation is done.

### 1.3 Create the A records

In Cloudflare → **DNS → Records → Add record**, create these four. **Proxy
status: DNS only (grey cloud)** for every record — Cloudflare's orange-cloud
proxy breaks Jitsi WebSockets, SSH-to-Gitea, and is unnecessary when NPM is
already doing TLS.

| Type | Name             | Target                         | Proxy | TTL |
|------|------------------|--------------------------------|-------|-----|
| A    | `@`              | *(Vercel — see note below)*    | DNS only | Auto |
| A    | `www`            | *(Vercel — see note below)*    | DNS only | Auto |
| A    | `*`              | `<hetzner-public-ipv4>`        | DNS only | Auto |
| A    | `*.*`            | `<hetzner-public-ipv4>`        | DNS only | Auto |

**Apex and `www`**:

- **If** you want the marketing site on **Vercel** (Next.js on Vercel Hosting),
  follow [Vercel's custom domain instructions](https://vercel.com/docs/projects/domains)
  — they'll ask you to add `cname.vercel-dns.com` for `www` and a specific A
  record for the apex. Add those in Cloudflare with Proxy = DNS only.
- **If** you want to use the Hetzner-hosted landing container from
  `landing/`, set `@` and `www` to `<hetzner-public-ipv4>` instead, same as
  the wildcards. Then the nginx in `landing/conf.d/default.conf` serves the
  apex marketing from Hetzner too.

Either works; Vercel is slightly nicer for iterating on marketing copy
without touching the server. Decide later — the wildcards are independent.

### 1.4 Migadu email records (15 min)

Add these to Cloudflare, Proxy = DNS only, TTL Auto:

```
Type  Name               Content
MX    @            (10)  aspmx1.migadu.com.
MX    @            (20)  aspmx2.migadu.com.
TXT   @                  "v=spf1 include:spf.migadu.com -all"
CNAME key1._domainkey    key1.kineo360.work._domainkey.migadu.com.
CNAME key2._domainkey    key2.kineo360.work._domainkey.migadu.com.
CNAME key3._domainkey    key3.kineo360.work._domainkey.migadu.com.
TXT   _dmarc             "v=DMARC1; p=quarantine; rua=mailto:postmaster@kineo360.work; adkim=s; aspf=s"
```

Verify:

```bash
dig +short MX kineo360.work
dig +short TXT kineo360.work
dig +short TXT _dmarc.kineo360.work
```

All three must return Migadu values before sending your first email.

### 1.5 API token for NPM (2 min)

NPM will request Let's Encrypt wildcard certs via Cloudflare's API. Create a
scoped token:

1. Cloudflare → **My Profile → API Tokens → Create Token**.
2. Template: **Edit zone DNS**.
3. Permissions: `Zone · DNS · Edit`.
4. Zone Resources: **Include → Specific zone → `kineo360.work`**.
5. TTL: leave open.
6. Create → copy the token once (it's shown only once).

You'll paste this into NPM in part 3.

---

## Part 2 — Records that stay on Vercel

### 2.1 `corehub.io` (Corehub dev team)

In Vercel → Domains → `corehub.io` → DNS, add these A records (all → Hetzner
public IPv4):

```
auth      A   <hetzner-ipv4>
chat      A   <hetzner-ipv4>
files     A   <hetzner-ipv4>
office    A   <hetzner-ipv4>
meet      A   <hetzner-ipv4>
crm       A   <hetzner-ipv4>
git       A   <hetzner-ipv4>
```

Plus Migadu records (same pattern as 1.4, replacing `kineo360.work` with
`corehub.io`).

### 2.2 `medtheris.com` (company mail only)

Only email. No A records needed for the platform. Add only the Migadu
MX/SPF/DKIM/DMARC block to Vercel DNS, swapping the domain.

---

## Part 3 — NPM wildcard certificates

After Cloudflare delegation is active, before creating Proxy Hosts in NPM:

1. SSH-tunnel to NPM admin:
   ```bash
   ssh -L 81:localhost:81 deploy@<host>
   ```
2. Browse `http://localhost:81` → **SSL Certificates → Add Let's Encrypt**.
3. Cert A:
   - Domain Names: `*.kineo360.work`, `kineo360.work`
   - Email: value of `ACME_EMAIL` in `.env`
   - Toggle **Use a DNS Challenge** → Provider: **Cloudflare**
   - Credentials File Content:
     ```ini
     dns_cloudflare_api_token = <paste your API token from step 1.5>
     ```
   - Propagation Seconds: `60`
   - I agree → **Save**.
4. Repeat for Cert B with Domain Names `*.*.kineo360.work`.

Both certs auto-renew every ~60 days. Every Proxy Host you create under
`*.kineo360.work` or `*.*.kineo360.work` now picks up the matching wildcard
automatically — no LE round-trip per tenant.

For `corehub.io` Proxy Hosts, use HTTP-01 (NPM's default) — the handful of
subdomains don't warrant DNS-01 there.

---

## Verification checklist

Run from any internet host once Cloudflare is active and the Hetzner server
is up:

```bash
# 1. Nameservers
dig +short NS kineo360.work          # -> *.ns.cloudflare.com

# 2. Wildcards resolve to Hetzner
dig +short  mueller.kineo360.work           # -> <hetzner-ip>
dig +short  files.mueller.kineo360.work     # -> <hetzner-ip>
dig +short  auth.medtheris.kineo360.work    # -> <hetzner-ip>

# 3. TLS wildcard certs
openssl s_client -servername files.mueller.kineo360.work \
    -connect files.mueller.kineo360.work:443 </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
# Should show: subject=CN=*.*.kineo360.work, notAfter ~90 days out

# 4. Email DNS
dig +short MX kineo360.work
dig +short TXT _dmarc.kineo360.work
```

Or, from the server, after the stack is up:

```bash
make smoke
```

---

## Rollback / change-of-mind

Moving DNS back from Cloudflare to Vercel later is painless: set the
registrar's nameservers back to Vercel's, wait for propagation, and Vercel
serves the zone again. Cloudflare doesn't lock your domain in.
