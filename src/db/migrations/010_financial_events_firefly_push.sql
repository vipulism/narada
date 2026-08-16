ALTER TABLE financial_events
    ADD COLUMN firefly_transaction_id VARCHAR(32) NULL AFTER classifier_version;

ALTER TABLE financial_events
    ADD COLUMN firefly_pushed_at DATETIME NULL AFTER firefly_transaction_id;

ALTER TABLE financial_events
    ADD INDEX idx_financial_events_firefly (firefly_transaction_id);
