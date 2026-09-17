CREATE DATABASE IF NOT EXISTS lab_data_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lab_data_management;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(150) NOT NULL,
  role ENUM('SYSTEM_ADMIN', 'LAB_MEMBER') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS resources (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description VARCHAR(2000) NULL,
  responsible_person VARCHAR(150) NULL,
  availability_status ENUM('AVAILABLE', 'UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
  current_status ENUM('OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'OPERATIONAL',
  specifications VARCHAR(4000) NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_resources_member_view (archived, availability_status, category),
  INDEX idx_resources_name (name)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  acting_user_id CHAR(36) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  affected_record_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (acting_user_id) REFERENCES users(id),
  INDEX idx_audit_record (entity_type, affected_record_id),
  INDEX idx_audit_created_at (created_at)
);
