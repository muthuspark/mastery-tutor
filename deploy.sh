#!/usr/bin/env bash
# Deploy this checkout to the existing mastery-tutor systemd service.
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

exec 9>.git/deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

service=mastery-tutor
health_url=http://127.0.0.1:3000/login
stage=".next-deploy-$(date +%Y%m%d%H%M%S)-$$"
backup=".next-backup-$(date +%Y%m%d%H%M%S)-$$"
config_backup=''
switching=0
had_build=0

if (( EUID == 0 )); then
  echo 'Run as the checkout owner, without sudo; service commands use sudo.' >&2
  exit 1
fi
sudo -n true

restore_config() {
  if [[ -n "$config_backup" ]]; then
    cp -- "$config_backup/tsconfig.json" tsconfig.json
    cp -- "$config_backup/next-env.d.ts" next-env.d.ts
    rm -rf -- "$config_backup"
    config_backup=''
  fi
}

cleanup() {
  local status=$?
  trap - EXIT
  restore_config
  if (( status != 0 && switching )); then
    echo 'Deployment failed; restoring the previous build.' >&2
    sudo -n systemctl stop "$service" || true
    # A retained backup proves the previous build was moved successfully.
    if [[ -d "$backup" ]]; then
      if [[ -d .next ]]; then mv -- .next "$stage.failed"; fi
      mv -- "$backup" .next
    fi
    if (( had_build )); then sudo -n systemctl start "$service" || true; fi
  fi
  if [[ -d "$stage" ]]; then rm -rf -- "$stage"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo 'Pulling latest code...'
git pull --ff-only
npm ci

# Next.js updates these files when using a custom build directory.
config_backup=$(mktemp -d)
cp -- tsconfig.json next-env.d.ts "$config_backup/"
NEXT_DIST_DIR="$stage" npm run build
restore_config

echo 'Activating new build...'
[[ ! -d .next ]] || had_build=1
switching=1
sudo -n systemctl stop "$service"
if (( had_build )); then mv -- .next "$backup"; fi
mv -- "$stage" .next
# The service applies database migrations in ExecStartPre.
sudo -n systemctl start "$service"

healthy=0
for (( attempt=0; attempt<30; attempt++ )); do
  if systemctl is-active --quiet "$service" &&
    curl --fail --silent --output /dev/null --max-time 2 "$health_url"; then
    healthy=1
    break
  fi
  sleep 1
done
if (( ! healthy )); then
  echo 'Health check failed. Inspect: journalctl -u mastery-tutor -n 50' >&2
  exit 1
fi
switching=0
echo "Deployed $(git rev-parse --short HEAD) successfully."
if (( had_build )); then echo "Previous build retained at $backup"; fi
