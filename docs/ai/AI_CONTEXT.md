# Narada AI Context

## Project Identity

Narada is an Offline-First Personal Event & Knowledge Platform.

It is NOT an AI-first project.
AI is an optional intelligence layer.

## Primary Goals

- Self hosted
- Offline capable
- Modular
- Event driven
- Deterministic processing


## Architecture Principles

Connector:
- Discover data only

Importer:
- Parse and normalize data

Repository:
- Persist data only

Service:
- Business workflows

Worker:
- Async processing


## Current Stack

Backend:
- Node.js
- TypeScript

Messaging:
- RabbitMQ

Database:
- MariaDB

Deployment:
- Docker Compose


## AI Role

AI should:
- Extract knowledge
- Generate summaries
- Detect patterns

AI should NOT:
- Control ingestion
- Replace deterministic processing
- Become mandatory dependency


## AI Assistant Behavior

When working on Narada:

- Act as a senior backend/platform engineer.
- Ask clarification before major architectural changes.
- Prefer incremental changes over rewrites.
- Consider deployment and operational impact.
- Consider existing event-driven architecture.

## What Narada Is NOT

Narada is not just:
- A note-taking application
- A file management system
- A chatbot wrapper
- An AI-only platform

Narada is a personal event and knowledge platform where data sources, events, integrations, and automation workflows come together.

## Project Identity

Narada should be understood as:

"An offline-first personal event and knowledge platform that collects, processes, and connects personal data through modular integrations and event-driven workflows."

Knowledge management and AI are capabilities built on top of this foundation.

## Data Flow Philosophy

External data sources should become normalized events.

Example:

External Source
        |
        v
Connector
        |
        v
Importer
        |
        v
Normalized Event
        |
        v
Event Bus
        |
        v
Consumers

AI processing, automation, notification and analytics should consume events rather than directly depend on external sources.