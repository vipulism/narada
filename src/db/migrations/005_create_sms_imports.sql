CREATE TABLE sms_imports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_file VARCHAR(512) NOT NULL,
  file_mtime BIGINT NOT NULL,
  attempted INT NOT NULL,
  imported INT NOT NULL,
  skipped INT NOT NULL,
  failed INT NOT NULL,
  status ENUM('completed','failed') NOT NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_source_file_mtime (source_file, file_mtime)
);
