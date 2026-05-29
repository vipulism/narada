# Narada Architecture

## Vision

Narada is not intended to replace monitoring tools such as:

* Uptime Kuma
* Dozzle
* Glances
* OliveTin

Instead, Narada acts as the event processing, notification and decision layer of the homelab ecosystem.

---

## Current Architecture

```text
PowerCast
    ↓
Health Checks
    ↓
Narada
    ↓
Telegram
```

Current capabilities:

* API monitoring
* Response time tracking
* State change detection
* Telegram notifications

---

## Future Architecture

```text
Uptime Kuma
Dozzle
Glances
OliveTin
Docker
PowerCast

      ↓

 Narada Ingest API

      ↓

 Event Processor

      ↓

 RabbitMQ

      ↓

 Workers

      ↓

 Telegram
 Email
 Home Assistant
 Dashboard
```

---

## Responsibilities

### Monitoring Tools

Responsible for collecting data.

Examples:

* Uptime Kuma → Service uptime
* Dozzle → Container logs
* Glances → System metrics
* Docker → Container state
* PowerCast → Energy & Home Assistant health

### Narada

Responsible for:

* Event normalization
* Deduplication
* Severity classification
* Recovery detection
* Notification routing
* Incident creation

Narada answers:

* Is this important?
* Has this already been reported?
* Is this a recovery event?
* Who should be notified?

---

## Event Flow

```text
Container Stops
      ↓
Dozzle Alert
      ↓
Narada Event
      ↓
RabbitMQ
      ↓
Worker
      ↓
Telegram Notification
```

---

## Design Principles

* Event-driven
* Lightweight
* Self-hosted first
* Extensible
* Notification focused
* Homelab friendly
