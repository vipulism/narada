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
        UNIQUE (sms_id, classifier, classifier_version),

    INDEX idx_sms_analysis_sms (sms_id),
    INDEX idx_sms_analysis_category (category),
    INDEX idx_sms_analysis_subcategory (subcategory),
    INDEX idx_sms_analysis_classifier (classifier),
    INDEX idx_sms_analysis_classified_at (classified_at)

);