CREATE TABLE sms_spend_overrides (
    sms_id BIGINT NOT NULL PRIMARY KEY,
    category VARCHAR(32) NULL,
    merchant_key VARCHAR(255) NULL,
    merchant_label VARCHAR(255) NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
