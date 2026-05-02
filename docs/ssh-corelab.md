# SSH: MedTheris-Corelab (`178.104.222.61`)

Den folgenden Block in **`~/.ssh/config`** (laptop / CI) einfügen — dann funktionieren z. B. `ssh medtheris-corelab`, `rsync … medtheris-corelab:…` und `./scripts/deploy-medtheris-corelab.sh` ohne IP.

```sshconfig
Host medtheris-corelab
  HostName 178.104.222.61
  User deploy
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 60
  ServerAliveCountMax 3

Host medtheris-corelab-root
  HostName 178.104.222.61
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

- **Deploy (Stack, rsync):** `ssh medtheris-corelab` (User `deploy`).  
- **Admin (einmalig chown u. Ä.):** `ssh medtheris-corelab-root` — nur wenn dein **`id_ed25519.pub`** in **`/root/.ssh/authorized_keys`** liegt.

Public Key lokal anzeigen: `cat ~/.ssh/id_ed25519.pub`

Siehe auch: [portal.md → Deploy](./portal.md#deploy).

## Einmalig auf dem Server (root)

Damit User **`deploy`** per rsync den gesamten Stack aktualisieren kann:

```bash
# als root (z. B. ssh medtheris-corelab-root)
chown -R deploy:deploy /opt/corelab/portal /opt/corelab/medtheris-scraper /opt/corelab/scripts
chown deploy:deploy /opt/corelab/docker-compose.yml
# rsync legt Temp-Dateien im Ordner /opt/corelab an — der Ordner selbst muss deploy gehören:
chown deploy:deploy /opt/corelab
```

Nur **`medtheris-corelab-root`** nutzen, wenn dein **`id_ed25519.pub`** bei **root** in `~/.ssh/authorized_keys` eingetragen ist.
