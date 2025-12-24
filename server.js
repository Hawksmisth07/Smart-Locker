const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { pool, testConnection } = require('./config/database');
const { client: redisClient, connectRedis } = require('./config/redis');
const { verifyEmailConnection, sendOTPEmail, sendReportEmail, sendLockerWarningEmail, sendTakeoverWarningEmail, sendItemConfiscatedEmail } = require('./config/email');
const { generateToken, verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

const PORT = process.env.PORT || 8888;
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY_SECONDS) || 60;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Socket.IO connection handling
let connectedClients = 0;

io.on('connection', (socket) => {
    connectedClients++;
    console.log(`🔌 Client connected: ${socket.id} (Total: ${connectedClients})`);

    // Send current stats on connection
    socket.emit('connected', { message: 'Connected to Smart Locker real-time server' });

    socket.on('disconnect', () => {
        connectedClients--;
        console.log(`❌ Client disconnected: ${socket.id} (Total: ${connectedClients})`);
    });
});

// Helper function to emit locker updates to all clients
function emitLockerUpdate(data) {
    io.emit('locker:update', data);
    console.log('📡 Emitted locker:update event');
}

// Helper function to emit stats updates
function emitStatsUpdate(data) {
    io.emit('stats:update', data);
}

// Helper function to emit new activity
function emitNewActivity(data) {
    io.emit('activity:new', data);
}

// Helper function to emit history updates
function emitHistoryUpdate(data) {
    io.emit('history:new', data);
}

// Helper function to emit user updates (new user registered, etc)
function emitUserUpdate(data) {
    io.emit('user:update', data);
    console.log('📡 Emitted user:update event');
}

// Helper function to emit transaction updates
function emitTransactionUpdate(data) {
    io.emit('transaction:update', data);
    console.log('📡 Emitted transaction:update event');
}

// Helper function to emit notification updates
function emitNotificationUpdate(data) {
    io.emit('notification:update', data);
}

// Helper function to emit overtime locker alerts
function emitOvertimeUpdate(data) {
    io.emit('overtime:update', data);
    console.log('📡 Emitted overtime:update event');
}

// Helper function to emit server logs
function emitServerLog(data) {
    io.emit('serverlog:new', data);
}


// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
}));

// CORS Configuration - Allow all origins for development
app.use(cors({
    origin: true,
    credentials: true
}));

// Rate Limiting for Login endpoints - Per IP
const loginLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // 5 attempts per window per IP
    message: {
        success: false,
        message: 'Terlalu banyak percobaan login. Coba lagi dalam 1 menit.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Explicitly use IP for rate limiting
    keyGenerator: (req) => {
        // Get real IP (considering proxy headers)
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.socket?.remoteAddress ||
            req.ip ||
            'unknown';
    },
    // Only count failed requests towards rate limit
    skipSuccessfulRequests: false
});

// General API rate limiter - Per IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: {
        success: false,
        message: 'Terlalu banyak request. Coba lagi nanti.'
    },
    // Explicitly use IP for rate limiting
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.socket?.remoteAddress ||
            req.ip ||
            'unknown';
    }
});

app.use('/api/', apiLimiter);
app.use(express.json());

// ==================== CACHE BUSTING MIDDLEWARE ====================
// Version number - increment this when deploying updates
const APP_VERSION = '1.0.0';

