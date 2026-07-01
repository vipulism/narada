CREATE TABLE sms_analysis (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sms_id BIGINT NOT NULL,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    confidence DECIMAL(5,4) NOT NULL,
    extracted_data JSON,
    classifier VARCHAR(100) NOT NULL,
    classifier_version VARCHAR(50) NOT NULL,
    classified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sms_analysis_sms
        FOREIGN KEY (sms_id)
        REFERENCES sms_messages(id)
        ON DELETE CASCADE,

    CONSTRAINT uk_sms_analysis_classifier
        UNIQUE (sms_id, classifier, classifier_version)
);

CREATE INDEX idx_sms_analysis_sms
    ON sms_analysis (sms_id);

CREATE INDEX idx_sms_analysis_category
    ON sms_analysis (category);

CREATE INDEX idx_sms_analysis_subcategory
    ON sms_analysis (subcategory);

CREATE INDEX idx_sms_analysis_classifier
    ON sms_analysis (classifier);

CREATE INDEX idx_sms_analysis_classified_at
    ON sms_analysis (classified_at);