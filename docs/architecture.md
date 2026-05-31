# Narada Architecture

## Vision

Narada is not intended to replace monitoring tools such as:

* Uptime Kuma
* Dozzle
* Glances
* OliveTin
* Docker events

Instead, Narada acts as the event processing, notification and decision layer of the homelab ecosystem.

Narada's role is to listen, normalize, decide and deliver.

---

## Current Architecture — Sprint 1 Complete

```text
services.json
      ↓
Scheduler
      ↓
HTTP Checks
      ↓
NaradaEvent
      ↓
processEvent()
      ↓
State Tracking
      ↓
Notifier Router
      ↓
TelegramNotifier
```

Webhook ingestion is also supported:

```text
External Source
      ↓
POST /events
      ↓
Payload Validation
      ↓
createWebhookEvent()
      ↓
NaradaEvent
      ↓
processEvent()
      ↓
State Tracking
      ↓
Notifier Router
      ↓
TelegramNotifier
```

Current capabilities:

* Config-driven HTTP service monitoring
* NaradaEvent domain model
* State change detection
* First-run alert suppression
* Recovery detection through state transitions
* Notifier abstraction
* Telegram notifier
* Webhook ingestion endpoint
* Shared `processEvent()` pipeline for scheduler and webhook events

---

## Sprint 2 Target Architecture

Sprint 2 moves Narada from direct event processing to an event-bus-based platform.

```text
HTTP Checks
Docker Events
Dozzle Events
Webhook Events
Backup Scripts
Custom Scripts
        ↓
RabbitMQ Exchange
        ↓
Queues
        ↓
Narada Worker / Consumer
        ↓
processEvent()
        ↓
State Tracking
        ↓
MariaDB Event Persistence
        ↓
Notifier Router
        ↓
Telegram / Future Notifiers
```

The important rule is:

```text
Sources publish events.
Workers consume events.
processEvent() remains the shared decision pipeline.
```

RabbitMQ should not replace `processEvent()`.
It should only decouple event ingestion from event processing.

---

## Persistence Strategy

Narada will use the existing MariaDB Docker service already available in the homelab stack.

SQLite is not the preferred target for this setup.

MariaDB will be used to persist:

* Event ID
* Event source
* Event type
* Severity
* Service ID and service name
* Message
* Metadata JSON
* Created timestamp
* Processing status
* Notification status

This persistence layer will support future APIs and dashboard views.

---

## Responsibilities

### Monitoring and Source Tools

Responsible for collecting or emitting raw signals.

Examples:

* Uptime Kuma → Service uptime alerts
* Dozzle → Container/log-related events
* Glances → System metrics
* Docker → Container lifecycle events
* PowerCast → Energy and Home Assistant health
* Backup scripts → Backup success/failure events
* OliveTin → Operational action triggers

### Narada

Responsible for:

* Event normalization
* Event routing
* Deduplication
* State change detection
* Severity handling
* Recovery detection
* Notification routing
* Persistence
* Future incident history

Narada answers:

* What happened?
* Is this important?
* Has this already been reported?
* Is this a recovery event?
* Should this be persisted?
* Who should be notified?

---

## Event Flow Examples

### Current HTTP Check Flow

```text
PowerCast Health Check
      ↓
runHttpChecks()
      ↓
NaradaEvent
      ↓
processEvent()
      ↓
State Tracking
      ↓
Telegram Notification only if state changed
```

### Current Webhook Flow

```text
External Tool
      ↓
POST /events
      ↓
validateWebhookEventPayload
      ↓
createWebhookEvent()
      ↓
processEvent()
      ↓
Notifier Router
```

### Sprint 2 RabbitMQ Flow

```text
Webhook / Docker / Dozzle / Script
      ↓
Publish NaradaEvent
      ↓
RabbitMQ
      ↓
Consumer Worker
      ↓
processEvent()
      ↓
MariaDB + Notifiers
```

---

## Design Principles

* Event-driven
* Lightweight
* Self-hosted first
* Homelab friendly
* Source-agnostic
* Notification focused
* Storage-backed when needed
* Extensible through adapters

---

## Non-Goals For Now

* Replacing Uptime Kuma, Dozzle or Glances
* Building a full observability stack
* Heavy distributed architecture
* Kubernetes-first deployment
* Over-engineered event sourcing

Narada should stay small, practical and useful for a self-hosted homelab.