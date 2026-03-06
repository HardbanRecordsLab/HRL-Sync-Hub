/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — PREMIUM PRO SECURITY SETUP
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Zawiera wszystkie necesarne komponenty bezpieczeństwa dla wersji premium
 * Installation: npm install helmet@^8.0.0 express-rate-limit jsonwebtoken bcryptjs
 * 
 */

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');

// ═════════════════════════════════════════════════════════════════════════════
// 1. ENHANCED HELMET CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

const getHelmetConfig = () => ({
  // ✅ Content Security Policy - ścisły
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://polyfill.io",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // ⚠️ Tylko dla dev, usunąć w prod
        "https://fonts.googleapis.com",
      ],
      imgSrc: ["'self'", "https:", "data:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.example.com"],
      mediaSrc: ["'self'", "https://cdn.example.com"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // ✅ Disable X-Powered-By header
  hidePoweredBy: true,
  
  // ✅ HSTS - Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 rok
    includeSubDomains: true,
    preload: true,
  },
  
  // ✅ Prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  
  // ✅ Prevent MIME type sniffing
  noSniff: true,
  
  // ✅ XSS Protection
  xssFilter: true,
  
  // ✅ Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  
  // ✅ Cross-Origin Policies
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ADVANCED RATE LIMITING
// ═════════════════════════════════════════════════════════════════════════════

class RateLimitManager {
  constructor(redisClient = null) {
    this.redis = redisClient;
  }

  // Global API limiter
  getGlobalLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minut
      max: (req, res) => {
        // Premium users get higher limit
        if (req.user?.tier === 'premium') return 2000;
        if (req.user?.tier === 'pro') return 1000;
        return 300; // Free tier
      },
      keyGenerator: (req) => {
        // Use user ID if logged in, otherwise IP
        return req.user?.id || req.ip;
      },
      skip: (req) => {
        // Skip rate limiting for admins
        return req.user?.is_admin === true;
      },
      handler: (req, res) => {
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          retryAfter: req.rateLimit.resetTime,
          message: 'Zbyt wiele żądań. Spróbuj za kilka minut.',
        });
      },
    });
  }

  // Strict auth limiter
  getAuthLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5, // Tylko 5 prób login w 15 minut
      skipSuccessfulRequests: true,
      handler: (req, res) => {
        res.status(429).json({
          error: 'TOO_MANY_LOGIN_ATTEMPTS',
          message: 'Zbyt wiele nieudanych prób logowania. Spróbuj za 15 minut.',
        });
      },
    });
  }

  // File upload limiter
  getUploadLimiter() {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 godzina
      max: (req, res) => {
        // Limit based on tier
        if (req.user?.tier === 'premium') return 100; // 100 uploadów/godzina
        if (req.user?.tier === 'pro') return 30;
        return 10;
      },
      keyGenerator: (req) => req.user?.id || req.ip,
    });
  }

  // API endpoint specific limiter
  createEndpointLimiter(maxRequests, windowMs = 60000) {
    return rateLimit({
      windowMs,
      max: maxRequests,
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
      throw new Error('ENCRYPTION_KEY must be 32+ bytes');
    }
    this.key = Buffer.from(encryptionKey.substring(0, 32));
  }

  /**
   * Encrypt sensitive data (e.g., API keys, refresh tokens)
   * @param {string|object} data - Data to encrypt
   * @returns {string} - Encrypted data in format: iv:tag:encrypted
   */
  encrypt(data) {
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedData - Encrypted data in format: iv:tag:encrypted
   * @returns {string} - Decrypted data
   */
  decrypt(encryptedData) {
    const [ivHex, tagHex, encrypted] = encryptedData.split(':');
    
    if (!ivHex || !tagHex || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Decrypt as JSON
   */
  decryptJSON(encryptedData) {
    const decrypted = this.decrypt(encryptedData);
    return JSON.parse(decrypted);
  }

  /**
   * Hash sensitive data (one-way, for comparison)
   */
  hash(data) {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. JWT TOKEN MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

class JWTManager {
  constructor(secretKey = process.env.JWT_SECRET) {
    if (!secretKey || secretKey.length < 32) {
      throw new Error('JWT_SECRET must be 32+ bytes');
    }
    this.secret = secretKey;
  }

  /**
   * Generate access token (short-lived, 15 minutes)
   */
  generateAccessToken(userId, email, tier = 'free') {
    return jwt.sign(
      {
        userId,
        email,
        tier,
        type: 'access',
      },
      this.secret,
      {
        expiresIn: '15m',
        issuer: 'hrl-sync',
        audience: 'api',
      }
    );
  }

  /**
   * Generate refresh token (long-lived, 30 days)
   */
  generateRefreshToken(userId) {
    return jwt.sign(
      {
        userId,
        type: 'refresh',
        jti: crypto.randomBytes(16).toString('hex'), // Unique ID for revocation
      },
      this.secret,
      {
        expiresIn: '30d',
        issuer: 'hrl-sync',
      }
    );
  }

  /**
   * Generate API key (for programmatic access)
   */
  generateAPIKey(userId, name = 'default') {
    const key = crypto.randomBytes(32).toString('hex');
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(key + userId)
      .digest('hex');

    return `hrl_${key}_${signature}`.substring(0, 64); // HRL key format
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'hrl-sync',
        audience: 'api',
      });
    } catch (err) {
      throw new Error(`INVALID_TOKEN: ${err.message}`);
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.secret, {
        issuer: 'hrl-sync',
      });
    } catch (err) {
      throw new Error(`INVALID_REFRESH_TOKEN: ${err.message}`);
    }
  }

  /**
   * Verify API key
   */
  verifyAPIKey(apiKey, userId) {
    const [type, key, signature] = apiKey.split('_');
    
    if (type !== 'hrl') {
      throw new Error('INVALID_API_KEY_FORMAT');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(key + userId)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new Error('INVALID_API_KEY_SIGNATURE');
    }

    return true;
  }

  /**
   * Decode token without verification (for debugging)
   */
  decode(token) {
    return jwt.decode(token);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. INPUT VALIDATION MIDDLEWARE
// ═════════════════════════════════════════════════════════════════════════════

class ValidationMiddleware {
  static validateTrack() {
    return [
      body('title')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Tytuł musi mieć 1-200 znaków'),
      
      body('artist')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Artysta musi mieć 1-200 znaków'),
      
      body('bpm')
        .optional()
        .isInt({ min: 1, max: 500 })
        .withMessage('BPM musi być między 1-500'),
      
      body('isrc')
        .optional()
        .matches(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/)
        .withMessage('Nieprawidłowy format ISRC'),
      
      body('iswc')
        .optional()
        .matches(/^T-\d{3}.\d{3}.\d{3}-\d$/)
        .withMessage('Nieprawidłowy format ISWC'),
      
      body('key')
        .optional()
        .isIn(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
        .withMessage('Nieprawidłowy klawisz'),
      
      body('duration')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Czas trwania musi być dodatni'),
    ];
  }

  static validatePlaylist() {
    return [
      body('title')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Tytuł playlisty musi mieć 1-200 znaków'),
      
      body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 }),
      
      body('isPublic')
        .optional()
        .isBoolean(),
    ];
  }

  static validateProject() {
    return [
      body('name')
        .trim()
        .isLength({ min: 1, max: 200 }),
      
      body('status')
        .optional()
        .isIn(['to_do', 'sent', 'shortlist', 'licensed', 'archived']),
      
      body('budget')
        .optional()
        .isDecimal({ min: 0 }),
    ];
  }

  static validateEmail() {
    return [
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Nieprawidłowy email'),
    ];
  }

  static validatePassword() {
    return [
      body('password')
        .isLength({ min: 12 })
        .withMessage('Hasło musi mieć min. 12 znaków')
        .matches(/[A-Z]/)
        .withMessage('Hasło musi zawierać wielkie litery')
        .matches(/[a-z]/)
        .withMessage('Hasło musi zawierać małe litery')
        .matches(/[0-9]/)
        .withMessage('Hasło musi zawierać cyfry')
        .matches(/[!@#$%^&*]/)
        .withMessage('Hasło musi zawierać znaki specjalne'),
    ];
  }

  /**
   * Middleware to handle validation errors
   */
  static handleErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        details: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
        })),
      });
    }
    next();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. AUTHENTICATION MIDDLEWARE
