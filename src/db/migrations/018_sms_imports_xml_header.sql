ALTER TABLE sms_imports
    ADD COLUMN IF NOT EXISTS xml_count INT NULL AFTER file_size;

ALTER TABLE sms_imports
    ADD COLUMN IF NOT EXISTS xml_backup_date BIGINT NULL AFTER xml_count;
