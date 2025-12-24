const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'smartlocker-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
function generateToken(admin) {
    return jwt.sign(
        {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            name: admin.name,
            role: admin.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

// Verify JWT token middleware
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired, please login again'
            });
        }
        return res.status(403).json({
            success: false,
            message: 'Invalid token'
        });
    }
}

// Check if admin has required role
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!roles.includes(req.admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        next();
    };
}

module.exports = {
    generateToken,
    verifyToken,
    requireRole,
    JWT_SECRET
};
