const { logger } = require("../utils/logger");

module.exports = (err, req, res, next) => {
  logger.error({ msg: err.message, path: req.path, stack: err.stack?.split("\n")[1] });
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === "production" && status === 500
    ? "Internal server error" : err.message;
  res.status(status).json({ error: message });
};
