# Jitsi Isolation Test

**Before** running Jitsi together with the rest of the stack, prove that the
Videobridge (JVB) can establish media on Hetzner Cloud.

## Why

JVB uses UDP 10000 and must **advertise** a reachable public IP to clients.
Behind Hetzner's virtualization, `getifaddrs()` sometimes returns the private
IP. If unset, everyone sees themselves fine locally but the other side is
black.

## Preconditions

- Hetzner Cloud Firewall: allow **UDP 10000** inbound.
- Host UFW: allow **UDP 10000**, **TCP 8443**.
- DNS A record for `meet.<domain>` points to the host.
- `.env` contains `DOCKER_HOST_ADDRESS=<public-ipv4>`.

## Run in isolation

```bash
cd /opt/corehub
docker compose -f docker-compose.jitsi.yml --env-file .env up -d
docker compose -f docker-compose.jitsi.yml logs -f jvb
```

You should see `Advertising ipv4 <PUBLIC_IP>` near the end of JVB boot.

## Smoke test

1. Add Proxy Host in NPM:
   - Domain: `meet.medtheris.kineo360.work`
   - Forward to `jitsi-web:80`, WebSockets **on**, Force SSL + HTTP/2 **on**
2. Open `https://meet.medtheris.kineo360.work/testroom` on two different networks
   (ideally phone over LTE + laptop on Wi-Fi).
3. Both participants must see **each other's** video. If only local video
   appears, JVB cannot traverse NAT — fix `DOCKER_HOST_ADDRESS` and retry.

## Tear down before rolling out full stack

```bash
docker compose -f docker-compose.jitsi.yml down
```

Start Jitsi again **after** the core stack comes up:

```bash
docker compose up -d
docker compose -f docker-compose.jitsi.yml up -d
```

## Common failure modes

| Symptom                           | Cause                                  | Fix                                                |
|-----------------------------------|----------------------------------------|----------------------------------------------------|
| Only see yourself                 | JVB advertises wrong IP                | Set `DOCKER_HOST_ADDRESS` to public IPv4           |
| Works on LAN, fails over LTE      | UDP 10000 closed on Hetzner Firewall   | Open UDP 10000 in Cloud Firewall + UFW             |
| Meeting room ends after 5 s       | Prosody cannot reach jicofo            | Check `JICOFO_AUTH_PASSWORD` matches in both svcs  |
| "Bridge channel not available"    | WebSockets disabled in NPM             | Enable **WebSockets Support** on the Proxy Host    |
