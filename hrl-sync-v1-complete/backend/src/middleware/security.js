/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — PREMIUM PRO SECURITY SETUP
 * ═══════════════════════════════════════════════════════════════════════════
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

// ═════════════════════════════════════════════════════════════════════════════
// 1. ENHANCED HELMET CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const getHelmetConfig = () => ({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://polyfill.io"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "https:", "data:", "*"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "*"],
            mediaSrc: ["'self'", "*"],
            frameSrc: ["*"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hidePoweredBy: true,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false, // Set to false to allow cross-origin images/media
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ADVANCED RATE LIMITING
// ═════════════════════════════════════════════════════════════════════════════

class RateLimitManager {
    getGlobalLimiter() {
        return rateLimit({
            windowMs: 15 * 60 * 1000,
            max: (req) => {
                if (req.user?.tier === 'premium') return 2000;
                if (req.user?.tier === 'pro') return 1000;
                return 300;
            },
            keyGenerator: (req) => req.user?.id || req.ip,
            skip: (req) => req.user?.is_admin === true,
            handler: (req, res) => {
                res.status(429).json({
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: 'Zbyt wiele żądań. Spróbuj za kilka minut.',
                });
            },
        });
    }

    getAuthLimiter() {
        return rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 10,
            skipSuccessfulRequests: true,
            handler: (req, res) => {
                res.status(429).json({
                    error: 'TOO_MANY_LOGIN_ATTEMPTS',
                    message: 'Zbyt wiele nieudanych prób logowania. Spróbuj za 15 minut.',
                });
            },
        });
    }

    getUploadLimiter() {
        return rateLimit({
            windowMs: 60 * 60 * 1000,
            max: (req) => {
                if (req.user?.tier === 'premium') return 100;
                if (req.user?.tier === 'pro') return 30;
                return 10;
            },
            keyGenerator: (req) => req.user?.id || req.ip,
        });
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. DATA ENCRYPTION
// ═════════════════════════════════════════════════════════════════════════════

class EncryptionManager {
    constructor(encryptionKey = process.env.ENCRYPTION_KEY) {
        if (!encryptionKey || encryptionKey.length < 32) {
            this.key = Buffer.from('default-secret-key-32-chars-long-!!'); // Fallback for dev
        } else {
            this.key = Buffer.from(encryptionKey.substring(0, 32));
        }
    }

    encrypt(data) {
        const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    }

    decrypt(encryptedData) {
        try {
            const [ivHex, tagHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const tag = Buffer.from(tagHex, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            return null;
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. JWT TOKEN MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

class JWTManager {
    constructor(secretKey = process.env.JWT_SECRET) {
        this.secret = secretKey || 'fallback-secret-for-jwt-management-!!';
    }

    generateAccessToken(userId, email, tier = 'free') {
        return jwt.sign({ userId, email, tier, type: 'access' }, this.secret, {
            expiresIn: '15m',
            issuer: 'hrl-sync',
            audience: 'api',
        });
    }

    generateRefreshToken(userId) {
        return jwt.sign({ userId, type: 'refresh' }, this.secret, {
            expiresIn: '30d',
            issuer: 'hrl-sync',
        });
    }

    verifyAccessToken(token) {
        return jwt.verify(token, this.secret, { issuer: 'hrl-sync', audience: 'api' });
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
    getHelmetConfig,
    RateLimitManager: new RateLimitManager(),
    EncryptionManager: new EncryptionManager(),
    JWTManager: new JWTManager(),
};
