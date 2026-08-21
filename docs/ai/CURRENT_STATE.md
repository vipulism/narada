# Current Implementation

Completed:

✅ HTTP Monitoring
✅ Docker Events
✅ RabbitMQ Events
✅ Telegram Notifications
✅ Event APIs
✅ SSE
✅ SMS XML Importer
✅ Folder connector + import scheduler (SMS Backup XML)
✅ SMS financial detection (`regex-financial@1.3.25`)
✅ Skip templates: data quota, UPI PIN, limit-increase, overlimit promo, pending CRED cashback, closed HDFC loan EMI, login/IPIN/password, KYC, UPI link, schedule of charges, OTP awareness, CC bill-payment acks
✅ SMS kinds: expense, income, bill, investment, epf, transfer
✅ Due reminders (payment due / min+total due) are bill, not expense
✅ Self-transfer (debit one a/c, credit another owned a/c) is transfer, not expense
✅ Last3 account match only when SMS shows 3 digits and bank matches; 4 digits are exact last4 only; two-digit SBI endings (85) never map onto 8561
✅ FASTag as a separate wallet account (not IDFC Wealth)
✅ Wallet top-up successful (Milkbasket etc.) is expense, not income
✅ IMPS debit to another owned last4 (no CREDITED word) is transfer
✅ e-Insurance account policy credit is skip; PhonePe `has requested Rs` is skip
✅ HSBC `received a payment of` on a live card is bill; cardless cash withdrawal is expense
✅ PayZapp wallet debit is expense; PhonePe/BSES payment successful is expense
✅ CDSL share credit, BK Crowns, and CAMS e-insurance account noise are skip
✅ CRED Club / CRED credited from savings is bill; YES funds-trf to owned a/c is transfer
✅ `financial_events` from posted analysis on owned last4 only; unmapped (old cards, no last4) stay in sms_analysis
✅ `FinancialEvent` matches the table: `classifier` + `classifier_version` are required (same values as `sms_analysis`)
✅ Firefly III connector (Dhan): last4 account map, dry-run, openings, push with `external_id`
✅ Unique-bank account resolve at persist/push: last4 → unique (bank + type) → unique bank → skip
✅ Dhan investment buckets: FD/MF/equity/SGB/EPF seeded; `investment` SMS → Firefly transfer (kind+bank dest); EPF snapshot-only
✅ SMS import follow-up: classify pending → rebuild `financial_events` → push ready rows to Firefly
✅ Import / knowledge read APIs: `GET /imports`, `GET /sms`, `GET /knowledge` (financial envelope, id = smsId)
✅ Due feed: `GET /knowledge?kind=due` unique last4+dueDate+amount; paid when a received/credited SMS hits that last4 in-cycle; overdue only if due date passed and unpaid
✅ Push exceptions: `GET /knowledge?kind=exception` dry-run reasons (`blocked` / `skipped`) for unpushed `financial_events`
✅ Mixed timeline: `GET /timeline` (dues + exceptions + infra events; `type=financial` opt-in)
✅ Telegram attention: new dues + new/repeated Firefly blocked (seed then delta; no spend summaries)
✅ Attention-only dashboard at `GET /` (dues, blocked pushes, services, last import; no Money charts)
✅ Attention search: Home filter/sort/search plus `GET /knowledge/search?q=` (dues + exceptions, not the ledger)


In Progress:

🚧 Attention layer remaining: close shipped GitHub issues `#32`–`#38` — see `docs/ai/current_goals/005.md`


Not Implemented:

- RAG
- Vector DB
- AI extraction
- Bank importer
