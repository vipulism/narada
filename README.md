# Narada (नारद)

> Messenger of the Homelab

Narada is an event-driven monitoring and alerting system designed for homelabs and self-hosted infrastructure.

Inspired by Narada — the divine messenger from Hindu mythology — this project acts as the communication layer between services, infrastructure, failures and notifications.

![Narada monitoring PowerCast and sending Telegram alerts](docs/assets/narada-preview.png)

---

## Features

* PowerCast API uptime and latency monitoring
* Telegram notifications (failure, slow, recovery)
* Per-endpoint state tracking and deduplicated alerts
* Configurable slow-response threshold
* Lightweight Node.js + TypeScript architecture
* Docker deployment via Compose

---

## Current Monitoring

PowerCast endpoints:

* `/health`
* `/status/home-assistant`
* `/usage/today`

States:

* Healthy
* Slow
* Failed

Narada sends notifications only when state changes occur.

---

## Documentation

* [Architecture](docs/architecture.md)
* [Roadmap](docs/roadmap.md)
* [Integrations](docs/integrations.md)

---

## Quick Start

```bash
git clone https://github.com/vipulism/narada.git
cd narada

cp .env.example .env

npm install
npm run dev
```

Or run with Docker:

```bash
docker compose up -d --build
```

---

## Philosophy

```text
Mandara churns the ocean.
Narada carries the message.
Halahal warns of failure.
Amrit represents stable infrastructure.
```
