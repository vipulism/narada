# Narada Roadmap

> **Narada is evolving into an Offline-First Personal Event & Knowledge Platform.**

This roadmap focuses on long-term platform evolution rather than individual implementation tasks. GitHub Issues and Milestones track implementation details, while this document describes the strategic direction of the project.

---

# Current Status

## Current Sprint

🚧 Attention layer — not a Firefly clone

Posted ledger lives in Dhan. Narada should surface what Dhan never stores.

Current focus (see `docs/ai/current_goals/005.md`):

- Due SMS feed (`GET /knowledge?kind=due`) ✅
- Push exceptions (`GET /knowledge?kind=exception`) ✅
- Mixed `GET /timeline` (dues + infra + exceptions) ✅
- Telegram for dues / blocked pushes
- Dashboard later: Home = attention only (no Money charts)

---

# Development Phases

## Phase 1 — Monitoring Foundation ✅

The initial goal of Narada was to provide a lightweight event processing layer for the homelab.

### Completed

- Config-driven HTTP monitoring
- Telegram notifications
- State change detection
- Recovery detection
- Docker deployment
- Docker Event Source
- RabbitMQ Event Bus
- MariaDB persistence
- Event lifecycle tracking
- Notification abstraction
- Webhook ingestion
- Events API
- Services API
- Server-Sent Events (SSE)

---

## Phase 2 — Knowledge Ingestion ✅

Narada begins evolving beyond infrastructure monitoring.

Instead of observing only services, Narada now starts ingesting personal data sources.

### Completed

- SMS XML Parser
- SMS Repository
- SMS Import Service
- SMS persistence (`sms_messages`, `sms_imports`)
- Folder Connector
- Import Dispatcher
- Import Scheduler
- Duplicate detection via SMS hash

### Planned

- Generic Folder Connector reuse for non-SMS sources
- Import dashboard
- Import retries

---

## Phase 3 — Knowledge Extraction 🚧

Raw imported information becomes structured knowledge.

### Completed

- Financial SMS classification (`regex-financial@1.3.25`)
- `sms_analysis` + posted `financial_events` (owned last4 only)
- Event kinds: expense, income, bill, investment, epf, transfer
- Promotional / OTP / KYC skip templates
- Classifier name + version stored on both analysis and events

### Planned

- Reminder extraction
- Subscription detection
- Important message detection
- Knowledge event generation beyond financial SMS

---

## Phase 4 — Connector Ecosystem 🚧

Narada expands by supporting many external systems.

### Completed

- Firefly III connector (Dhan ledger push from `financial_events`)

### Planned Connectors

- Paperless-ngx
- Gmail
- Calendar
- WhatsApp Export
- Signal Export
- Bank Statements
- Browser Export
- Generic Folder Connector
- Home Assistant
- PowerCast

The Connector architecture allows every new source to reuse the same ingestion pipeline.

---

## Phase 5 — Knowledge Platform

Knowledge becomes searchable and correlated.

### Planned

- Timeline
- Knowledge API
- Full-text search
- Relationship graph
- Unified event history
- Global search
- Cross-source correlation

Examples:

- SMS ↔ Bank Statement
- Paperless ↔ Calendar
- Email ↔ Bills
- Docker ↔ Notifications

---

## Phase 6 — Intelligence

Knowledge evolves into intelligence.

### Planned

- Semantic search
- Embeddings
- Knowledge graph
- Daily summaries
- Weekly summaries
- Pattern detection
- Financial insights
- Infrastructure insights

AI is optional.

The platform must remain completely functional without AI.

---

## Phase 7 — Automation

Narada moves from observation to action.

### Planned

- Smart reminders
- Playbooks
- Notification routing
- Auto-remediation
- Scheduled workflows
- Approval-based automation
- Action recommendations

Examples:

- Upcoming insurance reminder
- Backup failure recovery suggestion
- Container restart recommendation
- Subscription renewal reminder

---

# Connector Roadmap

Current

- Docker Connector
- Webhook Connector
- Folder Connector
- Firefly III Connector (ledger push)

Future

- Paperless Connector
- Gmail Connector
- Calendar Connector
- WhatsApp Connector
- Bank Connector
- Browser Connector

---

# Importer Roadmap

Current

- SMS Importer

Future

- Paperless Importer
- Email Importer
- Bank Statement Importer
- WhatsApp Importer
- Calendar Importer

---

# API Roadmap

Current

```text
GET /events
GET /events/:id

GET /services
GET /services/stream

GET /imports
GET /imports/:id

GET /sms
GET /sms/:id

GET /knowledge
GET /knowledge/:id

GET /timeline
```

`GET /knowledge` defaults to posted `financial_events` (`type: "financial"`). `kind=due` and `kind=exception` are attention feeds. `GET /timeline` mixes dues, exceptions, and infra events.

Future

```text
GET /knowledge/search

GET /documents
```

---

# Dashboard Roadmap

Dhan (Firefly III) is the money UI. Narada dashboard, if built, is attention-only.

### Monitoring

- Service Health
- Event History
- Container Status
- Notification History

### Attention (Narada)

- Due reminders (SMS bills that never post)
- Push exceptions (blocked / unpushed)
- Last import status
- SMS inbox (classify / skip)

### Knowledge (later)

- Mixed timeline (dues + infra + exceptions)
- Documents
- Calendar

### Do not build (use Dhan)

- Transaction list
- Net worth / charts / budgets
- Account reconciliation

### Intelligence

- Daily Summary
- Weekly Summary
- Recommendations
- Insights
- Correlations

---

# Long-Term Goals

Narada should become the central knowledge platform of the homelab.

The platform should answer questions such as:

Infrastructure

- What failed?
- What recovered?
- What changed?

Knowledge

- What bills are due?
- What documents arrived?
- What subscriptions exist?
- What payments happened?