// No-cache middleware for HTML, CSS, JS files
app.use((req, res, next) => {
    // Set no-cache headers for static assets
    if (req.url.match(/\.(html|css|js)(\?.*)?$/i)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
});

// Version endpoint for cache busting
app.get('/api/version', (req, res) => {
    res.json({
        version: APP_VERSION,
        timestamp: Date.now(),
        buildDate: new Date().toISOString()
    });
});

app.use(express.static(__dirname, {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (res, path) => {
        // Extra cache control for specific file types
        if (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==================== SERVER LOG CAPTURE ====================
// Store server logs in memory for admin viewing
const serverLogs = [];
const MAX_SERVER_LOGS = 500;

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

function captureLog(type, ...args) {
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    serverLogs.push({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type: type,
        message: message
    });

    // Keep only last MAX_SERVER_LOGS entries
    if (serverLogs.length > MAX_SERVER_LOGS) {
        serverLogs.shift();
    }
}

console.log = function (...args) {
    captureLog('log', ...args);
    originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
    captureLog('error', ...args);
    originalConsoleError.apply(console, args);
};

console.warn = function (...args) {
    captureLog('warn', ...args);
    originalConsoleWarn.apply(console, args);
};

console.info = function (...args) {
    captureLog('info', ...args);
    originalConsoleInfo.apply(console, args);
};

// Log access to database for admin monitoring
async function logAccess(req, userId, userName, userType, action, details = null) {
    try {
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
        const userAgent = req.headers['user-agent'] || null;
        const pageUrl = req.headers['referer'] || req.originalUrl || null;

        await pool.query(`
            INSERT INTO access_logs (user_id, user_name, user_type, action, details, page_url, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, userName, userType, action, details, pageUrl, ipAddress, userAgent]);

        if (!IS_PRODUCTION) {
            console.log(`📝 Access logged: ${action} by ${userName || 'Guest'} (${userType})`);
        }
    } catch (error) {
        // Don't fail the main request if logging fails
        console.error('Error logging access:', error.message);
    }
}

// API Endpoints

// 1. Request Password Reset - Send OTP via Email
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                message: 'Email tidak valid'
            });
        }

        // Check if user exists in database
        const [users] = await pool.query('SELECT id, email FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email tidak terdaftar'
            });
        }

        // Generate OTP
        const otp = generateOTP();

        // Store OTP in Redis with expiry
        const redisKey = `otp:${email}`;
        await redisClient.setEx(redisKey, OTP_EXPIRY, otp);

        // Send OTP via email
        await sendOTPEmail(email, otp);

        // Only log OTP in development (never in production)
        if (!IS_PRODUCTION) {
            console.log(`🔑 OTP generated for ${email} (expires in ${OTP_EXPIRY}s)`);
        }

        res.json({
            success: true,
            message: 'Kode OTP telah dikirim ke email Anda',
            expirySeconds: OTP_EXPIRY
        });

    } catch (error) {
        console.error('Error in forgot-password:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim OTP'
        });
    }
});

// 2. Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        // Validate input
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email dan OTP harus diisi'
            });
        }

        // Get OTP from Redis
        const redisKey = `otp:${email}`;
        const storedOTP = await redisClient.get(redisKey);

        if (!storedOTP) {
            return res.status(400).json({
                success: false,
                message: 'Kode OTP sudah kadaluarsa atau tidak valid'
            });
        }

        // Verify OTP
        if (storedOTP !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Kode OTP salah'
            });
        }

        // OTP is valid - mark as verified in Redis (keep for password reset)
        await redisClient.setEx(`verified:${email}`, 300, 'true'); // 5 minutes to reset password

        res.json({
            success: true,
            message: 'Kode OTP berhasil diverifikasi'
        });

    } catch (error) {
        console.error('Error in verify-otp:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat verifikasi OTP'
        });
    }
});

// 3. Resend OTP
app.post('/api/resend-otp', async (req, res) => {
    const { email } = req.body;

    try {
        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                message: 'Email tidak valid'
            });
        }

        // Check if user exists
        const [users] = await pool.query('SELECT id, email FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email tidak terdaftar'
            });
        }

        // Generate new OTP
        const otp = generateOTP();

        // Store OTP in Redis with expiry (overwrites old one)
        const redisKey = `otp:${email}`;
        await redisClient.setEx(redisKey, OTP_EXPIRY, otp);

        // Send OTP via email
        await sendOTPEmail(email, otp);

        // Only log in development
        if (!IS_PRODUCTION) {
            console.log(`🔑 OTP resent for ${email} (expires in ${OTP_EXPIRY}s)`);
        }

        res.json({
            success: true,
            message: 'Kode OTP baru telah dikirim ke email Anda',
            expirySeconds: OTP_EXPIRY
        });

    } catch (error) {
        console.error('Error in resend-otp:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim ulang OTP'
        });
    }
});

// 4. Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        // Validate input
        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email dan password baru harus diisi'
            });
        }

        // Check password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 8 karakter'
            });
        }

        // Check if OTP was verified
        const verifiedKey = `verified:${email}`;
        const isVerified = await redisClient.get(verifiedKey);

        if (!isVerified) {
            return res.status(400).json({
                success: false,
                message: 'Silakan verifikasi OTP terlebih dahulu'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in database
        const [result] = await pool.query(
            'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?',
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Email tidak terdaftar'
            });
        }

        // Clean up Redis keys
        await redisClient.del(`otp:${email}`);
        await redisClient.del(`verified:${email}`);

        console.log(`✅ Password reset successful for ${email}`);

        // Log password reset
        logAccess(req, null, email, 'user', 'Password Reset', `Password reset untuk ${email}`);

        res.json({
            success: true,
            message: 'Password berhasil direset'
        });

    } catch (error) {
        console.error('Error in reset-password:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mereset password'
        });
    }
});

// ==================== USER REGISTRATION ====================

// 5. User Registration (Sign Up)
app.post('/api/register', async (req, res) => {
    const { name, nim, email, password } = req.body;

    try {
        // Validate input
        if (!name || !nim || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Semua field harus diisi (nama, NIM, email, password)'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Format email tidak valid'
            });
        }

        // Validate NIM (only numbers)
        const nimRegex = /^[0-9]+$/;
        if (!nimRegex.test(nim)) {
            return res.status(400).json({
                success: false,
                message: 'NIM harus berupa angka'
            });
        }

        // Check password strength
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password minimal 8 karakter'
            });
        }

        // Check if email already exists
        const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email sudah terdaftar'
            });
        }

        // Check if NIM already exists
        const [existingNIM] = await pool.query('SELECT id FROM users WHERE nim = ?', [nim]);
        if (existingNIM.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'NIM sudah terdaftar'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user
        const [result] = await pool.query(
            'INSERT INTO users (name, nim, email, password_hash) VALUES (?, ?, ?, ?)',
            [name.trim(), nim.trim(), email.toLowerCase().trim(), hashedPassword]
        );

        if (!IS_PRODUCTION) {
            console.log(`✅ New user registered: ${email}`);
        }

        // Log registration
        logAccess(req, result.insertId, name, 'user', 'Registrasi', `User baru: ${name} (${email})`);

        // Emit real-time user update
        emitUserUpdate({
            action: 'register',
            userId: result.insertId,
            name: name,
            email: email,
            timestamp: new Date().toISOString()
        });

        res.status(201).json({
            success: true,
            message: 'Registrasi berhasil! Silakan login.',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Error in registration:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat registrasi'
        });
    }
});

// 6. User Login
app.post('/api/user/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    try {
        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email dan password harus diisi'
            });
        }

        // Find user by email
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email.toLowerCase().trim()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email atau password salah'
            });
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Email atau password salah'
            });
        }

        if (!IS_PRODUCTION) {
            console.log(`✅ User login successful: ${user.email}`);
        }

        // Log access for admin monitoring
        logAccess(req, user.id, user.name, 'user', 'Login', `User login: ${user.email}`);

        res.json({
            success: true,
            message: 'Login berhasil',
            user: {
                id: user.id,
                name: user.name,
                nim: user.nim,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Error in user login:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat login'
        });
    }
});

// 7. Update User Profile
app.put('/api/user/update-profile', async (req, res) => {
    const { userId, name, email } = req.body;

    try {
        // Validate input
        if (!userId || !name || !email) {
            return res.status(400).json({
                success: false,
                message: 'User ID, nama, dan email harus diisi'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Format email tidak valid'
            });
        }

        // Check if email is already used by another user
        const [existingEmail] = await pool.query(
            'SELECT id FROM users WHERE email = ? AND id != ?',
            [email.toLowerCase().trim(), userId]
        );

        if (existingEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email sudah digunakan oleh pengguna lain'
            });
        }

        // Update user profile
        await pool.query(
            'UPDATE users SET name = ?, email = ?, updated_at = NOW() WHERE id = ?',
            [name.trim(), email.toLowerCase().trim(), userId]
        );

        if (!IS_PRODUCTION) {
            console.log(`✅ User profile updated: ${email}`);
        }

        // Log profile update
        logAccess(req, userId, name, 'user', 'Update Profil', `User ${name} memperbarui profil`);

        res.json({
            success: true,
            message: 'Profil berhasil diperbarui',
            user: {
                id: userId,
                name: name.trim(),
                email: email.toLowerCase().trim()
            }
        });

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui profil'
        });
    }
});

// 8. Get User Profile
app.get('/api/user/profile', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        const [users] = await pool.query(
            'SELECT id, name, nim, email, card_uid, is_active, created_at, updated_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const user = users[0];

        // Log profile access
        logAccess(req, user.id, user.name, 'user', 'Akses Profil', `User ${user.name} mengakses profil`);

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                nim: user.nim,
                email: user.email,
                hasCard: !!user.card_uid,
                isActive: user.is_active,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        });

    } catch (error) {
        console.error('Error getting user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil profil'
        });
    }
});

// 9. Change Password
app.post('/api/user/change-password', async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    try {
        // Validate input
        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'User ID, password lama, dan password baru harus diisi'
            });
        }

        // Check new password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password baru minimal 8 karakter'
            });
        }

        // Get current user
        const [users] = await pool.query(
            'SELECT id, password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const user = users[0];

        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Password lama salah'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.query(
            'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
            [hashedPassword, userId]
        );

        if (!IS_PRODUCTION) {
            console.log(`✅ Password changed for user ID: ${userId}`);
        }

        // Log password change
        logAccess(req, userId, null, 'user', 'Ganti Password', `User ID ${userId} mengganti password`);

        res.json({
            success: true,
            message: 'Password berhasil diubah'
        });

    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengubah password'
        });
    }
});

// 10. Delete User Account
app.delete('/api/user/delete-account', async (req, res) => {
    const { userId, password } = req.body;

    try {
        // Validate input
        if (!userId || !password) {
            return res.status(400).json({
                success: false,
                message: 'User ID dan password harus diisi'
            });
        }

        // Get user data
        const [users] = await pool.query(
            'SELECT id, name, email, password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Password salah'
            });
        }

        // Check if user has an active locker
        const [activeLockers] = await pool.query(
            'SELECT id, locker_code FROM lockers WHERE current_user_id = ?',
            [userId]
        );

        if (activeLockers.length > 0) {
            const lockerCode = activeLockers[0].locker_code;
            return res.status(400).json({
                success: false,
                message: `Anda masih meminjam loker ${lockerCode}. Harap kembalikan loker terlebih dahulu sebelum menghapus akun.`,
                hasActiveLocker: true,
                lockerCode: lockerCode
            });
        }

        // Log before deletion
        const userName = user.name;
        const userEmail = user.email;

        // Delete user (cascade will handle locker_usage and overtime_alerts)
        await pool.query('DELETE FROM users WHERE id = ?', [userId]);

        console.log(`🗑️ User account deleted: ${userEmail} (ID: ${userId})`);

        // Log account deletion
        logAccess(req, userId, userName, 'user', 'Hapus Akun', `User ${userName} (${userEmail}) menghapus akun`);

        // Emit real-time user update
        emitUserUpdate({
            action: 'delete',
            userId: userId,
            name: userName,
            email: userEmail,
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Akun berhasil dihapus'
        });

    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus akun'
        });
    }
});

// ==================== ADMIN AUTHENTICATION ====================

// Admin Login with JWT
app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    try {
        // Validate input  
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password harus diisi'
            });
        }

        // Find admin by username or email
        const [admins] = await pool.query(
            'SELECT * FROM admin_users WHERE (username = ? OR email = ?) AND is_active = TRUE',
            [username.toLowerCase(), username.toLowerCase()]
        );

        if (admins.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah'
            });
        }

        const admin = admins[0];

        // Check if account is locked
        if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
            const lockRemaining = Math.ceil((new Date(admin.locked_until) - new Date()) / 60000);
            return res.status(423).json({
                success: false,
                message: `Akun terkunci. Coba lagi dalam ${lockRemaining} menit.`
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);

        if (!isValidPassword) {
            // Increment login attempts
            const newAttempts = admin.login_attempts + 1;

            if (newAttempts >= 5) {
                // Lock account for 30 minutes
                await pool.query(
                    'UPDATE admin_users SET login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?',
                    [newAttempts, admin.id]
                );
                return res.status(423).json({
                    success: false,
                    message: 'Akun terkunci karena terlalu banyak percobaan. Coba lagi dalam 30 menit.'
                });
            } else {
                await pool.query(
                    'UPDATE admin_users SET login_attempts = ? WHERE id = ?',
                    [newAttempts, admin.id]
                );
            }

            return res.status(401).json({
                success: false,
                message: 'Username atau password salah',
                attemptsRemaining: 5 - newAttempts
            });
        }

        // Reset login attempts and update last login
        await pool.query(
            'UPDATE admin_users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = ?',
            [admin.id]
        );

        // Generate JWT token
        const token = generateToken(admin);

        // Log successful login (not showing sensitive data in production)
        if (!IS_PRODUCTION) {
            console.log(`✅ Admin login successful: ${admin.username}`);
        }

        // Log access for monitoring
        logAccess(req, admin.id, admin.name, 'admin', 'Admin Login', `Admin login: ${admin.username}`);

        res.json({
            success: true,
            message: 'Login berhasil',
            token: token,
            admin: {
                id: admin.id,
                username: admin.username,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        });

    } catch (error) {
        console.error('Error in admin login:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat login'
        });
    }
});

// Verify Admin Token
app.get('/api/admin/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token valid',
        admin: req.admin
    });
});

// Get Admin Profile (Protected)
app.get('/api/admin/profile', verifyToken, async (req, res) => {
    try {
        const [admins] = await pool.query(
            'SELECT id, username, email, name, role, last_login, created_at FROM admin_users WHERE id = ?',
            [req.admin.id]
        );

        if (admins.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin tidak ditemukan'
            });
        }

        res.json({
            success: true,
            admin: admins[0]
        });
    } catch (error) {
        console.error('Error getting admin profile:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan'
        });
    }
});

// Admin Logout (invalidate on client side)
app.post('/api/admin/logout', verifyToken, (req, res) => {
    // JWT tokens are stateless, logout is handled client-side
    // For extra security, you could store invalidated tokens in Redis
    if (!IS_PRODUCTION) {
        console.log(`🚪 Admin logout: ${req.admin.username}`);
    }

    // Log logout
    logAccess(req, req.admin.id, req.admin.name, 'admin', 'Admin Logout', `Admin logout: ${req.admin.username}`);

    res.json({
        success: true,
        message: 'Logout berhasil'
    });
});

// ==================== ACCESS HISTORY ====================

// Get access history for last 24 hours (Admin only)
app.get('/api/admin/access-history', verifyToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        // Get logs from last 24 hours
        const [logs] = await pool.query(`
            SELECT 
                id,
                user_id,
                user_name,
                user_type,
                action,
                details,
                page_url,
                ip_address,
                user_agent,
                created_at
            FROM access_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        // Get total count for pagination
        const [countResult] = await pool.query(`
            SELECT COUNT(*) as total 
            FROM access_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        res.json({
            success: true,
            logs: logs,
            total: countResult[0].total,
            limit: limit,
            offset: offset
        });

    } catch (error) {
        console.error('Error fetching access history:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil riwayat akses'
        });
    }
});

// Get access statistics summary (Admin only)
app.get('/api/admin/access-stats', verifyToken, async (req, res) => {
    try {
        // Get counts by user type
        const [typeStats] = await pool.query(`
            SELECT user_type, COUNT(*) as count
            FROM access_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY user_type
        `);

        // Get counts by action
        const [actionStats] = await pool.query(`
            SELECT action, COUNT(*) as count
            FROM access_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY action
            ORDER BY count DESC
            LIMIT 10
        `);

        // Get hourly activity
        const [hourlyStats] = await pool.query(`
            SELECT HOUR(created_at) as hour, COUNT(*) as count
            FROM access_logs 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            GROUP BY HOUR(created_at)
            ORDER BY hour
        `);

        res.json({
            success: true,
            byType: typeStats,
            byAction: actionStats,
            byHour: hourlyStats
        });

    } catch (error) {
        console.error('Error fetching access stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan'
        });
    }
});

// Get server console logs (Admin only)
app.get('/api/admin/server-logs', verifyToken, (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const type = req.query.type || null; // log, error, warn, info

        let filteredLogs = [...serverLogs];

        // Filter by type if specified
        if (type && ['log', 'error', 'warn', 'info'].includes(type)) {
            filteredLogs = filteredLogs.filter(l => l.type === type);
        }

        // Get last N logs (most recent first)
        const logs = filteredLogs.slice(-limit).reverse();

        res.json({
            success: true,
            logs: logs,
            total: filteredLogs.length
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil log server'
        });
    }
});

// Clear server logs (Admin only - superadmin role)
app.delete('/api/admin/server-logs', verifyToken, requireRole('superadmin'), (req, res) => {
    serverLogs.length = 0;
    console.log('🗑️ Server logs cleared by admin');

    res.json({
        success: true,
        message: 'Log server berhasil dihapus'
    });
});

// ==================== CARD MANAGEMENT ====================

// Get user's card status
app.get('/api/user/card-status', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        const [users] = await pool.query(
            'SELECT card_uid FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const hasCard = !!users[0].card_uid;

        res.json({
            success: true,
            hasCard: hasCard,
            cardUid: hasCard ? users[0].card_uid : null
        });

    } catch (error) {
        console.error('Error getting card status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengecek status kartu'
        });
    }
});

// Start card sync
// Start card sync
app.post('/api/card/start-sync', async (req, res) => {
    const { userId } = req.body;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        console.log(`🔄 Card sync started for user: ${userId}`);

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Set pairing mode in Redis with detailed state
        // Key: 'pairing_mode_active' -> Value: UserID
        // Key: 'pairing_otp' -> Value: OTP
        // Key: 'pairing_status' -> Value: 'waiting_tap'

        await redisClient.set('pairing_mode_active', userId, { EX: 120 }); // 2 minutes expiry
        await redisClient.set('pairing_otp', otp, { EX: 120 });
        await redisClient.set('pairing_status', 'waiting_tap', { EX: 120 });

        res.json({
            success: true,
            otp: otp,
            message: 'Sinkronisasi dimulai. Kode OTP telah dibuat.'
        });

    } catch (error) {
        console.error('Error starting card sync:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memulai sinkronisasi'
        });
    }
});

// Save card UID to user
app.post('/api/card/save', async (req, res) => {
    const { userId, cardUid } = req.body;

    try {
        if (!userId || !cardUid) {
            return res.status(400).json({
                success: false,
                message: 'User ID dan Card UID diperlukan'
            });
        }

        const [existingCards] = await pool.query(
            'SELECT id FROM users WHERE card_uid = ? AND id != ?',
            [cardUid, userId]
        );

        if (existingCards.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Kartu ini sudah terdaftar pada akun lain'
            });
        }

        await pool.query(
            'UPDATE users SET card_uid = ? WHERE id = ?',
            [cardUid, userId]
        );

        console.log(`✅ Card ${cardUid} saved for user ${userId}`);

        // Log card registration
        logAccess(req, userId, null, 'user', 'Daftar Kartu', `Kartu ${cardUid} didaftarkan oleh user ${userId}`);

        res.json({
            success: true,
            message: 'Kartu berhasil didaftarkan'
        });

    } catch (error) {
        console.error('Error saving card:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menyimpan kartu'
        });
    }
});

// Reset card
app.post('/api/card/reset', async (req, res) => {
    const { email, otp } = req.body;

    try {
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email dan OTP diperlukan'
            });
        }

        const storedOTP = await redisClient.get(`otp:${email}`);

        if (!storedOTP || storedOTP !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Kode OTP tidak valid atau sudah kedaluwarsa'
            });
        }

        await pool.query(
            'UPDATE users SET card_uid = NULL WHERE email = ?',
            [email]
        );

        await redisClient.del(`otp:${email}`);

        console.log(`✅ Card reset for user: ${email}`);

        res.json({
            success: true,
            message: 'Kartu berhasil direset'
        });

    } catch (error) {
        console.error('Error resetting card:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mereset kartu'
        });
    }
});

// Check card sync status (polling endpoint for real-time updates)
app.get('/api/card/sync-status', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        // Check Redis state
        const pairingUserId = await redisClient.get('pairing_mode_active');
        const pairingStatus = await redisClient.get('pairing_status'); // waiting_tap, waiting_otp, success

        const isPairingActive = pairingUserId === userId.toString();

        if (isPairingActive) {
            // Check if successful
            if (pairingStatus === 'success') {
                // Get the saved card
                const [users] = await pool.query('SELECT card_uid FROM users WHERE id = ?', [userId]);
                const cardUid = users[0]?.card_uid;

                return res.json({
                    success: true,
                    status: 'success',
                    cardUid: cardUid
                });
            }

            // Return current intermediate status
            return res.json({
                success: true,
                status: pairingStatus || 'waiting_tap',
                cardDetected: pairingStatus === 'waiting_otp' // Implies card was tapped
            });
        }

        // Not active or expired
        res.json({
            success: true,
            status: 'expired'
        });

    } catch (error) {
        console.error('Error checking sync status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengecek status sinkronisasi'
        });
    }
});

// Generate temporary PIN
app.post('/api/card/get-pin', async (req, res) => {
    const { email, otp } = req.body;

    try {
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email dan OTP diperlukan'
            });
        }

        const storedOTP = await redisClient.get(`otp:${email}`);

        if (!storedOTP || storedOTP !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Kode OTP tidak valid atau sudah kedaluwarsa'
            });
        }

        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
            'UPDATE users SET temp_pin = ?, temp_pin_expires = ? WHERE email = ?',
            [pin, expiresAt, email]
        );

        await redisClient.del(`otp:${email}`);

        console.log(`✅ Temporary PIN generated for user: ${email}`);

        res.json({
            success: true,
            message: 'PIN sementara berhasil dibuat',
            pin: pin
        });

    } catch (error) {
        console.error('Error generating PIN:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat membuat PIN'
        });
    }
});

// Verify PIN (for ESP32/Raspberry Pi)
app.post('/api/card/verify-pin', async (req, res) => {
    const { pin } = req.body;

    try {
        if (!pin) {
            return res.status(400).json({
                success: false,
                message: 'PIN diperlukan'
            });
        }

        const [users] = await pool.query(
            'SELECT id, email FROM users WHERE temp_pin = ? AND temp_pin_expires > NOW()',
            [pin]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'PIN tidak valid atau sudah kedaluwarsa'
            });
        }

        const user = users[0];

        await pool.query(
            'UPDATE users SET temp_pin = NULL, temp_pin_expires = NULL WHERE id = ?',
            [user.id]
        );

        console.log(`✅ PIN verified for user: ${user.email}`);

        res.json({
            success: true,
            message: 'PIN valid',
            userId: user.id
        });

    } catch (error) {
        console.error('Error verifying PIN:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat verifikasi PIN'
        });
    }
});

// ==================== USER STATISTICS ====================

// Get user statistics for profile page
app.get('/api/user/stats', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        // Get user's created_at (member since)
        const [users] = await pool.query(
            'SELECT created_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const memberSince = users[0].created_at;

        // Check if locker_usage table exists, if not return default values
        let totalUsage = 0;
        let totalHours = 0;
        let favoriteLocker = null;
        let lastUsed = null;

        try {
            // Get total usage count
            const [usageCount] = await pool.query(
                'SELECT COUNT(*) as count FROM locker_usage WHERE user_id = ?',
                [userId]
            );
            totalUsage = usageCount[0].count;

            // Get total hours
            const [hoursResult] = await pool.query(
                'SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes FROM locker_usage WHERE user_id = ?',
                [userId]
            );
            totalHours = Math.round(hoursResult[0].total_minutes / 60);

            // Get favorite locker (most used)
            const [favoriteResult] = await pool.query(
                `SELECT locker_number, COUNT(*) as count 
                 FROM locker_usage 
                 WHERE user_id = ? 
                 GROUP BY locker_number 
                 ORDER BY count DESC 
                 LIMIT 1`,
                [userId]
            );
            if (favoriteResult.length > 0) {
                favoriteLocker = favoriteResult[0].locker_number;
            }

            // Get last used date
            const [lastUsedResult] = await pool.query(
                'SELECT end_time FROM locker_usage WHERE user_id = ? AND end_time IS NOT NULL ORDER BY end_time DESC LIMIT 1',
                [userId]
            );
            if (lastUsedResult.length > 0) {
                lastUsed = lastUsedResult[0].end_time;
            }
        } catch (tableError) {
            // Table doesn't exist yet, return default values
            console.log('locker_usage table not found, returning default stats');
        }

        res.json({
            success: true,
            stats: {
                memberSince: memberSince,
                totalUsage: totalUsage,
                totalHours: totalHours,
                favoriteLocker: favoriteLocker,
                lastUsed: lastUsed
            }
        });

    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik'
        });
    }
});

// Get user locker usage history
app.get('/api/user/history', async (req, res) => {
    const { userId, filter } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        // Build date filter
        let dateFilter = '';
        if (filter === 'week') {
            dateFilter = 'AND lu.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        } else if (filter === 'month') {
            dateFilter = 'AND lu.start_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }

        // Get user's locker usage history (only completed usages)
        const [history] = await pool.query(`
            SELECT 
                lu.id,
                lu.locker_number as lockerId,
                lu.start_time,
                lu.end_time,
                lu.duration_minutes,
                l.locker_code
            FROM locker_usage lu
            LEFT JOIN lockers l ON lu.locker_number = l.id
            WHERE lu.user_id = ? AND lu.end_time IS NOT NULL ${dateFilter}
            ORDER BY lu.start_time DESC
            LIMIT 100
        `, [userId]);

        // Format history data
        const formattedHistory = history.map(item => {
            const startDate = new Date(item.start_time);
            const endDate = new Date(item.end_time);

            return {
                id: item.id,
                lockerId: item.lockerId,
                lockerCode: item.locker_code,
                date: item.start_time,
                startTime: startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                endTime: endDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                duration: item.duration_minutes || Math.floor((endDate - startDate) / (1000 * 60)),
                status: 'completed'
            };
        });

        res.json({
            success: true,
            history: formattedHistory,
            total: formattedHistory.length
        });

    } catch (error) {
        console.error('Error getting user history:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil riwayat'
        });
    }
});

// ==================== LOCKER MANAGEMENT ====================

// Get all lockers with their status
app.get('/api/lockers', async (req, res) => {
    try {
        // Join with users table to get current user name when locker is occupied
        const [lockers] = await pool.query(`
            SELECT 
                l.id,
                l.locker_code,
                l.status,
                l.current_user_id,
                l.updated_at,
                u.name as user_name,
                u.nim as user_nim
            FROM lockers l
            LEFT JOIN users u ON l.current_user_id = u.id
            ORDER BY l.id
        `);

        res.json({
            success: true,
            lockers: lockers.map(locker => ({
                id: locker.id,
                lockerCode: locker.locker_code,
                status: locker.status,
                currentUserId: locker.current_user_id,
                userName: locker.user_name || null,
                userNim: locker.user_nim || null,
                lastUpdated: locker.updated_at
            })),
            total: lockers.length
        });

    } catch (error) {
        console.error('Error fetching lockers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data loker'
        });
    }
});

// Release a locker
app.post('/api/lockers/release', async (req, res) => {
    const { lockerId, userId } = req.body;

    try {
        if (!lockerId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Locker ID dan User ID diperlukan'
            });
        }

        // Check if locker exists and belongs to user
        const [lockers] = await pool.query(
            'SELECT * FROM lockers WHERE id = ? AND current_user_id = ?',
            [lockerId, userId]
        );

        if (lockers.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Locker tidak ditemukan atau bukan milik Anda'
            });
        }

        // Update locker status to available and clear occupied_at
        await pool.query(
            'UPDATE lockers SET status = ?, current_user_id = NULL, occupied_at = NULL WHERE id = ?',
            ['available', lockerId]
        );

        // Update locker_usage end time
        await pool.query(
            'UPDATE locker_usage SET end_time = NOW(), duration_minutes = TIMESTAMPDIFF(MINUTE, start_time, NOW()) WHERE user_id = ? AND locker_number = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1',
            [userId, lockerId]
        );

        console.log(`✅ Locker ${lockerId} released by user ${userId}`);

        // Emit real-time update to all connected clients
        emitLockerUpdate({
            lockerId: lockerId,
            status: 'available',
            userId: null,
            action: 'release'
        });

        // Emit activity for admin dashboard
        emitNewActivity({
            lockerId: lockerId,
            userId: userId,
            action: 'release',
            timestamp: new Date().toISOString()
        });

        // Emit history update
        emitHistoryUpdate({
            lockerId: lockerId,
            userId: userId,
            action: 'release',
            timestamp: new Date().toISOString()
        });

        // Emit transaction update
        emitTransactionUpdate({
            lockerId: lockerId,
            userId: userId,
            type: 'release',
            timestamp: new Date().toISOString()
        });

        res.json({
            success: true,
            message: 'Locker berhasil dikembalikan'
        });

    } catch (error) {
        console.error('Error releasing locker:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengembalikan locker'
        });
    }
});

// Check locker usage duration (for 13-hour warning)
app.get('/api/lockers/check-duration', async (req, res) => {
    const { userId } = req.query;

    try {
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID diperlukan'
            });
        }

        // Get active locker usage for this user
        const [activeUsage] = await pool.query(
            `SELECT lu.*, l.locker_code 
             FROM locker_usage lu
             JOIN lockers l ON lu.locker_number = l.id
             WHERE lu.user_id = ? AND lu.end_time IS NULL
             ORDER BY lu.start_time DESC LIMIT 1`,
            [userId]
        );

        if (activeUsage.length === 0) {
            return res.json({
                success: true,
                hasActiveLocker: false
            });
        }

        const usage = activeUsage[0];
        const startTime = new Date(usage.start_time);
        const now = new Date();
        const durationMinutes = Math.floor((now - startTime) / (1000 * 60));
        const durationHours = durationMinutes / 60;

        // Warning thresholds
        const WARNING_13_HOURS = 13 * 60; // 780 minutes
        const WARNING_20_HOURS = 20 * 60; // 1200 minutes
        const WARNING_23_HOURS = 23 * 60; // 1380 minutes
        const MAX_24_HOURS = 24 * 60; // 1440 minutes

        let warningLevel = 'none';
        let warningMessage = '';

        if (durationMinutes >= MAX_24_HOURS) {
            warningLevel = 'critical';
            warningMessage = 'Batas waktu maksimal 24 jam telah tercapai! Silakan kembalikan locker segera.';
        } else if (durationMinutes >= WARNING_23_HOURS) {
            warningLevel = 'critical';
            warningMessage = `Peringatan! Anda sudah menggunakan locker selama ${Math.floor(durationHours)} jam. Batas waktu tersisa kurang dari 1 jam.`;
        } else if (durationMinutes >= WARNING_20_HOURS) {
            warningLevel = 'high';
            warningMessage = `Anda sudah menggunakan locker selama ${Math.floor(durationHours)} jam. Sisa waktu tersedia sekitar ${24 - Math.floor(durationHours)} jam.`;
        } else if (durationMinutes >= WARNING_13_HOURS) {
            warningLevel = 'medium';
            warningMessage = `Anda sudah menggunakan locker selama ${Math.floor(durationHours)} jam. Maksimal penggunaan adalah 24 jam.`;
        }

        res.json({
            success: true,
            hasActiveLocker: true,
            lockerId: usage.locker_number,
            lockerCode: usage.locker_code,
            startTime: usage.start_time,
            durationMinutes: durationMinutes,
            durationHours: Math.floor(durationHours),
            durationText: `${Math.floor(durationHours)} jam ${durationMinutes % 60} menit`,
            warningLevel: warningLevel,
            warningMessage: warningMessage,
            remainingMinutes: Math.max(0, MAX_24_HOURS - durationMinutes)
        });

    } catch (error) {
        console.error('Error checking locker duration:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengecek durasi locker'
        });
    }
});

// ==================== HEALTH CHECK ====================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Test locker warning email (for testing purposes)
app.post('/api/test/locker-warning-email', async (req, res) => {
    const { email, name, lockerId, durationHours, warningLevel } = req.body;

    try {
        const result = await sendLockerWarningEmail({
            email: email || 'test@example.com',
            name: name || 'Test User',
            lockerId: lockerId || 1,
            durationHours: durationHours || 13,
            warningLevel: warningLevel || 'medium',
            remainingHours: 24 - (durationHours || 13)
        });

        if (result.success) {
            console.log(`📧 Test locker warning email sent to ${email}`);
            res.json({
                success: true,
                message: 'Email peringatan berhasil dikirim',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim email',
            error: error.message
        });
    }
});

// ==================== ADMIN STATISTICS ====================

// Get dashboard statistics with real data
app.get('/api/admin/statistics', verifyToken, async (req, res) => {
    try {
        // Get locker stats
        const [lockerStats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
                SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
                SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance
            FROM lockers
        `);

        // Get total users
        const [userStats] = await pool.query(`
            SELECT COUNT(*) as total FROM users WHERE is_active = TRUE
        `);

        // Get usage statistics for last 7 days (for chart)
        const [dailyUsage] = await pool.query(`
            SELECT 
                DATE(start_time) as date,
                COUNT(*) as bookings,
                SUM(CASE WHEN end_time IS NOT NULL THEN 1 ELSE 0 END) as returns
            FROM locker_usage
            WHERE start_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(start_time)
            ORDER BY date ASC
        `);

        // Get today's statistics
        const [todayStats] = await pool.query(`
            SELECT 
                COUNT(*) as total_today,
                SUM(CASE WHEN end_time IS NOT NULL THEN 1 ELSE 0 END) as completed_today
            FROM locker_usage
            WHERE DATE(start_time) = CURDATE()
        `);

        // Get top users
        const [topUsers] = await pool.query(`
            SELECT 
                u.name,
                u.nim,
                COUNT(lu.id) as usage_count
            FROM locker_usage lu
            JOIN users u ON lu.user_id = u.id
            GROUP BY lu.user_id
            ORDER BY usage_count DESC
            LIMIT 5
        `);

        // Format daily usage for chart (fill missing days with 0)
        const last7Days = [];
        const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const found = dailyUsage.find(d => d.date && d.date.toISOString().split('T')[0] === dateStr);
            last7Days.push({
                day: dayNames[date.getDay()],
                date: dateStr,
                bookings: found ? found.bookings : 0,
                returns: found ? found.returns : 0
            });
        }

        res.json({
            success: true,
            data: {
                lockers: {
                    total: lockerStats[0]?.total || 0,
                    available: lockerStats[0]?.available || 0,
                    occupied: lockerStats[0]?.occupied || 0,
                    maintenance: lockerStats[0]?.maintenance || 0
                },
                users: {
                    total: userStats[0]?.total || 0
                },
                today: {
                    bookings: todayStats[0]?.total_today || 0,
                    completed: todayStats[0]?.completed_today || 0
                },
                chartData: last7Days,
                topUsers: topUsers
            }
        });

    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil statistik'
        });
    }
});

// ==================== ADMIN USERS MANAGEMENT ====================

// Get all users with pagination and search
app.get('/api/admin/users', async (req, res) => {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        // Build search condition
        let searchCondition = '';
        let searchParams = [];
        if (search) {
            searchCondition = 'WHERE (u.name LIKE ? OR u.nim LIKE ? OR u.email LIKE ?)';
            searchParams = [`%${search}%`, `%${search}%`, `%${search}%`];
        }

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM users u ${searchCondition}`,
            searchParams
        );
        const total = countResult[0].total;

        // Get users with locker status
        const [users] = await pool.query(`
            SELECT 
                u.id,
                u.name,
                u.nim,
                u.email,
                u.is_active,
                u.card_uid,
                u.created_at,
                l.id as locker_id,
                l.locker_code
            FROM users u
            LEFT JOIN lockers l ON l.current_user_id = u.id
            ${searchCondition}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `, [...searchParams, parseInt(limit), offset]);

        res.json({
            success: true,
            users: users.map(user => ({
                id: user.id,
                name: user.name,
                nim: user.nim,
                email: user.email,
                isActive: user.is_active,
                hasCard: !!user.card_uid,
                lockerId: user.locker_id,
                lockerCode: user.locker_code,
                createdAt: user.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data pengguna'
        });
    }
});

// Add new user from admin panel
app.post('/api/admin/add-user', async (req, res) => {
    const { name, nim, email, password } = req.body;

    try {
        // Validate input
        if (!name || !nim || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Semua field harus diisi'
            });
        }

        // Check if email exists
        const [existingEmail] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email sudah terdaftar'
            });
        }

        // Check if NIM exists
        const [existingNIM] = await pool.query('SELECT id FROM users WHERE nim = ?', [nim]);
        if (existingNIM.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'NIM sudah terdaftar'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await pool.query(
            'INSERT INTO users (name, nim, email, password_hash, is_active) VALUES (?, ?, ?, ?, TRUE)',
            [name.trim(), nim.trim(), email.toLowerCase().trim(), hashedPassword]
        );

        console.log(`✅ Admin added new user: ${email}`);

        // Emit real-time user update
        emitUserUpdate({
            action: 'add',
            userId: result.insertId,
            name: name,
            email: email,
            timestamp: new Date().toISOString()
        });

        res.status(201).json({
            success: true,
            message: 'Pengguna berhasil ditambahkan',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menambah pengguna'
        });
    }
});

// ==================== ADMIN LOCKER MANAGEMENT ====================

// Add new locker from admin panel
app.post('/api/admin/add-locker', async (req, res) => {
    const { lockerCode, location, status = 'available' } = req.body;

    try {
        if (!lockerCode) {
            return res.status(400).json({
                success: false,
                message: 'Kode locker harus diisi'
            });
        }

        // Check if locker code exists
        const [existing] = await pool.query('SELECT id FROM lockers WHERE locker_code = ?', [lockerCode]);
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Kode locker sudah ada'
            });
        }

        // Insert locker
        const [result] = await pool.query(
            'INSERT INTO lockers (locker_code, status, location) VALUES (?, ?, ?)',
            [lockerCode, status, location || null]
        );

        console.log(`✅ Admin added new locker: ${lockerCode}`);

        res.status(201).json({
            success: true,
            message: 'Locker berhasil ditambahkan',
            lockerId: result.insertId
        });

    } catch (error) {
        console.error('Error adding locker:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menambah locker'
        });
    }
});

// Update locker status
app.put('/api/admin/locker/:id/status', verifyToken, async (req, res) => {
    const lockerId = req.params.id;
    const { status } = req.body;

    try {
        // Validate status
        const validStatuses = ['available', 'occupied', 'maintenance'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid. Gunakan: available, occupied, atau maintenance'
            });
        }

        // Check if locker exists
        const [existing] = await pool.query('SELECT id, current_user_id FROM lockers WHERE id = ?', [lockerId]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Locker tidak ditemukan'
            });
        }

        // If changing to available, clear user assignment and occupied_at
        let updateQuery = 'UPDATE lockers SET status = ?';
        let params = [status];

        if (status === 'available') {
            updateQuery += ', current_user_id = NULL, occupied_at = NULL';
        } else if (status === 'maintenance') {
            updateQuery += ', current_user_id = NULL, occupied_at = NULL';
        }

        updateQuery += ' WHERE id = ?';
        params.push(lockerId);

        await pool.query(updateQuery, params);

        console.log(`✅ Admin updated locker #${lockerId} status to: ${status}`);

        // Emit real-time update
        emitLockerUpdate({
            lockerId: parseInt(lockerId),
            status: status,
            action: 'status_update'
        });

        res.json({
            success: true,
            message: `Status locker #${lockerId} berhasil diubah menjadi ${status}`
        });

    } catch (error) {
        console.error('Error updating locker status:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui status locker'
        });
    }
});

// Delete locker
app.delete('/api/admin/locker/:id', verifyToken, async (req, res) => {
    const lockerId = req.params.id;

    try {
        // Check if locker exists
        const [existing] = await pool.query('SELECT id, locker_code, status, current_user_id FROM lockers WHERE id = ?', [lockerId]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Locker tidak ditemukan'
            });
        }

        const locker = existing[0];

        // Prevent deletion if locker is currently occupied
        if (locker.status === 'occupied' && locker.current_user_id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus locker yang sedang digunakan. Kosongkan locker terlebih dahulu.'
            });
        }

        // Check for active usage
        const [activeUsage] = await pool.query(
            'SELECT id FROM locker_usage WHERE locker_number = ? AND end_time IS NULL',
            [lockerId]
        );

        if (activeUsage.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak dapat menghapus locker yang sedang dalam penggunaan aktif.'
            });
        }

        // Delete locker
        await pool.query('DELETE FROM lockers WHERE id = ?', [lockerId]);

        console.log(`🗑️ Admin deleted locker #${lockerId} (${locker.locker_code})`);

        // Emit real-time update
        emitLockerUpdate({
            lockerId: parseInt(lockerId),
            action: 'delete'
        });

        res.json({
            success: true,
            message: `Locker #${lockerId} (${locker.locker_code}) berhasil dihapus`
        });

    } catch (error) {
        console.error('Error deleting locker:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menghapus locker'
        });
    }
});

