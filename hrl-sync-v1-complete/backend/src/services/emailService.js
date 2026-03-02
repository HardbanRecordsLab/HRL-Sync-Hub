const nodemailer = require("nodemailer");
const { logger } = require("../utils/logger");

class EmailService {
  constructor() {
    this._initTransport();
  }

  _initTransport() {
    if (!process.env.SMTP_HOST) {
      logger.warn("⚠️  Email not configured (SMTP_HOST missing) — emails will be skipped");
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    logger.info("✅ Email transport configured");
  }

  async send({ to, subject, html, text }) {
    if (!this.transporter) {
      logger.info(`Email skipped (no SMTP): to=${to} subject="${subject}"`);
      return { skipped: true };
    }
    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || "HRL Sync <noreply@hardbanrecords.com>",
        to, subject, html, text,
      });
      logger.info(`Email sent: ${info.messageId} to ${to}`);
      return info;
    } catch (e) {
      logger.error("Email send failed:", e.message);
      throw e;
    }
  }

  // ── Pitch / share link email ───────────────────────────────────────────────
  async sendPitchLink({ to, recipientName, senderName, playlistName, shareUrl, message }) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'DM Sans', Arial, sans-serif; background: #0A080E; color: #E6E1FF; margin:0; padding:0; }
    .wrap { max-width: 580px; margin: 40px auto; }
    .header { background: #100D16; border: 1px solid #26203400; border-radius: 8px 8px 0 0; padding: 32px; }
    .logo { font-family: Georgia, serif; font-size: 24px; letter-spacing: 6px; color: #FF3C50; margin-bottom: 8px; }
    .label { font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #6E648C; }
    .body { background: #100D16; border: 1px solid #26203400; border-top: none; padding: 32px; }
    h1 { font-size: 20px; margin: 0 0 16px; color: #E6E1FF; }
    p { color: #B4AAD2; line-height: 1.7; margin: 0 0 16px; font-size: 14px; }
    .message-box { background: rgba(255,60,80,.06); border-left: 3px solid #FF3C50; padding: 12px 16px; border-radius: 0 4px 4px 0; margin-bottom: 24px; color: #E6E1FF; font-style: italic; font-size: 14px; }
    .cta { display: inline-block; background: #FF3C50; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 4px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 600; }
    .footer { padding: 20px 32px; text-align: center; font-size: 11px; color: #6E648C; letter-spacing: 1px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">HRL</div>
      <div class="label">Hardban Records Lab · Sync</div>
    </div>
    <div class="body">
      <h1>${senderName} shared a playlist with you</h1>
      <p>Hi ${recipientName || "there"},</p>
      <p><strong>${senderName}</strong> has sent you the playlist <strong>"${playlistName}"</strong> via HRL Sync.</p>
      ${message ? `<div class="message-box">"${message}"</div>` : ""}
      <p>Click below to listen to the tracks:</p>
      <br>
      <a href="${shareUrl}" class="cta">Open Playlist →</a>
      <br><br>
      <p style="font-size:12px;color:#6E648C">Or copy this link: ${shareUrl}</p>
    </div>
    <div class="footer">HRL SYNC · HARDBAN RECORDS LAB · <a href="https://hardbanrecords.com" style="color:#6E648C">hardbanrecords.com</a></div>
  </div>
</body>
</html>`;

    return this.send({
      to,
      subject: `${senderName} shared "${playlistName}" with you — HRL Sync`,
      html,
      text: `${senderName} shared "${playlistName}" with you.\n\nListen here: ${shareUrl}`,
    });
  }

  // ── Password reset email ───────────────────────────────────────────────────
  async sendPasswordReset({ to, resetUrl }) {
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#0A080E;color:#E6E1FF;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto">
    <p style="font-family:Georgia;font-size:22px;letter-spacing:5px;color:#FF3C50">HRL SYNC</p>
    <h2>Reset your password</h2>
    <p style="color:#B4AAD2">Click the button below to reset your HRL Sync password. This link expires in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#FF3C50;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:13px;letter-spacing:1px;text-transform:uppercase">Reset Password</a>
    <p style="margin-top:24px;font-size:12px;color:#6E648C">If you didn't request this, ignore this email. Your password won't change.</p>
  </div>
</body>
</html>`;

    return this.send({
      to,
      subject: "Reset your HRL Sync password",
      html,
      text: `Reset your HRL Sync password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    });
  }
}

module.exports = new EmailService();
