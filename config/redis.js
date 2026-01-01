const redis = require('redis');
require('dotenv').config();

// Determine if we're in production (cloud hosting)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Create Redis client with support for Upstash and other cloud Redis providers
const clientConfig = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL } // Use URL format for Upstash
    : {
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            // TLS required for Upstash and most cloud Redis
            tls: IS_PRODUCTION ? true : undefined
        },
        password: process.env.REDIS_PASSWORD || undefined
    };

const client = redis.createClient(clientConfig);

// Error handling
client.on('error', (err) => {
    console.error('❌ Redis Client Error:', err);
});

client.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

// Connect to Redis
async function connectRedis() {
    try {
        await client.connect();
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        process.exit(1);
    }
}

module.exports = { client, connectRedis };