// ==================== ADMIN TRANSACTIONS ====================

// Get all locker transactions
app.get('/api/admin/transactions', async (req, res) => {
    const { type, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        let conditions = [];
        let params = [];

        // Filter by type
        if (type === 'pinjam') {
            conditions.push('lu.end_time IS NULL');
        } else if (type === 'kembali') {
            conditions.push('lu.end_time IS NOT NULL');
        }

        // Filter by date range
        if (startDate) {
            conditions.push('DATE(lu.start_time) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            conditions.push('DATE(lu.start_time) <= ?');
            params.push(endDate);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM locker_usage lu ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Get transactions
        const [transactions] = await pool.query(`
            SELECT 
                lu.id,
                lu.user_id,
                lu.locker_number,
                lu.start_time,
                lu.end_time,
                lu.duration_minutes,
                u.name as user_name,
                u.nim as user_nim,
                l.locker_code
            FROM locker_usage lu
            LEFT JOIN users u ON lu.user_id = u.id
            LEFT JOIN lockers l ON lu.locker_number = l.id
            ${whereClause}
            ORDER BY lu.start_time DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        res.json({
            success: true,
            transactions: transactions.map(t => ({
                id: t.id,
                userId: t.user_id,
                userName: t.user_name,
                userNim: t.user_nim,
                lockerId: t.locker_number,
                lockerCode: t.locker_code,
                type: t.end_time ? 'kembali' : 'pinjam',
                startTime: t.start_time,
                endTime: t.end_time,
                duration: t.duration_minutes,
                status: t.end_time ? 'completed' : 'active'
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data transaksi'
        });
    }
});

// ==================== ADMIN NOTIFICATIONS ====================

// Get admin notifications (dynamic from recent events)
app.get('/api/admin/notifications', verifyToken, async (req, res) => {
    try {
        const notifications = [];

        // Get recent new users (last 24 hours)
        const [newUsers] = await pool.query(`
            SELECT name, created_at 
            FROM users 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY created_at DESC
            LIMIT 5
        `);

        newUsers.forEach(user => {
            notifications.push({
                id: `user-${user.name}`,
                type: 'new_user',
                icon: 'fa-user-plus',
                message: `Pengguna baru: ${user.name}`,
                time: user.created_at,
                read: false
            });
        });

        // Get overtime lockers
        const [overtimeLockers] = await pool.query(`
            SELECT lu.locker_number, u.name, TIMESTAMPDIFF(HOUR, lu.start_time, NOW()) as hours
            FROM locker_usage lu
            JOIN users u ON lu.user_id = u.id
            WHERE lu.end_time IS NULL AND TIMESTAMPDIFF(HOUR, lu.start_time, NOW()) >= 24
            ORDER BY lu.start_time ASC
            LIMIT 5
        `);

        overtimeLockers.forEach(locker => {
            notifications.push({
                id: `overtime-${locker.locker_number}`,
                type: 'overtime',
                icon: 'fa-exclamation-triangle',
                iconClass: 'warning',
                message: `Locker #${locker.locker_number} overtime (${locker.hours}jam) - ${locker.name}`,
                time: new Date(),
                read: false
            });
        });

        // Get recent returns (last 1 hour)
        const [recentReturns] = await pool.query(`
            SELECT lu.locker_number, lu.end_time
            FROM locker_usage lu
            WHERE lu.end_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            ORDER BY lu.end_time DESC
            LIMIT 3
        `);

        recentReturns.forEach(ret => {
            notifications.push({
                id: `return-${ret.locker_number}-${ret.end_time}`,
                type: 'return',
                icon: 'fa-box',
                message: `Locker #${ret.locker_number} telah dikembalikan`,
                time: ret.end_time,
                read: false
            });
        });

        // Sort by time descending
        notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

        res.json({
            success: true,
            notifications: notifications.slice(0, 10),
            unreadCount: notifications.filter(n => !n.read).length
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil notifikasi'
        });
    }
});

