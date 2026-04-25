#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh - One-shot server preparation for Ubuntu 24.04 LTS
# Idempotent: re-runnable. Run as root (or via sudo).
#
# Actions:
#   1. apt update/upgrade + baseline packages
#   2. Install Docker Engine + Compose v2 (official repo)
#   3. UFW firewall: 22, 80, 443, 8443, 10000/udp
#   4. Non-root 'deploy' user with docker group
#   5. SSH hardening (password auth off)
#   6. Install backup cron
# =============================================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo -i)." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-deploy}"
REPO_DIR="${REPO_DIR:-/opt/corehub}"

echo "==> 1/6 apt update & base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  ufw unattended-upgrades \
  cron rsync jq git htop tmux \
  s3cmd

echo "==> 2/6 Install Docker Engine + Compose v2"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> 3/6 Configure UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8443/tcp comment 'Jitsi TLS fallback'
ufw allow 10000/udp comment 'Jitsi JVB'
ufw --force enable
ufw status verbose

echo "==> 4/6 Create deploy user"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG docker "${DEPLOY_USER}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 700 "/home/${DEPLOY_USER}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi

echo "==> 5/6 Harden SSH (disable password auth, keep root for now)"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh

echo "==> 6/6 Install backup cron"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${REPO_DIR}" /var/log/corehub /var/backups/corehub
if [[ -f "$(dirname "$0")/../cron/backup.cron" ]]; then
  cp "$(dirname "$0")/../cron/backup.cron" /etc/cron.d/corehub-backup
  chmod 644 /etc/cron.d/corehub-backup
fi

cat <<EOF

=========================================================
  Bootstrap complete.
  Next steps:
    1. Clone the repo into ${REPO_DIR}
    2. cp .env.example .env  &&  edit secrets
    3. sudo -u ${DEPLOY_USER} docker compose pull
    4. sudo -u ${DEPLOY_USER} docker compose up -d
    5. Point DNS A records to this server's public IP
    6. Configure Proxy Hosts in NPM via SSH tunnel
         ssh -L 81:localhost:81 ${DEPLOY_USER}@<host>
         open http://localhost:81
=========================================================
EOF
