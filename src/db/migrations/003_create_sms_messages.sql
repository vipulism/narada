CREATE TABLE sms_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    sms_id BIGINT NULL,
    address VARCHAR(50) NOT NULL,

    contact_name VARCHAR(255) NULL,

    body LONGTEXT NOT NULL,

    sms_type TINYINT NOT NULL,

    received_at DATETIME NOT NULL,

    source_file VARCHAR(255) NULL,

    hash CHAR(64) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_sms_hash (hash),

    INDEX idx_address (address),
    INDEX idx_received_at (received_at)
);