// ==================== ADMIN ACTIVITY FEED ====================

// Get recent locker activity
app.get('/api/admin/activity', verifyToken, async (req, res) => {
    try {
        // Get last 10 locker activities
        const [activities] = await pool.query(`
            SELECT 
                lu.id,
                lu.locker_number,
                lu.start_time,
                lu.end_time,
                u.name as user_name,
                l.locker_code,
                CASE 
                    WHEN lu.end_time IS NOT NULL THEN 'return'
                    ELSE 'book'
                END as action_type
            FROM locker_usage lu
            LEFT JOIN users u ON lu.user_id = u.id
            LEFT JOIN lockers l ON lu.locker_number = l.id
            ORDER BY COALESCE(lu.end_time, lu.start_time) DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            activities: activities.map(a => ({
                id: a.id,
                lockerId: a.locker_number,
                lockerCode: a.locker_code,
                userName: a.user_name,
                actionType: a.action_type,
                time: a.action_type === 'return' ? a.end_time : a.start_time,
                message: a.action_type === 'return'
                    ? `${a.user_name} mengembalikan Locker #${a.locker_number}`
                    : `${a.user_name} meminjam Locker #${a.locker_number}`
            }))
        });

    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil aktivitas'
        });
    }
});

// ==================== ADMIN OVERTIME LOCKERS ====================

