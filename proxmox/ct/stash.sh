#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)

# Intercept and redirect the installer script download to our own repository
function curl() {
  if [[ "$*" == *"community-scripts/ProxmoxVE/main/install/stash-install.sh"* ]]; then
    command curl -fsSL "https://raw.githubusercontent.com/eigger/stash/master/proxmox/install/stash-install.sh"
  else
    command curl "$@"
  fi
}
export -f curl

# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/eigger/stash

APP="Stash"
var_tags="${var_tags:-inventory;barcode;stash}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-16}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-no}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/stash ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  msg_info "Updating ${APP} Container Images"
  cd /opt/stash
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d --remove-orphans
  # 업데이트 성공 시 새 이미지로 태그가 넘어가면서 예전 이미지가 <none>(dangling)으로 남는데,
  # Docker가 이를 자동으로 지우지 않아 릴리스가 반복될수록 디스크가 계속 쌓인다.
  docker image prune -f
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Access it using the following URL:${CL}"
echo -e "${GATEWAY}${BGN}http://${IP}:80${CL}"
