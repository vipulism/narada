# Deploy Narada on Mandara

This guide explains how to deploy Narada on the Mandara homelab server using Docker Compose / Dockge.

Narada should be deployed before building the dashboard so it can collect real Docker events, persist real data, and expose APIs/SSE for the dashboard.

---

## Deployment model

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

## Required files

The repository already includes:

```text
Dockerfile
docker-compose.yml
.env.example
```

This deployment also needs a runtime `services.json` file.

Use `services.example.json` as the reference structure.

---

## Required environment variables

Create these values in GitHub Actions Variables and Secrets, or provide them manually in the Dockge stack `.env` file.

```env
PORT=4000
DATABASE_URL=mariadb://narada_user:YOUR_PASSWORD@mariadb:3306/narada
RABBITMQ_URL=amqp://rabbitmq:5672
RABBITMQ_EXCHANGE=narada.events
RABBITMQ_QUEUE=narada.events.process
SERVICES_CONFIG_PATH=/app/services.json
DOCKER_SOURCE_ENABLED=true
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID
```

If Narada is not connected to the same Docker network as MariaDB and RabbitMQ, replace `mariadb` and `rabbitmq` with Mandara's LAN IP or Tailscale IP.

For the preferred Dockge setup, Narada should be attached to the same Docker network as MariaDB and RabbitMQ so container names can be used.

---

## Docker socket requirement

Docker event collection requires access to the host Docker socket.

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

This allows Narada to listen to container lifecycle events from Mandara.

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

Example structure:

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
      "id": "powercast",
      "name": "PowerCast",
      "type": "http",
      "url": "http://powercast:3000/health",
      "critical": true,
      "notifiers": ["Telegram"]
    }
  ]
}
```

---

## GitHub Actions deployment plan

Use the same pattern as PowerCast.

Recommended runner labels:

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

On every push to `main`, or manual workflow dispatch, the deployment workflow should:

1. Check out the repository
2. Create `.env` from GitHub Variables and Secrets
3. Create `services.json` from GitHub Secret `NARADA_SERVICES_JSON`
4. Sync files to `/opt/stacks/narada`
5. Run `docker compose up -d --build`
6. Run `docker compose ps`

---

## Example workflow

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
