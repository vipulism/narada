CREATE TABLE IF NOT EXISTS narada_events (
    id VARCHAR(255) PRIMARY KEY,
    source VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('received', 'processed', 'failed') NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    service_id VARCHAR(255) NULL,
    service_name VARCHAR(255) NULL,
    service_critical BOOLEAN NULL,

    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);