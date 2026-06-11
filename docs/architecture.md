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

## Current Architecture — Sprint 3 In Progress

```text
HTTP Checks
Webhook Events
Docker Events
      ↓
NaradaEvent
      ↓
RabbitMQ Exchange
      ↓
Consumer Worker
      ↓
saveReceivedEvent()
      ↓
MariaDB status = received
      ↓
processEvent()
      ↓
markEventProcessed()
or
markEventFailed()
      ↓
MariaDB status = processed/failed
      ↓
Notifier Router
      ↓
TelegramNotifier
```

Webhook ingestion is supported:

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
RabbitMQ Exchange
      ↓
Consumer Worker
      ↓
MariaDB Persistence
      ↓
processEvent()
      ↓
Notifier Router
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
* RabbitMQ event bus
* MariaDB event persistence
* Docker event source
* Events Read API
* Services API
* SSE foundation for live service-status updates
* Shared `processEvent()` pipeline for scheduler and consumed events

---

## API Contracts

### Events API

The Events API exposes persisted `narada_events` data for dashboards, debugging and incident review.

#### List events

```http
GET /events
```

Sprint 2 returns the latest events.

Sprint 3 improves this endpoint with pagination and filters.

Supported query parameters:

| Query param | Type | Required | Description |
| --- | --- | --- | --- |
| `page` | number | No | Page number. Defaults to `1`. |
| `limit` | number | No | Page size. Defaults to `10`. Should be capped to a safe maximum such as `100`. |
| `status` | string | No | Filters by event processing status such as `received`, `processed`, or `failed`. |
| `type` | string | No | Filters by event type such as `SERVICE_RECOVERED`, `SERVICE_UNHEALTHY`, `CONTAINER_STARTED`, etc. |

Example requests:

```http
GET /events?page=1&limit=10
GET /events?status=processed
GET /events?status=failed&type=CONTAINER_STOPPED&page=2&limit=20
```

Expected response shape:

```json
{
  "items": [
    {
      "id": "event-id",
      "source": "docker",
      "type": "CONTAINER_STARTED",
      "severity": "info",
      "status": "processed",
      "message": "Container started",
      "created_at": "2026-06-11T10:30:00.000Z",
      "processed_at": "2026-06-11T10:30:01.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  },
  "filters": {
    "status": "processed",
    "type": "CONTAINER_STARTED"
  }
}
```

Implementation notes:

* `GET /events` should return a response object containing `items`, `pagination`, and `filters`.
* Filters should be applied in SQL using parameterized queries.
* Total count should be calculated using a separate `COUNT(*)` query with the same filters.
* `page` must never be lower than `1`.
* `limit` should be bounded to avoid accidentally returning too much data.
* Empty result sets should return `items: []`, not `404`.

#### Get event by ID

```http
GET /events/:id
```

Expected response:

```json
{
  "id": "event-id",
  "source": "manual",
  "type": "SERVICE_RECOVERED",
  "severity": "critical",
  "status": "processed",
  "message": "webhook event received",
  "created_at": "2026-06-11T10:30:00.000Z",
  "processed_at": "2026-06-11T10:30:01.000Z"
}
```

If the event does not exist:

```json
{
  "message": "Event not found"
}
```

Status code: `404`.

### Services API

```http
GET /services
GET /services/stream
```

`GET /services` returns the latest service snapshot per tracked service.

`GET /services/stream` is an SSE endpoint for one-way live service-status updates.

Initial dashboard flow:

```text
Dashboard opens
      ↓
GET /services
      ↓
Render current service cards
      ↓
Connect to GET /services/stream
      ↓
Apply live service-status updates
```

---

## Sprint 2 Target Architecture

Sprint 2 moved Narada from direct event processing to an event-bus-based platform.

```text
HTTP Checks
Docker Events
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
MariaDB Event Persistence
        ↓
processEvent()
        ↓
State Tracking
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

Narada uses the existing MariaDB Docker service already available in the homelab stack.

SQLite is not the preferred target for this setup.

MariaDB is used to persist:

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

### Current Event Lifecycle

```text
Event Published
      ↓
RabbitMQ
      ↓
Consumer
      ↓
saveReceivedEvent()
      ↓
status = received
      ↓
processEvent()
      ↓
processed OR failed
      ↓
MariaDB Persistence
```

Current persisted tables:

* schema_migrations
* narada_events
* narada_notifications

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
