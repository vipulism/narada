ALTER TABLE financial_events
    ADD COLUMN counterparty_last4 VARCHAR(4) NULL AFTER account_last4;

ALTER TABLE financial_events
    ADD INDEX idx_financial_events_counterparty (counterparty_last4);
