# HTTP API

Narada listens on `PORT` (default `4000`). Live: `http://192.168.1.32:4000`.

No authentication. Homelab LAN only. JSON is camelCase.

List endpoints share this envelope:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 },
  "filters": {}
}
```

Query: `page` (default 1), `limit` (default 10, max 100).

Missing `:id` → `404` `{ "message": "…" }`.

---

## Health

```text
GET /health
```

```json
{ "ok": true }
```

---

## Dashboard

Attention-only HTML at `GET /` (dues, blocked Firefly pushes, service strip, last SMS import). `GET /dashboard` redirects to `/`. No transaction list, charts, or budgets — those stay in Dhan.

The page reads:

```text
GET /knowledge?kind=due
GET /knowledge?kind=exception&status=blocked
GET /services
GET /services/stream
GET /imports?limit=1
GET /health
```

Home has search, a **past 6 months** since filter (3 / 12 / all time), due status (unpaid / overdue / upcoming / paid / all), sort, and **Mark paid** on unpaid dues. Those map to `q`, `from`, `status`, `sort`, and `order`. Manual paid is `POST /knowledge/:id/paid` (cleared with `DELETE`). The query string on `/` is kept in sync (`/?since=6&status=overdue`).

---

## Monitoring

```text
GET /events
GET /events/:id
POST /events

