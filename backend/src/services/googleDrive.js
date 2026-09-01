const { google }          = require("googleapis");
const { logger }          = require("../utils/logger");
const { queryOne, query } = require("../db/pool");

class DriveService {
  constructor() {
    this._initServiceAccount();
  }

  _initServiceAccount() {
    try {
      const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
      if (!creds.type) throw new Error("No credentials");
      this.serviceAuth  = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive"] });
      this.serviceDrive = google.drive({ version: "v3", auth: this.serviceAuth });
      logger.info("✅ Drive service account ready");
    } catch (e) {
      logger.warn("⚠️  Drive service account not configured:", e.message);
      this.serviceDrive = null;
    }
  }

  getOAuth2Client() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  getAuthUrl(userId) {
    const c = this.getOAuth2Client();
    return c.generateAuthUrl({
      access_type: "offline",
      prompt:      "consent",
      state:       userId,
      scope: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/documents.readonly",
      ],
    });
  }

  async exchangeCode(code) {
    const c = this.getOAuth2Client();
    const { tokens } = await c.getToken(code);
    return tokens;
  }

  async saveTokens(userId, tokens) {
    await query(
      `INSERT INTO user_drive_tokens (user_id,access_token,refresh_token,expiry_date)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE
         SET access_token  = $2,
             refresh_token = COALESCE($3, user_drive_tokens.refresh_token),
             expiry_date   = $4,
             updated_at    = now()`,
      [userId, tokens.access_token, tokens.refresh_token ?? null, tokens.expiry_date ?? null]
    );
  }

  // ── Get per-user authenticated Drive client ─────────────────────────────────
  async _getUserDrive(userId) {
    const tokens = await queryOne(
      "SELECT access_token,refresh_token,expiry_date FROM user_drive_tokens WHERE user_id=$1",
      [userId]
    );
    if (!tokens) {
      const err = new Error("Google Drive not connected. Please reconnect in Settings.");
      err.status = 400; err.code = "DRIVE_NOT_CONNECTED";
      throw err;
    }

    const oauth = this.getOAuth2Client();
    oauth.setCredentials({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date:   tokens.expiry_date,
    });

    // Auto-save refreshed tokens
    oauth.on("tokens", async (t) => {
      if (t.access_token) {
        await query(
          `UPDATE user_drive_tokens
           SET access_token=$1, expiry_date=$2, updated_at=now()
           WHERE user_id=$3`,
          [t.access_token, t.expiry_date ?? null, userId]
        ).catch(e => logger.warn("Token save failed:", e.message));
      }
    });

    // Preemptively refresh if token expires in < 5 minutes
    const now = Date.now();
    if (tokens.expiry_date && tokens.expiry_date - now < 300_000) {
      try {
        const { credentials } = await oauth.refreshAccessToken();
        await this.saveTokens(userId, credentials);
        oauth.setCredentials(credentials);
      } catch (e) {
        // refresh_token may have been revoked — clear and ask user to reconnect
        logger.warn(`Drive token refresh failed for user ${userId}:`, e.message);
        if (e.message?.includes("invalid_grant") || e.message?.includes("Token has been expired")) {
          await query("DELETE FROM user_drive_tokens WHERE user_id=$1", [userId]);
          const err = new Error("Drive access expired. Please reconnect in Settings → Integrations.");
          err.status = 401; err.code = "DRIVE_TOKEN_EXPIRED";
          throw err;
        }
      }
    }

    return google.drive({ version: "v3", auth: oauth });
  }

  // ── List files ──────────────────────────────────────────────────────────────
  async listFiles(userId, { folderId, mimeTypes, search, pageToken, pageSize = 50 } = {}) {
    const drive = await this._getUserDrive(userId);
    const root  = folderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "root";

    let q = `'${root}' in parents and trashed = false`;
    if (mimeTypes?.length) {
      q += ` and (${mimeTypes.map(m => `mimeType = '${m}'`).join(" or ")})`;
    }
    if (search) q += ` and name contains '${search.replace(/'/g, "\\'")}'`;

    const res = await drive.files.list({
      q,
      pageSize,
      pageToken,
      fields: "nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,description)",
      orderBy: "modifiedTime desc",
    });

    return res.data;
  }

  // ── Get file metadata ───────────────────────────────────────────────────────
  async getFileMeta(userId, fileId) {
    const drive = await this._getUserDrive(userId);
    const res   = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,size,createdTime,modifiedTime,webViewLink",
    });
    return res.data;
  }

  // ── Stream file (full) ──────────────────────────────────────────────────────
  async streamFile(userId, fileId, res) {
    const drive = await this._getUserDrive(userId);
    const meta  = await drive.files.get({ fileId, fields: "name,mimeType,size" });
    const { name, mimeType, size } = meta.data;

    res.setHeader("Content-Type",        mimeType || "audio/mpeg");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
    if (size)  res.setHeader("Content-Length", size);
    res.setHeader("Accept-Ranges",  "bytes");
    res.setHeader("Cache-Control",  "no-store");

    const stream = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
    stream.data
      .on("error", (e) => { logger.error("Drive stream error:", e.message); if (!res.headersSent) res.end(); })
      .pipe(res);
  }

  // ── Range streaming (for seek support) ─────────────────────────────────────
  async streamFileRange(userId, fileId, rangeHeader, res) {
    const drive = await this._getUserDrive(userId);
    const meta  = await drive.files.get({ fileId, fields: "name,mimeType,size" });
    const { mimeType, size } = meta.data;
    const total = parseInt(size || "0");

    if (!total) {
      // Unknown size — fall back to full stream
      return this.streamFile(userId, fileId, res);
    }

    let start = 0, end = total - 1;
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end   = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1_048_576, total - 1);
    }
    // Clamp
    start = Math.max(0, Math.min(start, total - 1));
    end   = Math.max(start, Math.min(end, total - 1));

    res.status(206);
    res.setHeader("Content-Range",  `bytes ${start}-${end}/${total}`);
    res.setHeader("Accept-Ranges",  "bytes");
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Content-Type",   mimeType || "audio/mpeg");
    res.setHeader("Cache-Control",  "no-store");

    const stream = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream", headers: { Range: `bytes=${start}-${end}` } }
    );
    stream.data
      .on("error", (e) => { logger.error("Drive range stream error:", e.message); if (!res.headersSent) res.end(); })
      .pipe(res);
  }

  // ── Drive connection status ─────────────────────────────────────────────────
  async getStatus(userId) {
    const row = await queryOne(
      "SELECT updated_at, expiry_date FROM user_drive_tokens WHERE user_id=$1",
      [userId]
    );
    if (!row) return { connected: false };

    const isExpired = row.expiry_date && row.expiry_date < Date.now();
    return {
      connected:    true,
      connectedAt:  row.updated_at,
      tokenExpired: isExpired,
    };
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────
  async disconnect(userId) {
    const tokens = await queryOne("SELECT access_token FROM user_drive_tokens WHERE user_id=$1", [userId]);
    if (tokens) {
      // Try to revoke access
      try {
        const oauth = this.getOAuth2Client();
        oauth.setCredentials({ access_token: tokens.access_token });
        await oauth.revokeCredentials();
      } catch (e) {
        logger.warn("Could not revoke Drive token:", e.message);
      }
    }
    await query("DELETE FROM user_drive_tokens WHERE user_id=$1", [userId]);
  }

  // ── Read Google Doc ─────────────────────────────────────────────────────────
  async readGoogleDoc(userId, docId) {
    const tokens = await queryOne(
      "SELECT access_token,refresh_token,expiry_date FROM user_drive_tokens WHERE user_id=$1",
      [userId]
    );
    if (!tokens) {
      const err = new Error("Drive not connected"); err.status = 400; throw err;
    }

    const oauth = this.getOAuth2Client();
    oauth.setCredentials(tokens);

    // preemptive refresh
    if (tokens.expiry_date && tokens.expiry_date - Date.now() < 300_000) {
      try {
        const { credentials } = await oauth.refreshAccessToken();
        await this.saveTokens(userId, credentials);
        oauth.setCredentials(credentials);
      } catch (e) {
        if (e.message?.includes("invalid_grant")) {
          await query("DELETE FROM user_drive_tokens WHERE user_id=$1", [userId]);
          const err = new Error("Drive access expired. Please reconnect."); err.status = 401; throw err;
        }
      }
    }

    const docs = google.docs({ version: "v1", auth: oauth });
    const doc  = await docs.documents.get({ documentId: docId });

    // Extract plain text from doc body
    let text = "";
    (doc.data.body?.content ?? []).forEach(el => {
      if (el.paragraph) {
        el.paragraph.elements?.forEach(pe => {
          if (pe.textRun?.content) text += pe.textRun.content;
        });
      }
    });

    return { title: doc.data.title, text: text.trim() };
  }
}

module.exports = new DriveService();