// Get list of overtime lockers (> 24 hours)
app.get('/api/admin/overtime-lockers', verifyToken, async (req, res) => {
    try {
        const [overtimeLockers] = await pool.query(`
            SELECT 
                lu.id,
                lu.user_id,
                lu.locker_number,
                lu.start_time,
                lu.warning_13h_sent,
                lu.warning_27h_sent,
                lu.taken_by_admin,
                u.name as user_name,
                u.nim as user_nim,
                u.email as user_email,
                l.locker_code,
                TIMESTAMPDIFF(MINUTE, lu.start_time, NOW()) as duration_minutes,
                FLOOR(TIMESTAMPDIFF(MINUTE, lu.start_time, NOW()) / 60) as duration_hours
            FROM locker_usage lu
            JOIN users u ON lu.user_id = u.id
            JOIN lockers l ON lu.locker_number = l.id
            WHERE lu.end_time IS NULL 
              AND TIMESTAMPDIFF(HOUR, lu.start_time, NOW()) >= 24
            ORDER BY lu.start_time ASC
        `);

        res.json({
            success: true,
            count: overtimeLockers.length,
            lockers: overtimeLockers.map(locker => ({
                ...locker,
                durationText: `${locker.duration_hours} jam ${locker.duration_minutes % 60} menit`
            }))
        });

    } catch (error) {
        console.error('Error fetching overtime lockers:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil data locker overtime'
        });
    }
});

