# Deploy Narada on Mandara

This guide explains how to deploy Narada on the Mandara homelab server using Docker Compose / Dockge.

Narada should be deployed before building the dashboard so it can collect real Docker events, persist real data, and expose APIs/SSE for the dashboard.

---

## Mandara Network Topology

Current Mandara deployment uses:

```text
MariaDB Container : mariadb
MariaDB Network   : mariadb_homelab

RabbitMQ Container: narada-rabbitmq
RabbitMQ Network  : rabbitmq_default
```

Narada should be attached to both networks.

```yaml
services:
  narada:
    networks:
      - mariadb_homelab
      - rabbitmq_default

networks:
  mariadb_homelab:
    external: true

  rabbitmq_default:
    external: true
```

Recommended runtime configuration:

```env
DATABASE_URL=mariadb://narada_user:YOUR_PASSWORD@mariadb:3306/narada
RABBITMQ_URL=amqp://narada-rabbitmq:5672
```

### Why this setup?

Mandara already hosts MariaDB and RabbitMQ in separate Docker networks:

* `mariadb_homelab`
* `rabbitmq_default`

By connecting Narada to both networks:

* MariaDB can be reached using the container name `mariadb`
* RabbitMQ can be reached using the container name `narada-rabbitmq`
* No hardcoded IP addresses are required
* Containers remain portable across restarts

This is the preferred production deployment model for Narada on Mandara.

---

## Deployment Model

```text
GitHub PR
  ↓
main branch
  ↓
GitHub Actions self-hosted runner on Mandara
  ↓
/opt/stacks/narada
  ↓
docker compose up -d --build
  ↓
Dockge manages the running stack
```

Narada runs on the same Docker host as MariaDB, RabbitMQ, Dockge and PowerCast.

---

## Required Files

The repository includes:

```text
Dockerfile
docker-compose.yml
.env.example
services.example.json
```

Deployment requires a runtime `.env` file and a runtime `services.json` file.

Do not commit the real `.env` or real `services.json` file.

---

## Docker Compose

Narada should expose the HTTP API, mount the Docker socket for Docker event collection, mount the runtime service config, and connect to the MariaDB and RabbitMQ networks.

```yaml
services:
  narada:
    build: .
    container_name: narada
    restart: unless-stopped
    ports:
      - "4000:4000"
    env_file:
      - .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./services.json:/app/services.json:ro
    networks:
      - mariadb_homelab
      - rabbitmq_default

networks:
  mariadb_homelab:
    external: true

  rabbitmq_default:
    external: true
```

---

## Required Environment Variables

Create these values in GitHub Actions Variables and Secrets, or provide them manually in the Dockge stack `.env` file.

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=mariadb://narada_user:YOUR_PASSWORD@mariadb:3306/narada
RABBITMQ_URL=amqp://narada-rabbitmq:5672
RABBITMQ_EXCHANGE=narada.events
RABBITMQ_QUEUE=narada.events.process
SERVICES_CONFIG_PATH=/app/services.json
DOCKER_SOURCE_ENABLED=true
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID
```

If Narada is not connected to the same Docker network as MariaDB and RabbitMQ, replace the container names with Mandara's LAN IP or Tailscale IP. The preferred setup is to connect Narada to both external Docker networks.

---

## Docker Socket Requirement

Docker event collection requires access to the host Docker socket.

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

This allows Narada to listen to container lifecycle events from Mandara.

Security note: Docker socket access is powerful. Keep Narada private to the homelab network and do not expose it publicly.

---

## services.json

Narada reads service monitoring configuration from:

```env
SERVICES_CONFIG_PATH=/app/services.json
```

The Docker Compose file should mount the runtime config:

```yaml
volumes:
  - ./services.json:/app/services.json:ro
