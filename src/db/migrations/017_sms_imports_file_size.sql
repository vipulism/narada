ALTER TABLE sms_imports
    ADD COLUMN IF NOT EXISTS file_size BIGINT NULL AFTER file_mtime;
