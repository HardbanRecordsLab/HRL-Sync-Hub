// Minimal Stripe client (Checkout + webhook signature) over the REST API — no SDK needed.
const crypto = require("crypto");

const API = "https://api.stripe.com/v1";

function configured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Stripe expects application/x-www-form-urlencoded with bracketed nested keys. */
function encode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? encode(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Stripe HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** One-off Checkout session for a licence. Amount in cents (USD). */
function createCheckoutSession({ orderId, title, description, amount, email, successUrl, cancelUrl, lang }) {
  return call("POST", "/checkout/sessions", {
    mode: "payment",
    customer_email: email,
    client_reference_id: orderId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: lang === "pl" || lang === "en" ? lang : "auto",
    metadata: { order_id: orderId, app: "hrl-sync" },
    payment_intent_data: { metadata: { order_id: orderId, app: "hrl-sync" } },
    line_items: {
      0: {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: title, description },
        },
      },
    },
  });
}

function retrieveSession(id) {
  return call("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
}

/** Verify a Stripe-Signature header against the raw request body (Buffer). */
function verifyWebhook(rawBody, header, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 300) {
  if (!secret || !header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()])
  );
  const sigs = header.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  const t = parseInt(parts.t, 10);
  if (!t || !sigs.length) return null;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody.toString("utf8")}`).digest("hex");
  const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return null;
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { configured, createCheckoutSession, retrieveSession, verifyWebhook };
