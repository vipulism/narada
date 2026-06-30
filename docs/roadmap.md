# Narada Roadmap

> **Narada is evolving into an Offline-First Personal Event & Knowledge Platform.**

This roadmap focuses on long-term platform evolution rather than individual implementation tasks. GitHub Issues and Milestones track implementation details, while this document describes the strategic direction of the project.

---

# Current Status

## Current Sprint

🚧 Sprint 4 — Knowledge Ingestion

Current focus:

- SMS XML Parser
- SMS Repository
- SMS Import Service
- Folder Connector
- Import Dispatcher

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

## Phase 2 — Knowledge Ingestion 🚧

Narada begins evolving beyond infrastructure monitoring.

Instead of observing only services, Narada now starts ingesting personal data sources.

### Current

- SMS XML Parser
- SMS Repository
- SMS Import Service
- SMS persistence
- Folder Connector
- Import Dispatcher
- Import Scheduler

### Planned

- Generic Folder Connector
- Import history
- Import statistics
- Import retries
- Duplicate detection improvements
- Import dashboard

---

## Phase 3 — Knowledge Extraction

Raw imported information becomes structured knowledge.

### Planned

- Financial transaction extraction
- Bill detection
- Reminder extraction
- Subscription detection
- OTP classification
- Promotional SMS filtering
- Important message detection
- Knowledge event generation

---

## Phase 4 — Connector Ecosystem

Narada expands by supporting many external systems.

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
```

Future

```text
GET /imports

GET /sms

GET /knowledge

GET /timeline

GET /documents

GET /search
```

---

# Dashboard Roadmap

### Monitoring

- Service Health
- Event History
- Container Status
- Notification History

### Knowledge

- SMS Timeline
- Financial Timeline
- Documents
- Bills
- Upcoming Payments
- Calendar

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

MariaDB
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