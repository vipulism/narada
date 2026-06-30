# Narada Architecture

> **Narada is an Offline-First Personal Event & Knowledge Platform.**

---

# Vision

Narada is not intended to replace infrastructure monitoring tools such as:

- Uptime Kuma
- Dozzle
- Glances
- Grafana
- Dockge
- OliveTin
- Docker Events

These systems are responsible for **producing operational signals**.

Narada's responsibility begins **after a signal or piece of information exists**.

Narada listens, discovers, imports, normalizes, stores, correlates and delivers meaningful information.

Over time Narada evolves into the central intelligence layer of the homelab.

---

# Philosophy

Narada is built around three major ideas.

1. Infrastructure produces signals.
2. Connectors discover information.
3. Intelligence is created after data is normalized.

Unlike traditional monitoring systems, Narada is equally interested in:

- Infrastructure events
- Personal knowledge
- Financial information
- Documents
- Messages
- Notifications
- Historical context

Everything eventually becomes a normalized event or knowledge object.

---

# Core Principles

## 1. Offline First

Narada must continue working without Internet connectivity.

Cloud AI, hosted APIs and external services are optional enhancements.

The core platform must always remain fully functional offline.

---

## 2. Self Hosted

Every major component should be capable of running inside the homelab.

Examples:

- MariaDB
- RabbitMQ
- Qdrant (future)
- Ollama (future)
- Telegram Bot
- Docker

---

## 3. Discovery and Processing are Different Problems

Narada intentionally separates:

- discovering information
- understanding information

This separation keeps the architecture modular and scalable.

---

## 4. Every External System Uses a Connector

Narada never couples business logic directly to external systems.

Instead every integration is implemented as a Connector.

Examples include:

- Folder Connector
- Docker Connector
- Webhook Connector
- Paperless Connector
- Gmail Connector
- Calendar Connector
- WhatsApp Connector

---

## 5. Every External Format Uses an Importer

Different data formats require different parsing logic.

Narada keeps parsing isolated inside Importers.

Examples:

- SMS XML Importer
- Paperless Importer
- Bank Statement Importer
- Email Importer

---

## 6. Business Logic Never Lives Inside Connectors

Connectors never understand XML.

Connectors never understand PDF.

Connectors never understand Email.

Their only responsibility is discovering that something new exists.

---

## 7. RabbitMQ Is Not an Import Mechanism

RabbitMQ exists to distribute work.

It is intentionally **not** responsible for discovering files.

It is intentionally **not** responsible for importing XML.

Imports happen first.

Events are published afterwards.

---

# High Level Architecture

Narada currently contains two independent pipelines.

1. Monitoring Pipeline
2. Knowledge Ingestion Pipeline

These pipelines eventually converge into a shared intelligence layer.

```text
                   Monitoring

HTTP Checks
Docker Events
Webhook Events
       │
       ▼
 RabbitMQ
       ▼
 Event Worker
       ▼
 processEvent()
       ▼
 Notifications


            Knowledge Ingestion

SMS Backup
Paperless
Email
Calendar
Future Sources
       │
       ▼
 Connectors
       ▼
 Import Dispatcher
       ▼
 Importers
       ▼
 Repositories
       ▼
 MariaDB
       ▼
 Knowledge Extraction
       ▼
 RabbitMQ (optional)
       ▼
 Dashboard / AI / Notifications
```

---

# Connector Architecture

Connectors are responsible only for discovering new information.

A Connector should never:

- Parse XML
- Parse PDF
- Parse Emails
- Generate domain models
- Persist data
- Apply business rules

Its responsibility ends after discovering something new.

---

## Connector Lifecycle

Every connector follows the same lifecycle.

```text
Start
   │
Discover New Data
   │
Generate Import Request
   │
Dispatch
   │
Wait
```

The connector never knows how the imported data will eventually be processed.

---

## Current Connectors

### Docker Connector

Responsible for:

- Listening to Docker lifecycle events
- Creating Narada events

Produces:

- Container Started
- Container Stopped
- Container Restarted

---

### Webhook Connector

Responsible for accepting HTTP events from external systems.

Flow:

```text
External System
        │
 POST /events
        │
 Payload Validation
        │
 NaradaEvent
        │
 RabbitMQ
```

---

### Folder Connector (Sprint 4)

The Folder Connector is the first connector for knowledge ingestion.

Docker mounts host folders into Narada as read-only volumes.

Example:

```yaml
volumes:
  - /mnt/data/syncthing/data/sms:/imports/sms:ro
```

The connector periodically scans configured folders.

```text
Folder
    │
New File
    │
Dispatch Import
```

The connector intentionally does **not** understand XML.

It only knows:

- file path
- file type
- modified time

---

## Future Connectors

Planned connectors include:

- Paperless Connector
- Gmail Connector
- Calendar Connector
- WhatsApp Connector
- Bank Connector
- Browser Export Connector
- Generic Folder Connector