// Admin takeover locker (confiscate items)
app.post('/api/admin/takeover-locker', verifyToken, async (req, res) => {
    const { usageId, adminNote } = req.body;

    try {
        if (!usageId) {
            return res.status(400).json({
                success: false,
                message: 'Usage ID diperlukan'
            });
        }

        // Get usage details
        const [usageDetails] = await pool.query(`
            SELECT 
                lu.*,
                u.name as user_name,
                u.email as user_email,
                l.locker_code
            FROM locker_usage lu
            JOIN users u ON lu.user_id = u.id
            JOIN lockers l ON lu.locker_number = l.id
            WHERE lu.id = ? AND lu.end_time IS NULL
        `, [usageId]);

        if (usageDetails.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data penggunaan locker tidak ditemukan'
            });
        }

        const usage = usageDetails[0];

        // Update locker_usage to mark as taken by admin
        await pool.query(`
            UPDATE locker_usage 
            SET end_time = NOW(), 
                taken_by_admin = TRUE,
                admin_takeover_at = NOW(),
                duration_minutes = TIMESTAMPDIFF(MINUTE, start_time, NOW())
            WHERE id = ?
        `, [usageId]);

        // Update locker status to available and clear occupied_at
        await pool.query(`
            UPDATE lockers SET status = 'available', current_user_id = NULL, occupied_at = NULL WHERE id = ?
        `, [usage.locker_number]);

        // Send email notification to user
        await sendItemConfiscatedEmail({
            email: usage.user_email,
            name: usage.user_name,
            lockerId: usage.locker_number,
            confiscatedAt: new Date().toLocaleString('id-ID'),
            adminNote: adminNote || null
        });

        console.log(`📦 Admin took over Locker #${usage.locker_number} from user ${usage.user_name}`);

        // Emit real-time overtime update
        emitOvertimeUpdate({
            action: 'takeover',
            lockerId: usage.locker_number,
            userId: usage.user_id,
            userName: usage.user_name,
            timestamp: new Date().toISOString()
        });

        // Also emit locker update
        emitLockerUpdate({
            lockerId: usage.locker_number,
            status: 'available',
            userId: null,
            action: 'takeover'
        });

        res.json({
            success: true,
            message: 'Barang berhasil disita. Email notifikasi telah dikirim ke user.',
            lockerId: usage.locker_number,
            userName: usage.user_name
        });

    } catch (error) {
        console.error('Error during admin takeover:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat menyita barang'
        });
    }
});

