#!/usr/bin/env bash
set -euo pipefail

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/stash

export DEBIAN_FRONTEND=noninteractive
APT_QUIET_FLAGS=(-y -qq -o=Dpkg::Use-Pty=0)

echo "[stash-install] Updating apt indexes"
apt-get update "${APT_QUIET_FLAGS[@]}"

echo "[stash-install] Installing base dependencies"
apt-get install "${APT_QUIET_FLAGS[@]}" curl sudo mc jq git openssl ca-certificates gnupg lsb-release

echo "[stash-install] Installing Docker engine"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update "${APT_QUIET_FLAGS[@]}"
  apt-get install "${APT_QUIET_FLAGS[@]}" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "[stash-install] Preparing /opt/stash"
mkdir -p /opt/stash
cd /opt/stash

echo "[stash-install] Writing deployment files"
cat <<'EOF' > /opt/stash/Caddyfile
:80 {
	handle /api/* {
		reverse_proxy api:8080
	}

	handle /health {
		reverse_proxy api:8080
	}

	handle {
		reverse_proxy web:3000
	}
}
EOF

cat <<'EOF' > /opt/stash/docker-compose.prod.yml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-stash}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-stash}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-stash}"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: ghcr.io/${GH_REPOSITORY_OWNER:-eigger}/stash-api:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    command: sh -lc "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/index.js"
    volumes:
      - uploads:/app/uploads
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-stash}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-stash}
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      PORT: "8080"
      APP_PUBLIC_URL: ${APP_PUBLIC_URL:-http://localhost}
      UPCITEMDB_API_KEY: ${UPCITEMDB_API_KEY:-}
      INVENTORY_WEBHOOK_URL: ${INVENTORY_WEBHOOK_URL:-}

  web:
    image: ghcr.io/${GH_REPOSITORY_OWNER:-eigger}/stash-web:latest
    restart: unless-stopped
    depends_on:
      - api
    environment:
      NODE_ENV: production

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - api
      - web

volumes:
  pgdata:
  uploads:
EOF

echo "[stash-install] Generating .env secrets"
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
IP_ADDR_EARLY="$(hostname -I | awk '{print $1}')"
cat <<EOF > /opt/stash/.env
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=stash
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=stash
JWT_SECRET=${JWT_SECRET}
APP_PUBLIC_URL=http://${IP_ADDR_EARLY}
UPCITEMDB_API_KEY=
INVENTORY_WEBHOOK_URL=
EOF

echo "[stash-install] Creating systemd service"
cat <<'EOF' >/etc/systemd/system/stash.service
[Unit]
Description=Stash Docker Compose Stack
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/stash
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl enable -q --now stash.service

echo "[stash-install] Setting up console auto-login for root"
mkdir -p /etc/systemd/system/container-getty@1.service.d/
cat <<'EOF' >/etc/systemd/system/container-getty@1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF
systemctl daemon-reload
systemctl restart container-getty@1.service || true

# Keep update logic local so rate limits on remote helper scripts cannot break updates.
cat <<'EOF' >/usr/bin/update
#!/usr/bin/env bash
set -euo pipefail

set -a
[ -f /etc/profile.d/90-http-proxy.sh ] && . /etc/profile.d/90-http-proxy.sh
set +a

if [[ ! -d /opt/stash ]]; then
  echo "No Stash installation found at /opt/stash"
  exit 1
fi

cd /opt/stash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
echo "Stash update completed."
EOF
chmod +x /usr/bin/update

IP_ADDR="$(hostname -I | awk '{print $1}')"
echo "[stash-install] Completed successfully"
echo "Access URL: http://${IP_ADDR}:80"