All connectors follow the exact same contract.

---

# Import Architecture

Importers transform external data into Narada domain models.

Importers own:

- parsing
- validation
- normalization
- persistence orchestration

Importers never discover files.

---

## Import Pipeline

```text
Connector
      │
Import Request
      │
Import Dispatcher
      │
Importer
      │
Repository
      │
MariaDB
```

---

## SMS Import Pipeline

The SMS importer converts SMS Backup & Restore XML into structured records.

```text
SMS XML
     │
     ▼
smsXmlParser
     ▼
SmsImportService
     ▼
sms.repository
     ▼
MariaDB
```

The parser is intentionally database agnostic.

It produces only domain models.

The repository is intentionally parser agnostic.

It only persists data.

---

## Import Dispatcher

The dispatcher selects the appropriate importer based on the discovered content.

Future flow:

```text
Connector
      │
      ▼
Import Dispatcher
      │
 ┌────┴─────────────┐
 │                  │
 ▼                  ▼
SMS             Paperless
Importer         Importer
 │                  │
 ▼                  ▼
Repository      Repository
```

This allows Narada to support many different data sources without coupling discovery to parsing.

---

# Repository Layer

Repositories are responsible only for persistence.

Repositories never:

- Parse XML
- Calculate business rules
- Discover files
- Generate notifications

Their responsibility is limited to database access.

Examples:

```text
SmsRepository
EventRepository
NotificationRepository
ServiceRepository
```

---

## Repository Contract

Repositories should expose operations using domain language.

Example:

```text
insertMany()

findById()

findRecent()

findByHash()

updateStatus()
```

Business decisions belong in Services.

---

# Event Processing Pipeline

Monitoring events and imported knowledge eventually converge into the same processing pipeline.

```text
Monitoring Event
         │
         ▼
RabbitMQ
         ▼
Worker
         ▼
processEvent()
         ▼
Notification Router
```

Imported knowledge follows a slightly different path.

```text
Import
    │
Persist
    │
Knowledge Extracted
    │
(Optional)
RabbitMQ
    │
Workers
```

RabbitMQ exists to distribute downstream work.

It is intentionally **not** responsible for importing data.

---

# Persistence Strategy

Narada uses the existing MariaDB instance running inside the homelab.

SQLite is intentionally not used.

Current persisted tables:

```text
schema_migrations

narada_events

narada_notifications
```

Knowledge tables:

```text
sms_messages

sms_imports

sms_extractions

knowledge_events
```

Future tables:

```text
paperless_documents

email_messages

calendar_events

knowledge_embeddings
```

---

# SMS Persistence

SMS records are intentionally stored before any AI or extraction step.

```text
XML

↓

Structured SMS

↓

sms_messages

↓

Extraction

↓

Knowledge Events
```

This ensures:

- repeatable imports
- deterministic processing
- offline capability
- future re-processing without needing the original XML

---

# Knowledge Extraction

Knowledge extraction is independent from importing.

Importing answers:

> "What data exists?"

Extraction answers:

> "What does this data mean?"

Example:

SMS

```text
Insurance premium due tomorrow.

↓

Fact

Insurance Premium

↓

Reminder

Tomorrow

↓

Knowledge Event

Upcoming Bill
```

The raw SMS always remains preserved.

Extracted facts can be regenerated in the future as extraction models improve.

---

# RabbitMQ Responsibilities

RabbitMQ distributes work.

Examples:

- Notification delivery
- AI extraction
- Dashboard refresh
- Future automation

RabbitMQ intentionally does **not**:

- monitor folders
- import XML
- parse PDFs
- read emails

This keeps ingestion deterministic while allowing asynchronous downstream processing.

---

# API Layer

Narada exposes APIs for both monitoring and knowledge domains.

Current APIs:

```text
GET /services

GET /services/stream

GET /events

GET /events/:id
```

Future APIs:

```text
GET /sms

GET /sms/:id

GET /knowledge

GET /knowledge/search

GET /timeline

GET /documents

GET /imports
```

The API layer never contains business logic.

Controllers delegate work to Services.

Services coordinate repositories.

Repositories interact with MariaDB.

---

# Current Source Structure

```text
src/

checks/
config/

connectors/
│
├── docker/
├── webhook/
└── folder/              (Sprint 4)

db/

events/

importers/
│
├── sms/
│   ├── sms.model.ts
│   ├── smsXmlParser.ts
│   ├── smsImport.service.ts
│   └── sms.repository.ts
│
├── paperless/           (future)
├── email/               (future)
└── bank/                (future)

middlewares/

notifiers/

queue/

repositories/

schedulers/

server/

sources/

state/
```

This structure separates responsibilities by domain rather than technology.

---

# Current Capabilities

Narada currently supports:

