Narada is a Personal Event Intelligence Platform.

It is not intended to replace Dockge, Dozzle, Uptime Kuma, Grafana, or other infrastructure monitoring tools.

Its purpose is to collect, normalize, store, correlate, and surface meaningful personal events from self-hosted systems and digital life.

# Narada Roadmap

## Phase 1 — Foundation

### Completed

* PowerCast monitoring
* Telegram notifications
* State tracking
* Docker deployment
* Config-driven service monitoring
* Narada event model
* Notifier abstraction
* Webhook ingestion

---

## Sprint Progress

### Sprint 1

✅ Complete

### Sprint 2

✅ Complete

Completed scope:

* ✅ #6 RabbitMQ Event Bus Integration
* ✅ #7 MariaDB Event Persistence
* ✅ #8 Docker Event Source
* ✅ #9 Events Read API

### Sprint 3

Planned focus:

* Services API and service status summaries
* Events API filtering and pagination polish
* Notification persistence
* Dashboard foundation

---

## Phase 2 — Event Sources

### Completed

* Docker container monitoring
* Docker lifecycle events

### Planned

* Backup failure detection
* Multi-service configuration improvements
* Dozzle webhook/event integration

---

## Phase 3 — Event Platform

### Completed

* RabbitMQ integration
* Event processor workers
* Event persistence using the existing MariaDB Docker service
* MariaDB migration runner
* Event lifecycle persistence (received / processed / failed)
* Events Read API

### Planned

* Retry mechanisms
* Notification queueing
* Notification persistence

### Persistence Note

Narada will use the existing MariaDB instance already running in the homelab Docker stack for event persistence. SQLite is not the preferred target for this setup.

Persisted event data:

* Event ID
* Source
* Event type
* Severity
* Service ID/name
* Message
* Metadata JSON
* Created timestamp
* Processing status
* Processed timestamp

Future persisted data:

* Notification status
* Notification delivery history
* Dedicated event error message column

---

## Phase 4 — Personal Dashboard

### Planned

* Web dashboard
* Service status view
* Incident history
* Event search
* Notification history

---

## Phase 5 — Integrations

### Planned

* Home Assistant
* Uptime Kuma
* Dozzle
* Glances
* OliveTin
* Prometheus
* Paperless-ngx
* SMS Backup & Restore
* Email ingestion

---

## Phase 6 — Financial Intelligence

### Planned

* Auto-remediation workflows
* Service restart suggestions
* Backup recovery actions
* Operational playbooks

---

## Phase 7 — Personal Intelligence

### Planned

* AI-assisted diagnostics
* Failure pattern detection
* Capacity forecasting
* Infrastructure recommendations
* AI Optional
* Qdrant (self-hosted)
* Main PC worker
* Offline-first

---

## Long-Term Goal

```text
Mandara provides infrastructure.
Narada observes events.
Narada delivers messages.
```

Narada evolves into a self-hosted personal event intelligence platform.

It collects and correlates events from:
- SMS
- Email
- Paperless
- Finance
- Home Assistant
- Docker
- Webhooks

AI and RAG are optional enhancements built on top of a fully functional offline-first core.
