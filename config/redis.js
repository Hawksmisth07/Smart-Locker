const redis = require('redis');
require('dotenv').config();

// Create Redis client
const client = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    },
    password: process.env.REDIS_PASSWORD || undefined
});

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
