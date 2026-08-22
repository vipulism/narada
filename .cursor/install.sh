#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Narada.
# Installs the MariaDB + RabbitMQ system services, project dependencies, builds
# the TypeScript sources, and generates local dev config when it is missing.
# Safe to run repeatedly and against a partially prepared / cached snapshot.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Ensuring system services (MariaDB, RabbitMQ) are installed"
if ! dpkg -s mariadb-server >/dev/null 2>&1 || ! dpkg -s rabbitmq-server >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        mariadb-server rabbitmq-server
else
    echo "    MariaDB and RabbitMQ already installed"
fi

echo "==> Installing Node dependencies (npm ci)"
npm ci

echo "==> Building TypeScript sources"
npm run build

echo "==> Generating local dev config when absent"
if [ ! -f "$REPO_ROOT/.env" ]; then
    cat > "$REPO_ROOT/.env" <<'ENV'
NODE_ENV=development
PORT=4000

DATABASE_URL=mysql://narada:narada@127.0.0.1:3306/narada
DATABASE_URL_DEV=mysql://narada:narada@127.0.0.1:3306/narada

RABBITMQ_URL=amqp://127.0.0.1:5672
RABBITMQ_EXCHANGE=narada.events
RABBITMQ_QUEUE=narada.events.process

SERVICES_CONFIG_PATH=services.json
ACCOUNTS_CONFIG_PATH=config/accounts.local.json

DOCKER_SOURCE_ENABLED=false

SLOW_THRESHOLD_MS=2000

# Optional integrations. Leave blank for local dev; the app degrades gracefully.
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

FIREFLY_URL=
FIREFLY_TOKEN=
FIREFLY_TLS_INSECURE=
ENV
    echo "    Wrote .env"
else
    echo "    .env already present"
fi

if [ ! -f "$REPO_ROOT/services.json" ]; then
    cat > "$REPO_ROOT/services.json" <<'JSON'
{
    "defaults": {
        "intervalSeconds": 30,
        "timeoutMs": 5000,
        "slowThresholdMs": 2000,
        "notifiers": ["telegram"]
    },
    "services": [
        {
            "name": "Narada Self Health",
            "id": "narada-self-health",
            "type": "http",
            "url": "http://127.0.0.1:4000/health",
            "critical": true
        }
    ]
}
JSON
    echo "    Wrote services.json"
else
    echo "    services.json already present"
fi

# The Folder Connector scans this path for SMS XML imports.
mkdir -p /imports/sms 2>/dev/null || sudo mkdir -p /imports/sms
sudo chown -R "$(id -un)":"$(id -gn)" /imports/sms 2>/dev/null || true

echo "==> Install complete"
