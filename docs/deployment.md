# Deploy Narada on Mandara

This guide explains how to deploy Narada on the Mandara homelab server using Docker Compose / Dockge.

Narada should be deployed before building the dashboard so it can collect real Docker events, persist real data, and expose APIs/SSE for the dashboard.

## Mandara network topology

Current Mandara deployment uses:

```text
MariaDB Container : mariadb
MariaDB Network   : mariadb_homelab

RabbitMQ Container: narada-rabbitmq
RabbitMQ Network  : rabbitmq_default
```

Narada should be attached to both networks.

Recommended docker-compose configuration:

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

---

The remainder of this document describes deployment, GitHub Actions, services.json configuration, verification and Dockge usage.

Refer to the repository history for the full deployment guide content added in this sprint.