```

Use `services.example.json` as the reference structure.

Example:

```json
{
  "defaults": {
    "intervalSeconds": 60,
    "timeoutMs": 5000,
    "slowThresholdMs": 2000,
    "notifiers": ["Telegram"]
  },
  "services": [
    {
      "id": "powercast-health",
      "name": "PowerCast Health",
      "type": "http",
      "url": "http://powercast:3000/health",
      "critical": true,
      "notifiers": ["Telegram"]
    }
  ]
}
```

If a monitored service is on a different Docker network, either connect Narada to that network too or use the service's LAN/Tailscale URL.

---

## GitHub Actions Deployment Plan

Use the same general pattern as PowerCast.

Recommended branch flow:

```text
feature branch -> Pull Request -> main -> deploy to Mandara
```

Recommended self-hosted runner labels:

```text
self-hosted
linux
homelab
narada
```

Recommended deploy path:

```text
/opt/stacks/narada
```

On every push to `main`, or manual `workflow_dispatch`, the deployment workflow should:

1. Check out the repository
2. Create `.env` from GitHub Variables and Secrets
3. Create `services.json` from GitHub Secret `NARADA_SERVICES_JSON`
4. Sync files to `/opt/stacks/narada`
5. Run `docker compose up -d --build`
6. Run `docker compose ps`

---

## Example Workflow

```yaml
name: Deploy Narada to Mandara

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    name: Deploy Narada
    runs-on: [self-hosted, linux, homelab, narada]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Show deployment context
        run: |
          echo "Deploying Narada"
          echo "Branch: ${{ github.ref_name }}"
          echo "Commit: ${{ github.sha }}"

      - name: Create runtime env file
        run: |
          cat > .env <<'EOF'
          NODE_ENV=production
          PORT=${{ vars.PORT }}
          DATABASE_URL=${{ secrets.NARADA_DATABASE_URL }}
          RABBITMQ_URL=${{ secrets.NARADA_RABBITMQ_URL }}
          RABBITMQ_EXCHANGE=${{ vars.RABBITMQ_EXCHANGE }}
          RABBITMQ_QUEUE=${{ vars.RABBITMQ_QUEUE }}
          SERVICES_CONFIG_PATH=/app/services.json
          DOCKER_SOURCE_ENABLED=true
          TELEGRAM_BOT_TOKEN=${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID=${{ secrets.TELEGRAM_CHAT_ID }}
          EOF

      - name: Create services config
        run: |
          cat > services.json <<'EOF'
          ${{ secrets.NARADA_SERVICES_JSON }}
          EOF

      - name: Sync files to deploy path
        run: |
          mkdir -p "${{ vars.NARADA_DEPLOY_PATH }}"
          rsync -av --delete \
            --exclude='.git' \
            --exclude='node_modules' \
            ./ "${{ vars.NARADA_DEPLOY_PATH }}/"

      - name: Deploy with Docker Compose
        run: |
          cd "${{ vars.NARADA_DEPLOY_PATH }}"
          docker compose up -d --build
          docker compose ps
```

---

## Recommended GitHub Variables

```text
PORT=4000
NARADA_DEPLOY_PATH=/opt/stacks/narada
RABBITMQ_EXCHANGE=narada.events
RABBITMQ_QUEUE=narada.events.process
```

---

## Recommended GitHub Secrets

```text
NARADA_DATABASE_URL
NARADA_RABBITMQ_URL
NARADA_SERVICES_JSON
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Recommended secret values for Mandara network deployment:

```env
NARADA_DATABASE_URL=mariadb://narada_user:YOUR_PASSWORD@mariadb:3306/narada
NARADA_RABBITMQ_URL=amqp://narada-rabbitmq:5672
```

---

## Verification

After deployment, verify:

```bash
docker logs narada
curl http://192.168.1.32:4000/health
curl http://192.168.1.32:4000/events
curl http://192.168.1.32:4000/services
curl -N http://192.168.1.32:4000/services/stream
```

Expected checks:

```text
MariaDB connected
RabbitMQ connected
Docker source started
/events returns paginated event response
/services returns latest service status
/services/stream keeps the SSE connection open
```

Also verify database persistence:

```sql
SELECT * FROM narada_events ORDER BY created_at DESC LIMIT 10;
SELECT * FROM narada_notifications ORDER BY created_at DESC LIMIT 10;
```

---

## Notes for Dockge

Dockge can manage the stack after files are synced to the deploy path.

Recommended flow:

```text
GitHub Actions updates /opt/stacks/narada
Docker Compose rebuilds and restarts Narada
Dockge shows the running stack
```

Do not commit `.env` or real `services.json` to the repository.

---

## Troubleshooting

### Narada cannot connect to MariaDB

Check:

```bash
docker network inspect mariadb_homelab
```

Make sure Narada is connected to `mariadb_homelab` and `DATABASE_URL` uses `mariadb` as the host.

### Narada cannot connect to RabbitMQ

Check:

```bash
docker network inspect rabbitmq_default
```

Make sure Narada is connected to `rabbitmq_default` and `RABBITMQ_URL` uses `narada-rabbitmq` as the host.

### Docker events are not received

Check Docker socket mount:

```bash
docker exec narada ls -l /var/run/docker.sock
```

If the socket is missing, verify the compose volume:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```
