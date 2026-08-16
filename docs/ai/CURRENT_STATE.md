# Current Implementation

Completed:

✅ HTTP Monitoring
✅ Docker Events
✅ RabbitMQ Events
✅ Telegram Notifications
✅ Event APIs
✅ SSE
✅ SMS XML Importer
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
✅ `financial_events` from posted analysis (expense/income/transfer/CRED outflow/investment); due reminders stay in sms_analysis


In Progress:

🚧 Knowledge ingestion
🚧 Firefly III mapping (Dhan bank/card accounts ready, connector not started)


Not Implemented:

- Firefly connector
- Unique-bank account resolve at resolve/push time (not during classify)
- Dhan accounts for EPF, MF, stocks, FD (classify only for now)
- RAG
- Vector DB
- AI extraction
- Bank importer
