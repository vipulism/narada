CREATE TABLE financial_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sms_id BIGINT NOT NULL,
    kind VARCHAR(32) NOT NULL,
    cash_flow VARCHAR(16) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    account_last4 VARCHAR(4) NULL,
    account_name VARCHAR(255) NULL,
    bank VARCHAR(255) NULL,
    merchant VARCHAR(255) NULL,
    transaction_type VARCHAR(50) NULL,
    occurred_at DATETIME NOT NULL,
    classifier VARCHAR(100) NOT NULL,
    classifier_version VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uk_financial_events_sms UNIQUE (sms_id),
    CONSTRAINT fk_financial_events_sms
        FOREIGN KEY (sms_id) REFERENCES sms_messages(id) ON DELETE CASCADE,
    INDEX idx_financial_events_kind (kind),
    INDEX idx_financial_events_occurred (occurred_at),
    INDEX idx_financial_events_last4 (account_last4)
);