// Background job: Check locker durations and send warning emails (run every 30 minutes)
async function checkLockerDurationsAndSendWarnings() {
    try {
        console.log('⏰ Running locker duration check...');

        // Get all active lockers
        const [activeLockers] = await pool.query(`
            SELECT 
                lu.id,
                lu.user_id,
                lu.locker_number,
                lu.start_time,
                lu.warning_13h_sent,
                lu.warning_27h_sent,
                u.name as user_name,
                u.email as user_email,
                TIMESTAMPDIFF(MINUTE, lu.start_time, NOW()) as duration_minutes
            FROM locker_usage lu
            JOIN users u ON lu.user_id = u.id
            WHERE lu.end_time IS NULL
        `);

        for (const locker of activeLockers) {
            const durationHours = Math.floor(locker.duration_minutes / 60);

            // 27+ hours - Send takeover warning
            if (durationHours >= 27 && !locker.warning_27h_sent) {
                await sendTakeoverWarningEmail({
                    email: locker.user_email,
                    name: locker.user_name,
                    lockerId: locker.locker_number,
                    durationHours: durationHours
                });

                await pool.query('UPDATE locker_usage SET warning_27h_sent = TRUE WHERE id = ?', [locker.id]);
                console.log(`📧 27h warning sent to ${locker.user_email} for Locker #${locker.locker_number}`);
            }
            // 13-27 hours - Send 13h warning
            else if (durationHours >= 13 && !locker.warning_13h_sent) {
                await sendLockerWarningEmail({
                    email: locker.user_email,
                    name: locker.user_name,
                    lockerId: locker.locker_number,
                    durationHours: durationHours,
                    warningLevel: 'medium',
                    remainingHours: 24 - durationHours
                });

                await pool.query('UPDATE locker_usage SET warning_13h_sent = TRUE WHERE id = ?', [locker.id]);
                console.log(`📧 13h warning sent to ${locker.user_email} for Locker #${locker.locker_number}`);
            }
        }

        console.log(`✅ Locker duration check completed. Checked ${activeLockers.length} lockers.`);
    } catch (error) {
        console.error('❌ Error checking locker durations:', error);
    }
}

// Start background job (every 30 minutes)
setInterval(checkLockerDurationsAndSendWarnings, 30 * 60 * 1000);

// Run once on server start (after 10 seconds delay)
setTimeout(checkLockerDurationsAndSendWarnings, 10000);

// ==================== USER REPORTS ====================

// Submit a report (bug, issue, suggestion) - No auth required
app.post('/api/reports', async (req, res) => {
    const { type, email, message } = req.body;

    try {
        // Validate input
        if (!type || !message) {
            return res.status(400).json({
                success: false,
                message: 'Jenis laporan dan pesan harus diisi'
            });
        }

        // Validate type
        const validTypes = ['bug', 'login', 'register', 'locker', 'suggestion', 'other'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Jenis laporan tidak valid'
            });
        }

        // Insert report into database
        const [result] = await pool.query(
            'INSERT INTO user_reports (type, email, message, status) VALUES (?, ?, ?, ?)',
            [type, email || null, message.trim(), 'pending']
        );

        console.log(`📩 New report submitted: ${type} - ID: ${result.insertId}`);

        // Send email notification to admin (non-blocking)
        sendReportEmail({
            type,
            email: email || null,
            message: message.trim(),
            reportId: result.insertId
        }).catch(err => console.log('Could not send report email:', err.message));

        res.status(201).json({
            success: true,
            message: 'Laporan berhasil dikirim. Terima kasih!',
            reportId: result.insertId
        });

    } catch (error) {
        console.error('Error submitting report:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengirim laporan'
        });
    }
});

// Get all reports (Admin only)
app.get('/api/admin/reports', verifyToken, async (req, res) => {
    try {
        const { status, type, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM user_reports WHERE 1=1';
        const params = [];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [reports] = await pool.query(query, params);

        // Get total count
        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM user_reports');
        const total = countResult[0].total;

        res.json({
            success: true,
            reports: reports,
            total: total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error getting reports:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengambil laporan'
        });
    }
});

// Update report status (Admin only)
app.put('/api/admin/reports/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    try {
        const validStatuses = ['pending', 'in_progress', 'resolved', 'closed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status tidak valid'
            });
        }

        await pool.query(
            'UPDATE user_reports SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?',
            [status || 'pending', admin_notes || null, id]
        );

        console.log(`📝 Report ${id} updated to ${status}`);

        res.json({
            success: true,
            message: 'Laporan berhasil diperbarui'
        });

    } catch (error) {
        console.error('Error updating report:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat memperbarui laporan'
        });
    }
});

