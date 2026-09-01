const { logger } = require("../utils/logger");

module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${status}: ${err.message}\n${err.stack || ""}`);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${status}: ${err.message}`);
  }
  const message =
    process.env.NODE_ENV === "production" && status === 500 ? "Internal server error" : err.message;
  res.status(status).json({ error: message, code: err.code });
};
