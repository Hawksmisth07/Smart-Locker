-- ============================================
-- Smart Loker Database Schema
-- Compatible with MariaDB 10.x / MySQL 5.7+
-- ============================================

-- Create Database
CREATE DATABASE IF NOT EXISTS smart_loker 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE smart_loker;

-- ============================================
-- Table: users (Pengguna Loker)
-- ============================================
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    nim VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    card_uid VARCHAR(50) DEFAULT NULL,
    temp_pin VARCHAR(10) DEFAULT NULL,
    temp_pin_expires TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_nim (nim),
    INDEX idx_card_uid (card_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: admin_users (Administrator)
-- ============================================
DROP TABLE IF EXISTS admin_users;
CREATE TABLE admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'superadmin') DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: lockers (Daftar Loker)
-- ============================================
DROP TABLE IF EXISTS lockers;
CREATE TABLE lockers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locker_code VARCHAR(10) NOT NULL UNIQUE,
    status ENUM('available', 'occupied', 'maintenance') DEFAULT 'available',
    current_user_id INT DEFAULT NULL,
    location VARCHAR(100) DEFAULT NULL,
    occupied_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_current_user (current_user_id),
    FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: locker_usage (Riwayat Penggunaan Loker)
-- ============================================
DROP TABLE IF EXISTS locker_usage;
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

-- ============================================
-- Table: user_reports (Laporan Masalah)
-- ============================================
DROP TABLE IF EXISTS user_reports;
CREATE TABLE user_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('bug', 'login', 'register', 'locker', 'suggestion', 'other') NOT NULL,
    email VARCHAR(255) DEFAULT NULL,
    message TEXT NOT NULL,
    status ENUM('pending', 'in_progress', 'resolved', 'closed') DEFAULT 'pending',
    admin_notes TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Table: overtime_alerts (Peringatan Loker Overtime)
-- ============================================
DROP TABLE IF EXISTS overtime_alerts;
CREATE TABLE overtime_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    locker_id INT NOT NULL,
    user_id INT NOT NULL,
    alert_type ENUM('warning_13h', 'warning_27h', 'confiscated') NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_locker (locker_id),
    INDEX idx_user (user_id),
    FOREIGN KEY (locker_id) REFERENCES lockers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Insert Default Data
-- ============================================

-- Insert 10 default lockers
INSERT INTO lockers (locker_code, status) VALUES
('A1', 'available'),
('B1', 'available'),
('A2', 'available'),
('B2', 'available'),
('A3', 'available'),
('B3', 'available'),
('A4', 'available'),
('B4', 'available'),
('A5', 'available'),
('B5', 'available');

-- Insert default admin users (passwords will be set by setup-db.js)
-- Password admin: admin123
-- Password superadmin: Super@2025
-- Note: Use setup-db.js to create admins with proper bcrypt hashing

-- ============================================
-- Verification Queries
-- ============================================
-- SELECT 'Tables created:' AS Info;
-- SHOW TABLES;
-- SELECT COUNT(*) AS 'Total Lockers' FROM lockers;
