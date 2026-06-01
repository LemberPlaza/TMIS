CREATE TABLE IF NOT EXISTS tmis_batches (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  batch_date DATE NOT NULL,
  rp_code VARCHAR(100) NOT NULL DEFAULT '',
  training_code VARCHAR(100) NOT NULL DEFAULT '',
  resource_person_name VARCHAR(255) NOT NULL DEFAULT '',
  topic_delivered TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tmis_batches_date (batch_date),
  INDEX idx_tmis_batches_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS tmis_evaluations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id INT UNSIGNED NULL,
  respondent_name VARCHAR(255) NOT NULL,
  rp_code VARCHAR(100) NOT NULL DEFAULT '',
  training_code VARCHAR(100) NOT NULL DEFAULT '',
  resource_person_name VARCHAR(255) NOT NULL DEFAULT '',
  topic_delivered TEXT NULL,
  topic_evaluations TEXT NULL,
  training_title VARCHAR(255) NOT NULL,
  delivery_date DATE NOT NULL,
  clarity_objectives TINYINT UNSIGNED NOT NULL,
  topic_organization TINYINT UNSIGNED NOT NULL,
  clarity_presentation TINYINT UNSIGNED NOT NULL,
  instructional_aids_quality TINYINT UNSIGNED NOT NULL,
  teaching_ability TINYINT UNSIGNED NOT NULL,
  question_answering_ability TINYINT UNSIGNED NOT NULL,
  participant_interest TINYINT UNSIGNED NOT NULL,
  time_management TINYINT UNSIGNED NOT NULL,
  topic_ending TINYINT UNSIGNED NOT NULL,
  overall_satisfaction TINYINT UNSIGNED NOT NULL,
  liked_about_rp TEXT NULL,
  disliked_about_rp TEXT NULL,
  other_remarks TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_tmis_evaluations_batch_id (batch_id),
  INDEX idx_tmis_evaluations_created_at (created_at),
  CONSTRAINT fk_tmis_evaluations_batch
    FOREIGN KEY (batch_id) REFERENCES tmis_batches(id)
    ON DELETE SET NULL
);
