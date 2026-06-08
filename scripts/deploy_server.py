#!/usr/bin/env python3
"""Deploy clothing ERP to remote VPS via SSH."""
import sys
import paramiko

HOST = "95.217.14.198"
USER = "root"
PASSWORD = r"pwrU\r*UGS£?8H2V$8]<qT"
REPO = "https://github.com/Akila-Eranda/clothing-ERP.git"
DEPLOY_DIR = "/opt/fashionerp"

SETUP_SCRIPT = r"""#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "==> System info"
uname -a
df -h / | tail -1

echo "==> Installing prerequisites..."
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg lsb-release

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

docker --version
docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || true

echo "==> Cloning repository..."
mkdir -p /opt
if [ -d "{deploy_dir}/.git" ]; then
  cd "{deploy_dir}"
  git pull origin main
else
  git clone {repo} "{deploy_dir}"
  cd "{deploy_dir}"
fi

echo "==> Setting up environment..."
cp .env.production .env

# Generate secure JWT secrets if still using defaults
if grep -q 'change-this-to-a-long-random-secret' .env; then
  ACCESS=$(openssl rand -hex 32)
  REFRESH=$(openssl rand -hex 32)
  sed -i "s/change-this-to-a-long-random-secret-min-32-chars/$ACCESS/" .env
  sed -i "s/change-this-to-another-long-random-secret-32-chars/$REFRESH/" .env
fi

echo "==> Creating self-signed SSL certs for nginx (replace with certbot later)..."
mkdir -p nginx/ssl/shop.hexalyte.com
mkdir -p nginx/ssl/shop.clothing.api.hexalyte.com
mkdir -p nginx/ssl/admin3.hexalyte.com
mkdir -p nginx/ssl/wildcard.shop.hexalyte.com
mkdir -p nginx/ssl/wildcard.app.hexalyte.com
mkdir -p nginx/ssl/app.hexalyte.com
mkdir -p nginx/ssl/api.shop.hexalyte.com
mkdir -p nginx/ssl/admin2.hexalyte.com

for domain in shop.hexalyte.com shop.clothing.api.hexalyte.com admin3.hexalyte.com \
  wildcard.shop.hexalyte.com wildcard.app.hexalyte.com app.hexalyte.com \
  api.shop.hexalyte.com admin2.hexalyte.com; do
  if [ ! -f "nginx/ssl/$domain/fullchain.pem" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "nginx/ssl/$domain/privkey.pem" \
      -out "nginx/ssl/$domain/fullchain.pem" \
      -subj "/CN=$domain" 2>/dev/null
  fi
done

echo "==> Building and starting containers (this may take several minutes)..."
docker compose down --remove-orphans 2>/dev/null || true
docker compose build
docker compose up -d

echo "==> Waiting for services..."
sleep 20

echo "==> Running DB migrations..."
docker compose exec -T api npx prisma migrate deploy || echo "Migration warning (may retry later)"

echo "==> Seeding database..."
docker compose exec -T api npx prisma db seed 2>/dev/null || echo "Seed skipped"

echo "==> Container status"
docker compose ps

echo "==> DONE"
""".format(deploy_dir=DEPLOY_DIR, repo=REPO)


def run_remote(client, cmd, timeout=1800):
    print(f"\n--- Running: {cmd[:120]}{'...' if len(cmd) > 120 else ''}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    return code, out, err


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "deploy"

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"Connecting to {HOST}...")
    try:
        client.connect(HOST, username=USER, password=PASSWORD, timeout=30)
    except paramiko.AuthenticationException:
        print("ERROR: Authentication failed. Check password.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Connection failed: {e}", file=sys.stderr)
        sys.exit(1)

    print("Connected successfully!")

    if action == "test":
        run_remote(client, "uname -a && docker --version 2>/dev/null; git --version")
    elif action == "deploy":
        # Write setup script to server and execute
        sftp = client.open_sftp()
        remote_script = "/tmp/deploy_clothing.sh"
        with sftp.file(remote_script, "w") as f:
            f.write(SETUP_SCRIPT)
        sftp.chmod(remote_script, 0o755)
        sftp.close()
        code, _, _ = run_remote(client, f"bash {remote_script}", timeout=3600)
        sys.exit(code)
    else:
        run_remote(client, " ".join(sys.argv[1:]))

    client.close()


if __name__ == "__main__":
    main()
