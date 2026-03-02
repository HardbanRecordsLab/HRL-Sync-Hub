const winston = require("winston");
const path    = require("path");

const logDir = process.env.LOG_DIR || "logs";
require("fs").mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp }) =>
          `${timestamp} ${level}: ${message}`)
      ),
    }),
    new winston.transports.File({ filename: path.join(logDir, "error.log"),    level: "error", maxsize: 5_242_880, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, "combined.log"), maxsize: 10_485_760, maxFiles: 10 }),
  ],
});

module.exports = { logger };
