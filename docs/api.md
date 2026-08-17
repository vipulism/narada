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

Posted `financial_events` only. `id` is the SMS id (stable across event rebuilds), not `financial_events.id`.

```text
GET /knowledge
GET /knowledge/:id
```

Filters:

| Query | Meaning |
|---|---|
| `kind` | `expense`, `income`, `bill`, `transfer`, `investment`, `epf` |
| `last4` | source or counterparty last4 |
| `bank` | e.g. `YES Bank` |
| `pushed` | `true` / `false` — whether Dhan has a journal id |

```bash
curl "http://192.168.1.32:4000/knowledge?kind=investment"
curl "http://192.168.1.32:4000/knowledge?last4=1412&pushed=true"
curl "http://192.168.1.32:4000/knowledge/18849"
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

Not implemented: `GET /knowledge/search`, `GET /timeline`.
