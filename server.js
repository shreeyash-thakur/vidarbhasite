require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const crypto  = require("crypto");
const path    = require("path");
const Razorpay = require("razorpay");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files (all 3 HTML pages + images folder) ───────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Razorpay helpers ───────────────────────────────────────────────────────
function getRazorpay() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env");
  }
  return new Razorpay({ key_id, key_secret });
}

// ── POST /api/create-order ─────────────────────────────────────────────────
// Creates a ₹20 order (2000 paise) for 3 trip-plan generations
app.post("/api/create-order", async (req, res) => {
  try {
    const rzp   = getRazorpay();
    const order = await rzp.orders.create({
      amount:   2000,          // ₹20 in paise
      currency: "INR",
      receipt:  `receipt_${Date.now()}`,
    });

    res.json({
      success:  true,
      key_id:   process.env.RAZORPAY_KEY_ID,
      amount:   order.amount,
      currency: order.currency,
      order_id: order.id,
    });
  } catch (err) {
    console.error("[create-order]", err.message);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
});

// ── POST /api/verify-payment ───────────────────────────────────────────────
// Verifies Razorpay HMAC-SHA256 signature — never trust the client alone!
app.post("/api/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: "Missing payment fields" });
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, error: "Server misconfiguration" });
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected === razorpay_signature) {
    console.log("[payment] ✅ Verified:", razorpay_payment_id);
    res.json({ success: true });
  } else {
    console.warn("[payment] ❌ Signature mismatch:", razorpay_order_id);
    res.status(400).json({ success: false, error: "Invalid payment signature" });
  }
});

// ── Fallback — serve index.html for any unknown route ─────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log(`│  Vidarbha Tourism Server running                    │`);
  console.log(`│  Open:  http://localhost:${PORT}                        │`);
  console.log(`│  Razorpay Key: ${(process.env.RAZORPAY_KEY_ID || "NOT SET").padEnd(35)}│`);
  console.log("└─────────────────────────────────────────────────────┘");
});
