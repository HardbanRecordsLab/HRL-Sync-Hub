/**
 * Object storage for library audio.
 *
 *   STORAGE_DRIVER=s3   → MinIO / S3-compatible (production; docker-compose ships MinIO)
 *   STORAGE_DRIVER=fs   → local directory (dev without MinIO, and the E2E test)
 *
 * The API always proxies bytes through /api/tracks/stream/:id (the auth / share-token
 * gate) — objects are never exposed publicly, so no presigned URLs.
 */
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { logger } = require("../utils/logger");

const DRIVER = (process.env.STORAGE_DRIVER || "s3").toLowerCase();
const BUCKET = process.env.S3_BUCKET || "hrl-audio";

// ── fs driver ───────────────────────────────────────────────────────────────
const FS_ROOT = process.env.STORAGE_FS_DIR || path.join(__dirname, "../../uploads");

const fsDriver = {
  async ensureReady() {
    await fs.promises.mkdir(FS_ROOT, { recursive: true });
  },
  async putFile(key, tmpPath /*, contentType */) {
    await fs.promises.mkdir(FS_ROOT, { recursive: true });
    const dest = path.join(FS_ROOT, path.basename(key));
    await fs.promises.rename(tmpPath, dest).catch(async (e) => {
      if (e.code !== "EXDEV") throw e; // cross-device: copy + unlink
      await pipeline(fs.createReadStream(tmpPath), fs.createWriteStream(dest));
      await fs.promises.unlink(tmpPath);
    });
  },
  async head(key) {
    try {
      const st = await fs.promises.stat(path.join(FS_ROOT, path.basename(key)));
      return { size: st.size };
    } catch {
      return null;
    }
  },
  getStream(key, { start, end } = {}) {
    const opts = {};
    if (Number.isInteger(start)) opts.start = start;
    if (Number.isInteger(end)) opts.end = end;
    return fs.createReadStream(path.join(FS_ROOT, path.basename(key)), opts);
  },
  async remove(key) {
    await fs.promises.unlink(path.join(FS_ROOT, path.basename(key))).catch(() => {});
  },
};

// ── s3 driver (MinIO SDK — also speaks AWS S3, Cloudflare R2, Backblaze B2) ──
let _client = null;
function s3client() {
  if (_client) return _client;
  const { Client } = require("minio");
  const endpoint = new URL(process.env.S3_ENDPOINT || "http://minio:9000");
  _client = new Client({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port) || (endpoint.protocol === "https:" ? 443 : 80),
    useSSL: endpoint.protocol === "https:",
    accessKey: process.env.S3_ACCESS_KEY || "",
    secretKey: process.env.S3_SECRET_KEY || "",
    region: process.env.S3_REGION || "us-east-1",
  });
  return _client;
}

const s3Driver = {
  async ensureReady() {
    const c = s3client();
    const exists = await c.bucketExists(BUCKET).catch(() => false);
    if (!exists) {
      await c.makeBucket(BUCKET, process.env.S3_REGION || "us-east-1");
      logger.info(`Created object storage bucket "${BUCKET}"`);
    }
  },
  async putFile(key, tmpPath, contentType) {
    const c = s3client();
    const { size } = await fs.promises.stat(tmpPath);
    await c.fPutObject(BUCKET, key, tmpPath, { "Content-Type": contentType || "application/octet-stream" });
    await fs.promises.unlink(tmpPath).catch(() => {});
    return { size };
  },
  async head(key) {
    try {
      const st = await s3client().statObject(BUCKET, key);
      return { size: st.size };
    } catch {
      return null;
    }
  },
  async getStream(key, { start, end } = {}) {
    if (Number.isInteger(start)) {
      const length = Number.isInteger(end) ? end - start + 1 : 0;
      return s3client().getPartialObject(BUCKET, key, start, length || undefined);
    }
    return s3client().getObject(BUCKET, key);
  },
  async remove(key) {
    await s3client().removeObject(BUCKET, key).catch(() => {});
  },
};

const driver = DRIVER === "fs" ? fsDriver : s3Driver;

module.exports = {
  driver: DRIVER,
  bucket: BUCKET,
  ensureReady: () => driver.ensureReady(),
  putFile: (key, tmpPath, contentType) => driver.putFile(key, tmpPath, contentType),
  head: (key) => driver.head(key),
  getStream: (key, range) => driver.getStream(key, range),
  remove: (key) => driver.remove(key),
};
