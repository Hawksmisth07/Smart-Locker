const mysql = require('mysql2/promise');
require('dotenv').config();

// Determine if we're in production (cloud hosting)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Create MySQL connection pool with SSL support for cloud databases
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_locker',
    waitForConnections: true,
    connectionLimit: IS_PRODUCTION ? 5 : 10, // Lower limit for cloud free tiers
    queueLimit: 0,
    acquireTimeout: 30000,
    timeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    // SSL required for TiDB Serverless and other cloud databases
    ssl: IS_PRODUCTION ? { rejectUnauthorized: true } : undefined
});

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

module.exports = { pool, testConnection };
