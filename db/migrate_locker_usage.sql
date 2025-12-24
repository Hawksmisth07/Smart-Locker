-- ============================================
-- Smart Loker Database Migration Script
-- Run this to update existing locker_usage table
-- ============================================

USE smart_loker;

-- Check if table exists and needs migration
-- First, backup existing data if table exists
CREATE TABLE IF NOT EXISTS locker_usage_backup AS SELECT * FROM locker_usage;

-- Drop the old table
DROP TABLE IF EXISTS locker_usage;

-- Create new locker_usage table with correct schema
CREATE TABLE locker_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    locker_number INT NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    duration_minutes INT DEFAULT NULL,
    warning_13h_sent BOOLEAN DEFAULT FALSE,
    warning_27h_sent BOOLEAN DEFAULT FALSE,
    taken_by_admin BOOLEAN DEFAULT FALSE,
    admin_takeover_at TIMESTAMP NULL,
    notes TEXT DEFAULT NULL,
    INDEX idx_user (user_id),
    INDEX idx_locker (locker_number),
    INDEX idx_start_time (start_time),
    INDEX idx_end_time (end_time),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (locker_number) REFERENCES lockers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: After running this script, you can verify by running:
-- DESCRIBE locker_usage;

SELECT 'Migration completed! locker_usage table has been updated.' AS Status;