// Debug: List registered users (DEVELOPMENT ONLY - protected in production)
app.get('/api/debug/users', async (req, res) => {
    // Block access in production
    if (IS_PRODUCTION) {
        return res.status(403).json({
            success: false,
            message: 'Debug endpoint disabled in production'
        });
    }

    try {
        const [users] = await pool.query(
            'SELECT id, name, nim, email, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 20'
        );
        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Initialize server
async function startServer() {
    try {
        // Test database connection
        await testConnection();

        // Auto-migrate users table if needed
        await migrateUsersTable();

        // Connect to Redis
        await connectRedis();

        // Verify email connection
        await verifyEmailConnection();

        // Start HTTP server with Socket.IO - Listen on all interfaces for mobile access
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`📱 Mobile Access: http://192.168.40.106:${PORT}`);
            console.log(`🔌 API: http://localhost:${PORT}/api`);
            console.log(`⚡ Socket.IO: Real-time enabled`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Auto-migrate users table to add missing columns
async function migrateUsersTable() {
    try {
        // Check if users table exists, if not create it
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL DEFAULT 'User',
                nim VARCHAR(50) NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Check and add missing columns
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
        `);

        const existingColumns = columns.map(c => c.COLUMN_NAME.toLowerCase());

        // Add name column if missing
        if (!existingColumns.includes('name')) {
            await pool.query("ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT 'User' AFTER id");
            console.log('✅ Added name column to users table');
        }

        // Add nim column if missing
        if (!existingColumns.includes('nim')) {
            await pool.query("ALTER TABLE users ADD COLUMN nim VARCHAR(50) NULL AFTER name");
            console.log('✅ Added nim column to users table');
        }

        // Add is_active column if missing
        if (!existingColumns.includes('is_active')) {
            await pool.query("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER password_hash");
            console.log('✅ Added is_active column to users table');
        }

        // Add card_uid column if missing
        if (!existingColumns.includes('card_uid')) {
            await pool.query("ALTER TABLE users ADD COLUMN card_uid VARCHAR(50) DEFAULT NULL AFTER is_active");
            console.log('✅ Added card_uid column to users table');
        }

        // Add temp_pin column if missing
        if (!existingColumns.includes('temp_pin')) {
            await pool.query("ALTER TABLE users ADD COLUMN temp_pin VARCHAR(10) DEFAULT NULL AFTER card_uid");
            console.log('✅ Added temp_pin column to users table');
        }

        // Add temp_pin_expires column if missing
        if (!existingColumns.includes('temp_pin_expires')) {
            await pool.query("ALTER TABLE users ADD COLUMN temp_pin_expires TIMESTAMP NULL AFTER temp_pin");
            console.log('✅ Added temp_pin_expires column to users table');
        }

        console.log('✅ Users table migration complete');

        // Create lockers table for Python/RFID integration
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lockers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                locker_code VARCHAR(10) NOT NULL UNIQUE,
                status ENUM('available', 'occupied', 'maintenance') DEFAULT 'available',
                current_user_id INT NULL,
                location VARCHAR(100) NULL,
                occupied_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_status (status),
                INDEX idx_current_user (current_user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Insert default lockers if table is empty
        const [lockerCount] = await pool.query('SELECT COUNT(*) as count FROM lockers');
        if (lockerCount[0].count === 0) {
            await pool.query(`
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
                ('B5', 'available')
            `);
            console.log('✅ Default lockers inserted (10 lockers: A1-B5)');
        }
        console.log('✅ Lockers table ready');

        // Create locker_usage table for tracking statistics
        await pool.query(`
            CREATE TABLE IF NOT EXISTS locker_usage (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                locker_number INT NOT NULL,
                start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP NULL,
                duration_minutes INT DEFAULT 0,
                warning_13h_sent BOOLEAN DEFAULT FALSE,
                warning_27h_sent BOOLEAN DEFAULT FALSE,
                taken_by_admin BOOLEAN DEFAULT FALSE,
                admin_takeover_at TIMESTAMP NULL,
                notes TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_locker_number (locker_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Add missing columns if they don't exist
        try {
            await pool.query(`ALTER TABLE locker_usage ADD COLUMN warning_13h_sent BOOLEAN DEFAULT FALSE`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE locker_usage ADD COLUMN warning_27h_sent BOOLEAN DEFAULT FALSE`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE locker_usage ADD COLUMN taken_by_admin BOOLEAN DEFAULT FALSE`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE locker_usage ADD COLUMN admin_takeover_at TIMESTAMP NULL`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE locker_usage ADD COLUMN notes TEXT DEFAULT NULL`);
        } catch (e) { /* Column might already exist */ }

        console.log('✅ Locker usage table ready (with warning columns)');

        // Add missing columns to lockers table if they don't exist
        try {
            await pool.query(`ALTER TABLE lockers ADD COLUMN location VARCHAR(100) NULL`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE lockers ADD COLUMN occupied_at TIMESTAMP NULL`);
        } catch (e) { /* Column might already exist */ }
        try {
            await pool.query(`ALTER TABLE lockers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        } catch (e) { /* Column might already exist */ }

        console.log('✅ Lockers table columns updated');


        // Create user_reports table for bug/issue reports
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type ENUM('bug', 'login', 'register', 'locker', 'suggestion', 'other') NOT NULL,
                email VARCHAR(255) NULL,
                message TEXT NOT NULL,
                status ENUM('pending', 'in_progress', 'resolved', 'closed') DEFAULT 'pending',
                admin_notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_type (type),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ User reports table ready');

        // Create access_logs table for tracking web access history
        await pool.query(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT DEFAULT NULL,
                user_name VARCHAR(100) DEFAULT NULL,
                user_type ENUM('user', 'admin', 'guest') DEFAULT 'guest',
                action VARCHAR(100) NOT NULL,
                details TEXT DEFAULT NULL,
                page_url VARCHAR(255) DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                user_agent TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_created_at (created_at),
                INDEX idx_user_id (user_id),
                INDEX idx_action (action),
                INDEX idx_user_type (user_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Access logs table ready');

    } catch (error) {
        console.error('Error migrating tables:', error);
        // Don't exit, just log the error
    }
}

// ==================== HARDWARE EVENT ENDPOINT (Raspberry Pi) ====================
// This endpoint receives events from the Raspberry Pi when physical locker actions occur
// and broadcasts them to all connected web clients via Socket.IO for real-time updates

app.post('/api/hardware/locker-event', async (req, res) => {
    const { eventType, lockerId, lockerCode, userId, userName, action, details } = req.body;

    try {
        console.log(`🔧 Hardware Event: ${eventType} - Locker ${lockerId || lockerCode}`);

        // Validate required fields
        if (!eventType) {
            return res.status(400).json({
                success: false,
                message: 'eventType is required'
            });
        }

        // Handle different event types
        switch (eventType) {
            case 'locker_opened':
                // Locker was physically opened (RFID tap)
                emitLockerUpdate({
                    lockerId: lockerId,
                    lockerCode: lockerCode,
                    status: action === 'booking' ? 'occupied' : 'pending_release',
                    userId: userId,
                    action: action || 'opened'
                });

                emitNewActivity({
                    lockerId: lockerId,
                    userId: userId,
                    userName: userName,
                    action: action === 'booking' ? 'booking' : 'access',
                    timestamp: new Date().toISOString()
                });
                break;

            case 'locker_closed':
                // Locker door was closed after use
                const newStatus = action === 'release' ? 'available' : 'occupied';

                emitLockerUpdate({
                    lockerId: lockerId,
                    lockerCode: lockerCode,
                    status: newStatus,
                    userId: action === 'release' ? null : userId,
                    action: action || 'closed'
                });

                emitNewActivity({
                    lockerId: lockerId,
                    userId: userId,
                    userName: userName,
                    action: action || 'closed',
                    timestamp: new Date().toISOString()
                });

                if (action === 'release') {
                    emitHistoryUpdate({
                        lockerId: lockerId,
                        userId: userId,
                        userName: userName,
                        action: 'release',
                        timestamp: new Date().toISOString()
                    });

                    emitTransactionUpdate({
                        lockerId: lockerId,
                        userId: userId,
                        type: 'release',
                        timestamp: new Date().toISOString()
                    });
                } else if (action === 'booking') {
                    emitHistoryUpdate({
                        lockerId: lockerId,
                        userId: userId,
                        userName: userName,
                        action: 'booking',
                        timestamp: new Date().toISOString()
                    });

                    emitTransactionUpdate({
                        lockerId: lockerId,
                        userId: userId,
                        type: 'booking',
                        timestamp: new Date().toISOString()
                    });
                }
                break;

            case 'card_paired':
                // RFID card was linked to user
                emitUserUpdate({
                    action: 'card_paired',
                    userId: userId,
                    userName: userName,
                    timestamp: new Date().toISOString()
                });

                emitNotificationUpdate({
                    type: 'card_paired',
                    userId: userId,
                    userName: userName,
                    message: `Kartu RFID berhasil dihubungkan untuk ${userName}`,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'stats_update':
                // General stats update request
                emitStatsUpdate({
                    timestamp: new Date().toISOString()
                });
                break;

            default:
                console.log(`Unknown hardware event type: ${eventType}`);
        }

        res.json({
            success: true,
            message: 'Event broadcasted successfully'
        });

    } catch (error) {
        console.error('Error handling hardware event:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing hardware event'
        });
    }
});

startServer();
