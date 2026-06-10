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

✅ #6 RabbitMQ Event Bus Integration

✅ #7 MariaDB Event Persistence

⏳ #8 Docker and Dozzle Event Sources

⏳ #9 Events and Services API


## Phase 2 — Infrastructure Awareness

### Planned

* Docker container monitoring
* Docker lifecycle events
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

### Planned

* Retry mechanisms
* Notification queueing
* Notification persistence

### Persistence Note

Narada will use the existing MariaDB instance already running in the homelab Docker stack for event persistence. SQLite is not the preferred target for this setup.

Potential persisted data:

* Event ID
* Source
* Event type
* Severity
* Service ID/name
* Message
* Metadata JSON
* Created timestamp
* Notification status

---

## Phase 4 — Operations Dashboard

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

---

## Phase 6 — Automation

### Planned

* Auto-remediation workflows
* Service restart suggestions
* Backup recovery actions
* Operational playbooks

---

## Phase 7 — Intelligence

### Planned

* AI-assisted diagnostics
* Failure pattern detection
* Capacity forecasting
* Infrastructure recommendations

---

## Long-Term Goal

```text
Mandara provides infrastructure.
Narada observes events.
Narada delivers messages.
Narada assists operations.
```

Narada evolves from a monitoring script into an event-driven observability platform for self-hosted infrastructure.