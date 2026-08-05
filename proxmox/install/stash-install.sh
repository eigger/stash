#!/usr/bin/env bash
set -euo pipefail

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/stash
#
# compose/Caddyfile/update.sh는 heredoc으로 복제하지 않는다 — 저장소 파일을 내려받는다.
# 한쪽만 고치면 기존 LXC에 영원히 안 닿아 v0.7.x처럼 api가 크래시 루프에 빠진다.

export DEBIAN_FRONTEND=noninteractive
APT_QUIET_FLAGS=(-y -qq -o=Dpkg::Use-Pty=0)

STASH_DIR=/opt/stash
STASH_REPO="${STASH_REPO:-eigger/stash}"

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

echo "[stash-install] Preparing ${STASH_DIR}"
mkdir -p "$STASH_DIR"
cd "$STASH_DIR"

# 이미지는 :latest(최신 릴리스)이므로 배포 파일도 같은 릴리스 태그에서 받는다.
# STASH_REF로 덮어쓰면 master 등에서 시험 설치할 수 있다. API 실패 시 임의 폴백 금지.
resolve_ref() {
  if [[ -n "${STASH_REF:-}" ]]; then
    echo "$STASH_REF"
    return
  fi
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/${STASH_REPO}/releases/latest" | jq -r .tag_name)"
  if [[ -z "$tag" || "$tag" == "null" ]]; then
    echo "[stash-install] Failed to resolve latest release tag (set STASH_REF to override)" >&2
    exit 1
  fi
  echo "$tag"
}

STASH_REF_RESOLVED="$(resolve_ref)"
RAW_BASE="https://raw.githubusercontent.com/${STASH_REPO}/${STASH_REF_RESOLVED}"
echo "[stash-install] Fetching deploy files from ${STASH_REF_RESOLVED}"

download() {
  local rel="$1"
  local dest="$2"
  curl -fsSL "${RAW_BASE}/${rel}" -o "$dest"
  if [[ ! -s "$dest" ]]; then
    echo "[stash-install] Empty download: ${rel}" >&2
    exit 1
  fi
}

download docker-compose.prod.yml "${STASH_DIR}/docker-compose.prod.yml"
download Caddyfile "${STASH_DIR}/Caddyfile"
download proxmox/install/update.sh "${STASH_DIR}/update.sh.tmp"
download proxmox/install/stash.service /etc/systemd/system/stash.service

if ! bash -n "${STASH_DIR}/update.sh.tmp"; then
  echo "[stash-install] update.sh failed syntax check" >&2
  exit 1
fi
install -m 0755 "${STASH_DIR}/update.sh.tmp" /usr/bin/update
rm -f "${STASH_DIR}/update.sh.tmp"

if ! docker compose -f "${STASH_DIR}/docker-compose.prod.yml" config -q; then
  echo "[stash-install] docker-compose.prod.yml failed validation" >&2
  exit 1
fi

{
  echo "compose $(sha256sum "${STASH_DIR}/docker-compose.prod.yml" | awk '{print $1}')"
  echo "caddy $(sha256sum "${STASH_DIR}/Caddyfile" | awk '{print $1}')"
  echo "ref ${STASH_REF_RESOLVED}"
} >"${STASH_DIR}/.stash-manifest"

echo "[stash-install] Generating .env secrets"
POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
IP_ADDR_EARLY="$(hostname -I | awk '{print $1}')"
cat <<EOF >"${STASH_DIR}/.env"
GH_REPOSITORY_OWNER=eigger
POSTGRES_USER=stash
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=stash
JWT_SECRET=${JWT_SECRET}
APP_PUBLIC_URL=http://${IP_ADDR_EARLY}
UPCITEMDB_API_KEY=
INVENTORY_WEBHOOK_URL=

# HTTPS로 서비스할 때 미디어 쿠키에 Secure 플래그를 켜려면 주석을 해제하세요
# COOKIE_SECURE=true
EOF

systemctl daemon-reload
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

IP_ADDR="$(hostname -I | awk '{print $1}')"
echo "[stash-install] Completed successfully (ref ${STASH_REF_RESOLVED})"
echo "Access URL: http://${IP_ADDR}:80"
echo "Later updates: run 'update' inside this container"
