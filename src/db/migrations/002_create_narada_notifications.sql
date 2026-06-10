CREATE TABLE IF NOT EXISTS narada_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL,
    notifier_type VARCHAR(100) NOT NULL,
    status ENUM(
        'pending',
        'sent',
        'failed'
    ) NOT NULL,

    error_message TEXT NULL,
    sent_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_event_id (event_id),
    INDEX idx_status (status)
);