GET /services
GET /services/stream
```

`GET /events` filters: `status`, `type`.

`POST /events` accepts a webhook payload and returns `202`.

`GET /services/stream` is SSE (`event: service-status`).

---

## Imports

XML import runs from `sms_imports`. Empty until a backup is ingested **after** this API shipped (same file + mtime is skipped).

```text
GET /imports
GET /imports/:id
```

Filter: `status=completed|failed`.

```bash
curl "http://192.168.1.32:4000/imports?limit=5"
curl "http://192.168.1.32:4000/imports/1"
```

Item:

```json
{
  "id": 1,
  "sourceFile": "/imports/sms/sms-2026.xml",
  "fileMtime": 1755400000000,
  "attempted": 18384,
  "imported": 12,
  "skipped": 18372,
  "failed": 0,
  "status": "completed",
  "startedAt": "2026-08-17T15:30:00.000Z",
  "completedAt": "2026-08-17T15:30:08.000Z"
}
```

---

## SMS

```text
GET /sms
GET /sms/:id
```

Filters:

| Query | Meaning |
|---|---|
| `category` | e.g. `FINANCIAL` |
| `subcategory` | financial kind: `expense`, `income`, `bill`, `transfer`, `investment`, `epf` |
| `address` | sender id (`HDFCBK`, …) |
| `from` / `to` | ISO datetime on `receivedAt` |

List includes `body`. Detail adds `hash`, `rawAttributes`, `extractedData`, and `financialEvent` when posted.

```bash
curl "http://192.168.1.32:4000/sms?category=FINANCIAL&limit=5"
curl "http://192.168.1.32:4000/sms?subcategory=investment"
curl "http://192.168.1.32:4000/sms/18897"
```

---

## Knowledge

Posted `financial_events` by default. `id` is the SMS id (stable across event rebuilds), not `financial_events.id`.

Due reminders (`bill` + `NEUTRAL`) never enter `financial_events`. Query them with `kind=due` (alias `type=due`). Repeated reminder SMS for the same last4, due date, and amount collapse to the newest SMS. A later **received / credited to that last4** SMS marks the cycle `paid` (hidden by default). You can also **mark paid** in Narada (`POST /knowledge/:id/paid`) when the issuer SMS is missing. Overdue is only when the due date has passed **and** there is no payment-ack and no manual mark. `GET /knowledge/:id` still returns that individual SMS.

```text
GET /knowledge
GET /knowledge/:id
```

Filters:

| Query | Meaning |
|---|---|
| `kind` | `expense`, `income`, `bill`, `transfer`, `investment`, `epf`, `due`, or `exception` |
| `last4` | source or counterparty last4 (dues: extracted account last4) |
| `bank` | e.g. `YES Bank` |
| `pushed` | `true` / `false` — Dhan journal id (ignored when `kind=due` or `kind=exception`) |
| `status` | `blocked` / `skipped` with `kind=exception`. For `kind=due`: `open` / `overdue` / `paid` / `all`. Default dues omit **paid** (a received/credited SMS on the same last4 settled that cycle). |
| `q` | Case-insensitive search of last4, bank, merchant, amounts, status, SMS body (dues), and reason (exceptions) |
| `from` / `to` | ISO datetime. Dues use **due date** (SMS time if due date missing). Exceptions use event time. |
| `sort` | `dueDate` / `amount` / `bank` / `occurredAt` / `status` |
| `order` | `asc` (default) or `desc` |

```bash
curl "http://192.168.1.32:4000/knowledge?kind=investment"
curl "http://192.168.1.32:4000/knowledge?kind=due"
curl "http://192.168.1.32:4000/knowledge?kind=exception"
curl "http://192.168.1.32:4000/knowledge?kind=exception&status=blocked"
curl "http://192.168.1.32:4000/knowledge?last4=1412&pushed=true"
curl "http://192.168.1.32:4000/knowledge?kind=due&status=overdue&sort=amount&order=desc"
curl "http://192.168.1.32:4000/knowledge?kind=due&q=1687"
curl "http://192.168.1.32:4000/knowledge/search?q=YES"
curl "http://192.168.1.32:4000/knowledge/18849"
curl -X POST "http://192.168.1.32:4000/knowledge/8843/paid"
curl -X DELETE "http://192.168.1.32:4000/knowledge/8843/paid"
```

Exception item (unpushed posted event that dry-run will not POST). Needs `FIREFLY_URL` + `FIREFLY_TOKEN`. Missing config → `503`.

```json
{
  "type": "exception",
  "id": 17531,
  "occurredAt": "2026-03-30T06:30:00.000Z",
  "payload": {
    "kind": "expense",
    "amount": 50,
    "currency": "INR",
    "accountLast4": "5940",
    "counterpartyLast4": null,
    "bank": "FASTag",
    "merchant": "Shipra Mall",
    "status": "skipped",
    "reason": "before Firefly opening 2026-08-16 for last4 5940"
  }
}
```

`status: "blocked"` example reason: `"transfer missing counterparty_last4"`.

Due item. `occurredAt` is the SMS `received_at`. Home cards show that time when `payload.dueDate` is missing.

```json
{
  "type": "due",
  "id": 8843,
  "occurredAt": "2023-05-20T10:00:00.000Z",
  "payload": {
    "kind": "due",
    "dueDate": "2023-06-05",
    "minDue": 467.96,
    "totalDue": 9359.17,
    "amount": 9359.17,
    "currency": "INR",
    "accountLast4": "0336",
    "accountName": null,
    "bank": "YES Bank",
    "merchant": null,
    "classifier": "regex-financial",
    "classifierVersion": "1.3.25",
    "status": "overdue",
    "markedPaid": false
  }
}
```

```json
{
  "type": "financial",
  "id": 18849,
  "occurredAt": "2026-08-15T11:49:00.000Z",
  "payload": {
    "kind": "income",
    "cashFlow": "INFLOW",
    "amount": 3188,
    "currency": "INR",
    "accountLast4": "1412",
    "counterpartyLast4": null,
    "accountName": "ICICI savings",
    "bank": "ICICI Bank",
    "merchant": "ABHISHEK SHARMA",
    "transactionType": "UPI",
    "classifier": "regex-financial",
    "classifierVersion": "1.3.25",
    "fireflyTransactionId": null,
    "fireflyPushedAt": null
  }
}
```

Not implemented: generic document search. `GET /knowledge/search?q=` searches dues (including SMS body) and push exceptions only — not the Firefly ledger.

---

## Timeline

Mixed attention feed. Default types: `due`, `exception`, `event`. Posted ledger rows are **opt-in** (`type=financial`) so this is not a Firefly clone.

```text
GET /timeline
```

| Query | Meaning |
|---|---|
| `from` / `to` | ISO datetime |
| `type` | `due`, `exception`, `event`, `financial` (comma or repeated) |
| `page` / `limit` | Same envelope as `/knowledge` |

Without Firefly env, `exception` items are skipped; dues and infra still list.

```bash
curl "http://192.168.1.32:4000/timeline"
curl "http://192.168.1.32:4000/timeline?type=due,event"
curl "http://192.168.1.32:4000/timeline?from=2026-08-01T00:00:00.000Z&type=exception"
```

Event item (`narada_events`):

```json
{
  "type": "event",
  "id": "evt-powercast-failed",
  "occurredAt": "2026-08-21T00:10:00.000Z",
  "payload": {
    "eventType": "SERVICE_FAILED",
    "severity": "critical",
    "message": "PowerCast Health failed",
    "source": "http-checker",
    "status": "processed",
    "serviceId": "powercast-health",
    "serviceName": "PowerCast Health",
    "critical": true
  }
}
```

Due and exception items use the same payloads as `GET /knowledge?kind=due` and `kind=exception`.