// ═════════════════════════════════════════════════════════════════════════════

class AuthMiddleware {
  constructor(jwtManager) {
    this.jwtManager = jwtManager;
  }

  /**
   * Verify JWT token
   */
  verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Brakuje tokena autoryzacji',
      });
    }

    const token = authHeader.substring(7);

    try {
      const payload = this.jwtManager.verifyAccessToken(token);
      req.user = {
        id: payload.userId,
        email: payload.email,
        tier: payload.tier,
      };
      next();
    } catch (err) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: err.message,
      });
    }
  };

  /**
   * Verify API key
   */
  verifyAPIKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: 'MISSING_API_KEY',
      });
    }

    try {
      // Verify API key in database (implement this)
      // const isValid = await apiKeyService.verify(apiKey);
      // if (!isValid) throw new Error('Invalid API key');
      
      req.apiKey = apiKey;
      next();
    } catch (err) {
      return res.status(401).json({
        error: 'INVALID_API_KEY',
      });
    }
  };

  /**
   * Require specific tier
   */
  requireTier(minTier = 'free') {
    const tiers = { free: 0, pro: 1, premium: 2, enterprise: 3 };
    const minLevel = tiers[minTier] || 0;

    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
      }

      const userLevel = tiers[req.user.tier] || 0;
      if (userLevel < minLevel) {
        return res.status(403).json({
          error: 'INSUFFICIENT_TIER',
          requiredTier: minTier,
          currentTier: req.user.tier,
        });
      }

      next();
    };
  }

  /**
   * Require admin role
   */
  requireAdmin = (req, res, next) => {
    if (!req.user?.is_admin) {
      return res.status(403).json({
        error: 'ADMIN_REQUIRED',
      });
    }
    next();
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. EXAMPLE SETUP
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Setup middleware w Express aplikacji
 */
function setupSecurityMiddleware(app) {
  const rateLimitManager = new RateLimitManager();
  const encryptionManager = new EncryptionManager();
  const jwtManager = new JWTManager();
  const authMiddleware = new AuthMiddleware(jwtManager);

  // ✅ Helmet security headers
  app.use(helmet(getHelmetConfig()));

  // ✅ Global rate limiting
  app.use('/api/', rateLimitManager.getGlobalLimiter());

  // ✅ Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ✅ CORS with strict config
  app.use(require('cors')({
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  }));

  // ✅ Request ID for tracking
  app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTES WITH SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  // ✅ Auth routes (rate limited)
  app.post(
    '/api/auth/login',
    rateLimitManager.getAuthLimiter(),
    async (req, res) => {
      // ... login logic
    }
  );

  app.post(
    '/api/auth/register',
    rateLimitManager.getAuthLimiter(),
    ValidationMiddleware.validateEmail(),
    ValidationMiddleware.validatePassword(),
    ValidationMiddleware.handleErrors,
    async (req, res) => {
      // ... register logic
    }
  );

  // ✅ Protected routes (auth required)
  app.post(
    '/api/tracks',
    authMiddleware.verifyToken,
    authMiddleware.requireTier('free'),
    rateLimitManager.getUploadLimiter(),
    ValidationMiddleware.validateTrack(),
    ValidationMiddleware.handleErrors,
    async (req, res) => {
      // ... create track logic
    }
  );

  // ✅ Premium-only routes
  app.post(
    '/api/integrations/spotify/sync',
    authMiddleware.verifyToken,
    authMiddleware.requireTier('premium'),
    async (req, res) => {
      // ... spotify sync logic
    }
  );

  // ✅ Admin routes
  app.get(
    '/api/admin/users',
    authMiddleware.verifyToken,
    authMiddleware.requireAdmin,
    async (req, res) => {
      // ... admin logic
    }
  );

  return {
    rateLimitManager,
    encryptionManager,
    jwtManager,
    authMiddleware,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  getHelmetConfig,
  RateLimitManager,
  EncryptionManager,
  JWTManager,
  ValidationMiddleware,
  AuthMiddleware,
  setupSecurityMiddleware,
};

// ═════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VARIABLES REQUIRED
// ═════════════════════════════════════════════════════════════════════════════

/*
ENCRYPTION_KEY=your-32-byte-encryption-key-min-32-chars-here
JWT_SECRET=your-32-byte-jwt-secret-key-min-32-chars-here
ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
NODE_ENV=production
*/
