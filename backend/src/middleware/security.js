/**
 * Security middleware — Helmet CSP + rate limiting.
 */
const rateLimit = require("express-rate-limit");

const getHelmetConfig = () => ({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https:", "data:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https:"],
      mediaSrc: ["'self'", "https:", "blob:"],
      frameSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Embed player is served from this API and framed by partner sites.
      frameAncestors: ["'self'", "https:"],
      upgradeInsecureRequests: [],
    },
  },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // Not frameguard:deny — the /api/embed player is meant to be iframed.
  frameguard: false,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

class RateLimitManager {
  getGlobalLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id || req.ip,
      skip: (req) => req.user?.is_admin === true,
      handler: (req, res) =>
        res.status(429).json({ error: "RATE_LIMIT_EXCEEDED", message: "Zbyt wiele żądań. Spróbuj za kilka minut." }),
    });
  }

  getAuthLimiter() {
    return rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      skipSuccessfulRequests: true,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({ error: "TOO_MANY_LOGIN_ATTEMPTS", message: "Zbyt wiele prób logowania. Spróbuj za 15 minut." }),
    });
  }

  getUploadLimiter() {
    return rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.id || req.ip,
    });
  }
}

module.exports = {
  getHelmetConfig,
  RateLimitManager: new RateLimitManager(),
};
