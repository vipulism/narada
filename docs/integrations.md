# Integrations

## PowerCast

Monitors API health, latency and Home Assistant connectivity.

---

## Uptime Kuma

Consumes uptime and service availability events.

---

## Dozzle

Consumes container logs and lifecycle alerts.

---

## Glances

Consumes CPU, memory, disk and system metrics.

---

## OliveTin

Provides operational actions such as:

- Run backups
- Restart services
- Maintenance tasks

---

## Home Assistant

Receives notifications and automation events from Narada.

---

## RabbitMQ

Provides asynchronous event processing and reliable delivery.

---

## Telegram

Service health change alerts, plus attention digests after SMS ingest:

- New card/bill **dues** (not payment acks), with due date and remaining / overdue days when parsed
- **New** Firefly blocked pushes, then **still blocked** once on the next scan
- **Daily** at 08:00 IST: unpaid dues; Dhan this month vs last month income/expense; SMS **spend buckets** (groceries, dining, shopping, education, plus any buckets you add on Merchants — from a per-SMS override, else the Merchants map, else keywords) and top/large merchants vs the same days last month. No balances. Not on Home. A late cron tick or a restart after 08:00 still sends once (next ingest), then is recorded so deploys do not double-send. Home **Send digest** / `POST /attention/digest` sends the same message immediately.

No spend summaries on the ingest pings (Dhan remains the ledger UI). First scan seeds ids and does not send. Skipped (before opening) rows are not alerted.

---

## Firefly III (Dhan)

Receives posted financial events from Narada.

Narada maps owned last4 accounts, skips rows before each account's ledger opening, and POSTs withdrawals / deposits / transfers. Withdrawals include `category_name` from a per-SMS override first, then the Narada merchant map (Merchants page), then SMS keyword buckets (Groceries, Dining, Shopping, Education, … plus custom bucket names); Firefly creates the category if it is missing. Push is idempotent via `external_id` (`narada-sms-{smsId}`). Already-pushed journal ids are kept on `financial_events` when events are rebuilt. Old Dhan withdrawals get a category when you apply from the Merchants page (`PUT` `category_name` on the stored journal id).

Required env:

```env
FIREFLY_URL=
FIREFLY_TOKEN=
FIREFLY_TLS_INSECURE=
ACCOUNTS_CONFIG_PATH=config/accounts.local.json
```

CLI:

```text
npm run sms:firefly-map
npm run sms:firefly-push
```
