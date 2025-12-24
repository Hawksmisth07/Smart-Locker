// Database Setup Script
// Run: node setup-db.js

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'smart_loker';

async function setupDatabase() {
    let connection;

    try {
        console.log('\n🔧 Setting up database...\n');
        console.log('Using Configuration:');
        console.log(`  Host: ${DB_HOST}`);
        console.log(`  User: ${DB_USER}`);
        console.log(`  Database: ${DB_NAME}`);
        console.log('------------------------\n');

        // Connect without database first
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS
        });

        console.log('✅ Connected to MySQL server');

        // Create database
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`✅ Database '${DB_NAME}' created/verified`);

        // Use database
        await connection.query(`USE ${DB_NAME}`);

        // Drop existing users table to update structure (WARNING: This deletes all user data!)
        await connection.query(`DROP TABLE IF EXISTS users`);
        console.log('🔄 Old users table dropped (if existed)');

        // Create users table with name, nim, and card columns
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Table "users" created');

        // Create admin_users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Table "admin_users" created');

        // Generate password hashes
        const adminHash = await bcrypt.hash('admin123', 10);
        const superadminHash = await bcrypt.hash('Super@2025', 10);

        // Insert admin users
        await connection.query(`
            INSERT INTO admin_users (username, email, password_hash, name, role) VALUES 
            ('admin', 'admin@smartlocker.com', ?, 'Administrator', 'admin'),
            ('superadmin', 'superadmin@smartlocker.com', ?, 'Super Admin', 'superadmin')
            ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
        `, [adminHash, superadminHash]);
        console.log('✅ Admin users created');

        // Insert test user
        const testUserHash = await bcrypt.hash('TestPassword123!', 10);
        await connection.query(`
            INSERT INTO users (name, nim, email, password_hash) VALUES 
            ('Test User', '12345678', 'test@example.com', ?)
            ON DUPLICATE KEY UPDATE email=email
        `, [testUserHash]);
        console.log('✅ Test user created');

        console.log('\n========================================');
        console.log('🎉 DATABASE SETUP COMPLETE!');
        console.log('========================================\n');
        console.log('Admin Credentials:');
        console.log('  Username: admin');
        console.log('  Password: admin123');
        console.log('');
        console.log('  Username: superadmin');
        console.log('  Password: Super@2025');
        console.log('\n========================================\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);

        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Pastikan MySQL/MariaDB sudah berjalan!');
            console.log('   - XAMPP: Start MySQL dari Control Panel');
            console.log('   - Laragon: Start MySQL/MariaDB');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n💡 Password MySQL salah. Edit file .env atau ubah DB_PASS di script ini.');
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

setupDatabase();