- Config-driven HTTP monitoring
- Docker event monitoring
- Webhook ingestion
- RabbitMQ event distribution
- MariaDB event persistence
- Telegram notifications
- Event APIs
- Services APIs
- SSE updates
- Scheduler-based health checks

Knowledge ingestion currently includes:

- SMS XML parsing
- SMS normalization
- SMS persistence (Sprint 4)

---

# Future Capabilities

Planned capabilities include:

Monitoring

- Backup monitoring
- UPS monitoring
- Network monitoring
- Home Assistant integrations

Knowledge

- Paperless ingestion
- Gmail ingestion
- Calendar ingestion
- WhatsApp exports
- Bank statements
- OCR pipelines

Intelligence

- Fact extraction
- Reminder generation
- Timeline generation
- Semantic search
- Embeddings
- RAG
- AI summaries

Automation

- Playbooks
- Auto-remediation
- Notification routing
- Workflow execution

---

# Design Goals

Every major architectural decision should satisfy the following goals.

## Modularity

Every feature should exist in its own domain.

Adding a Paperless importer should not require changes to the SMS importer.

---

## Testability

Every layer should be independently testable.

Parser tests should not require a database.

Repository tests should not require XML.

Connector tests should not require business logic.

---

## Scalability

New connectors should be added without modifying existing importers.

New importers should be added without modifying existing connectors.

---

## Reusability

The same Folder Connector should work for:

- SMS
- Paperless
- CSV imports
- Documents
- Images
- Future sources

---

## Deterministic Imports

Running the same import twice must produce the same final state.

Duplicate detection belongs to persistence.

Imports should always be idempotent.

---

# Long-Term Vision

Narada is evolving into the central intelligence platform of the homelab.

Infrastructure is only one source of information.

Over time Narada will continuously ingest, normalize and correlate information from many different domains.

```text
Infrastructure
        │
        ▼
HTTP Checks
Docker
Webhooks
PowerCast
        │
        │
        ▼
       Events
        │
        │
        ▼
     Intelligence
```

```text
Knowledge Sources
        │
        ▼
SMS
Paperless
Email
Calendar
Bank Statements
WhatsApp
Documents
Images
        │
        ▼
     Connectors
        │
        ▼
     Importers
        │
        ▼
     Knowledge
        │
        ▼
 Intelligence Layer
```

Both eventually converge into a single platform.

```text
               Monitoring

HTTP
Docker
Webhooks
PowerCast
       │
       ▼
 Monitoring Events
       │
       ├────────────────────┐
       │                    │
       ▼                    ▼

               Narada

       ▲                    ▲
       │                    │
       └────────────────────┤

SMS
Paperless
Email
Calendar
Bank
WhatsApp
Documents
       │
       ▼
 Knowledge Objects
```

Narada becomes responsible for answering questions such as:

Infrastructure

- What failed?
- What recovered?
- What changed?
- What needs attention?

Knowledge

- What bills are due?
- What subscriptions exist?
- What payments happened?
- What documents arrived?
- What reminders should be created?

Intelligence

- What changed today?
- What is important?
- What should I be notified about?
- What action should be taken?

---

# Architecture Decision Summary

The following architectural decisions are intentionally enforced throughout the project.

## Connectors

Responsible for discovering new data.

Never parse.

Never persist.

Never apply business logic.

---

## Importers

Responsible for understanding external formats.

They convert external data into Narada domain models.

---

## Repositories

Responsible only for persistence.

No business rules.

No parsing.

---

## Services

Coordinate business workflows.

Examples:

- SmsImportService
- EventProcessor
- NotificationRouter

---

## Workers

Perform asynchronous processing.

Examples:

- RabbitMQ Consumer
- Future AI Workers
- Future Extraction Workers

---

## Domain Objects

Narada stores structured domain models rather than raw files whenever possible.

Examples include:

- SMS Message
- Knowledge Event
- Monitoring Event
- Notification
- Service Status

Raw source material may also be preserved for future re-processing.

---

# Future Documentation

As Narada grows, additional documentation should be maintained separately.

```text
docs/

architecture.md

roadmap.md

import-pipeline.md

database.md

api.md

connectors.md

deployment.md

adr/
```

Architecture Decision Records (ADR) should document every major architectural decision made during the evolution of the platform.

Examples:

```text
ADR-0001 Offline First

ADR-0002 RabbitMQ Event Bus

ADR-0003 Connector Architecture

ADR-0004 Import Pipeline

ADR-0005 Knowledge Extraction
```

---

# Closing Statement

Narada is not a monitoring tool.

Narada is not an AI project.

Narada is an **Offline-First Personal Event & Knowledge Platform**.

Monitoring systems produce signals.

Connectors discover information.

Importers understand information.

Repositories persist information.

Workers generate intelligence.

Notifications deliver what matters.

AI enhances the platform, but the platform never depends on AI to remain useful.