Intelligence

- What should I know today?
- What requires my attention?
- What action should I take?

---

# Guiding Principles

Every future feature should follow these principles.

- Offline First
- Self Hosted
- Connectors discover data
- Importers understand data
- Repositories persist data
- RabbitMQ distributes work
- AI is optional
- Modular architecture
- Idempotent imports
- Reusable components

---

# Success Criteria

Narada succeeds when new data sources can be integrated by implementing only:

1. A Connector
2. An Importer
3. A Repository

without requiring changes to the rest of the platform.

This keeps Narada modular, maintainable and scalable as it grows into a complete Personal Event & Knowledge Platform.

# Import Pipeline

> The Import Pipeline is responsible for transforming external data into normalized Narada domain models.

This document describes how external information enters Narada and becomes structured knowledge.

---

# Goals

The Import Pipeline is designed around the following goals:

- Offline First
- Deterministic imports
- Idempotent processing
- Separation of responsibilities
- Reusable components
- Easy integration of new data sources

---

# High-Level Flow

```text
External Source
        │
        ▼
Connector
        │
        ▼
Import Dispatcher
        │
        ▼
Importer
        │
        ▼
Repository
        │
        ▼
MariaDB
        │
        ▼
Knowledge Extraction
        │
        ▼
Knowledge Events
        │
        ▼
RabbitMQ (optional)
```

---

# Responsibilities

## Connector

Connectors discover new information.

Responsibilities:

- Discover files
- Discover documents
- Discover emails
- Trigger import requests

Connectors never:

- Parse XML
- Parse PDF
- Parse Emails
- Insert into the database
- Apply business logic

Current connectors:

- Docker Connector
- Webhook Connector
- Folder Connector

Future connectors:

- Paperless Connector
- Gmail Connector
- Calendar Connector
- WhatsApp Connector
- Bank Connector

---

## Import Dispatcher

The dispatcher determines which importer should process discovered content.

Example:

```text
New File

↓

/imports/sms/example.xml

↓

SMS Importer
```

Future example:

```text
/imports/paperless/document.pdf

↓

Paperless Importer
```

The dispatcher should not contain parsing logic.

---

## Importer

Importers understand external formats.

Responsibilities:

- Parse data
- Normalize data
- Validate data
- Coordinate persistence

Importers never:

- Poll folders
- Watch files
- Execute SQL directly

Examples:

- SMS Importer
- Paperless Importer
- Bank Importer

---

## Repository

Repositories persist normalized domain objects.

Responsibilities:

- INSERT
- UPDATE
- SELECT

Repositories never:

- Parse XML
- Discover files
- Apply business rules

Example:

```text
SmsRepository

↓

sms_messages
```

---

# SMS Import Flow

```text
Phone

↓

SMS Backup & Restore

↓

Syncthing

↓

/imports/sms

↓

Folder Connector

↓

Import Dispatcher

↓

SmsImportService

↓

smsXmlParser

↓

SmsMessage[]

↓

SmsRepository

↓

MariaDB (sms_messages)

↓

ClassifierRunner

↓

sms_analysis

↓

financial_events

↓

Firefly III (optional)
```

---

# SMS Parsing

The parser converts XML into domain models.

Input:

```text
SMS Backup XML
```

Output:

```text
SmsBackup
```

The parser is intentionally unaware of:

- SQL
- MariaDB
- RabbitMQ
- Telegram

It only understands XML.

---

# Import Service

The import service coordinates the import process.

Responsibilities:

1. Parse XML
2. Generate hashes
3. Batch messages
4. Persist messages
5. Return import statistics

Example:

```text
XML

↓

Parser

↓

Hash

↓

Batch

↓

Repository

↓

Import Result
```

---

# Duplicate Detection

Imports must be idempotent.

Narada uses a unique hash for every imported message.

```text
SMS

↓

SHA-256

↓

UNIQUE(hash)
```

The repository uses `INSERT IGNORE` so importing the same backup multiple times is safe.

---

# Import Statistics

Each import should produce statistics.

Example:

```text
Attempted : 18384

Imported : 12

Skipped : 18372

Failed : 0
```

These statistics may later be stored in an `sms_imports` table.

---

# Knowledge Extraction

Importing stores structured data.

Extraction derives meaning.

Example:

```text
SMS

↓

"Insurance premium due tomorrow"

↓

Fact

Insurance Premium

↓

Reminder

Tomorrow

↓

Knowledge Event
```

Extraction is intentionally separate from importing.

---

# Folder Connector

The Folder Connector watches configured directories.

Example Docker mount:

```yaml
volumes:
  - /mnt/data/syncthing/data/sms:/imports/sms:ro
```

Polling flow:

```text
Every 60 seconds

↓

Scan Folder

↓

New File?

↓

Dispatch Import
```

The Folder Connector is generic and reusable.

---

# Future Sources

The same pipeline should support:

- SMS
- Paperless
- Gmail
- Calendar
- WhatsApp
- Bank Statements
- Browser Exports
- OCR Results

No architectural changes should be required to support a new source.

Only these components should be added:

1. Connector (if needed)
2. Importer
3. Repository

---

# Design Principles

- Connectors discover data.
- Importers understand data.
- Repositories persist data.
- RabbitMQ distributes processed events.
- Imports must be deterministic.
- Imports must be idempotent.
- AI is optional.
- The platform remains fully functional offline.

---

# Long-Term Vision

The Import Pipeline becomes the standard ingestion mechanism for every external source integrated into Narada.

Every future integration should follow the same lifecycle:

```text
Discover

↓

Dispatch

↓

Import

↓

Persist

↓

Extract

↓

Generate Knowledge

↓

Distribute
```

This keeps Narada modular, predictable and easy to extend as the platform grows.