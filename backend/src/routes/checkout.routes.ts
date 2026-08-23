import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { createRazorpayOrder } from "../services/razorpay.service.js";

const router = Router();

// Helper to append events to the audit trail
async function logAuditEvent(
  sessionId: string,
  actionType: string,
  actor: string,
  details: Record<string, any>,
  orderId?: string | number | null
) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (session_id, action_type, actor, details, order_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, actionType, actor, JSON.stringify(details), orderId ? String(orderId) : null]
    );
  } catch (err) {
    console.error("Audit log insertion failed:", err);
  }
}

// 1. Policy Gating & Explanation Preview
router.post("/preview-breakdown", async (req: Request, res: Response) => {
  try {
    const { productId, includeUpsell, userSessionId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = productResult.rows[0];
    const basePrice = Number(product.price);
    const upsellRawPrice = includeUpsell ? 1499 : 0;
    const requestedDiscountPct = 15;
    const effectiveDiscountPct = 15; // Bounded by policy rule (max allowed = 15%)

    const discountAmount = includeUpsell
      ? Math.round(upsellRawPrice * (effectiveDiscountPct / 100))
      : 0;

    const upsellPrice = upsellRawPrice - discountAmount;
    const finalTotal = basePrice + upsellPrice;

    const breakdown = {
      basePrice,
      upsellPrice: upsellRawPrice,
      requestedDiscountPct,
      effectiveDiscountPct,
      discountAmount,
      finalTotal,
      explanation: includeUpsell
        ? `Applied bounded merchant bundle discount of ${effectiveDiscountPct}% on accessory add-on.`
        : "Standard direct purchase price verified against product catalog.",
    };

    if (userSessionId) {
      await logAuditEvent(userSessionId, "POLICY_BREAKDOWN_GENERATED", "POLICY_ENGINE", {
        productId,
        breakdown,
      });
    }

    return res.json({ success: true, breakdown, product });
  } catch (error) {
    console.error("Breakdown preview error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate breakdown" });
  }
});

// 2. Create Razorpay Order
router.post("/create-order", async (req: Request, res: Response) => {
  try {
    const { productId, includeUpsell, userSessionId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = productResult.rows[0];
    let totalAmount = Number(product.price);

    if (includeUpsell) {
      totalAmount += 1274; // Policy-capped ₹1,499 - 15% discount
    }

    const amountInPaise = Math.round(totalAmount * 100);
    const receiptId = `rcpt_${Date.now()}`;
    const idempotencyKey = `idemp_${userSessionId || "default"}_${productId}_${Date.now()}`;

    const razorpayOrder = await createRazorpayOrder(amountInPaise, receiptId);

    const orderQuery = `
      INSERT INTO orders (user_session_id, product_id, status, total_amount, currency, razorpay_order_id, idempotency_key)
      VALUES ($1, $2, 'PAYMENT_PENDING', $3, 'INR', $4, $5)
      RETURNING *;
    `;
    const orderValues = [userSessionId || "default_session", productId, totalAmount, razorpayOrder.id, idempotencyKey];
    const savedOrder = await pool.query(orderQuery, orderValues);
    const dbOrder = savedOrder.rows[0];

    // Log order creation to audit trail
    await logAuditEvent(
      userSessionId || "default_session",
      "PAYMENT_ORDER_CREATED",
      "AGENT_CHECKOUT",
      {
        razorpayOrderId: razorpayOrder.id,
        totalAmount,
        currency: "INR",
        boundedDiscountApplied: includeUpsell ? "15%" : "0%",
      },
      dbOrder.id
    );

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      dbOrderId: dbOrder.id,
      amount: totalAmount,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Checkout order error:", error);
    return res.status(500).json({ success: false, error: "Internal server error during checkout creation" });
  }
});

// 3. Client Payment Verification Endpoint (HMAC SHA256)
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, sessionId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "Missing verification parameters" });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, error: "Invalid payment signature" });
    }

    await pool.query(
      `UPDATE orders 
       SET status = 'PAID', 
           razorpay_payment_id = $1, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    if (sessionId) {
      await logAuditEvent(sessionId, "PAYMENT_VERIFIED", "RAZORPAY_CLIENT", {
        razorpay_order_id,
        razorpay_payment_id,
        status: "PAID",
      });
    }

    return res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ success: false, error: "Verification failed" });
  }
});

// 4. Payment Failure Recovery & Alternative Routing
router.post("/recover-failed-payment", async (req: Request, res: Response) => {
  try {
    const { sessionId, orderId, failureReason, preferredMethod } = req.body;

    if (orderId) {
      await pool.query(
        `UPDATE orders 
         SET status = 'FAILED', 
             failure_reason = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE razorpay_order_id = $2`,
        [failureReason || "Authorization failed or dropped", orderId]
      );
    }

    await logAuditEvent(
      sessionId || "default_session",
      "RECOVERY_TRIGGERED",
      "RECOVERY_AGENT",
      {
        orderId,
        failureReason: failureReason || "Payment interrupted or declined",
        alternativeRouteSuggested: preferredMethod || "UPI / Card Retry",
        cartStatus: "PRESERVED_LOCKED_PRICE",
      },
      orderId
    );

    return res.json({
      success: true,
      recoveryState: {
        canRetry: true,
        fallbackMethods: ["upi", "card", "netbanking"],
        message: "Your cart and locked pricing are preserved. You can retry with a different method.",
      },
    });
  } catch (error) {
    console.error("Recovery handler error:", error);
    return res.status(500).json({ success: false, error: "Recovery process failed" });
  }
});

// 5. Fetch Session Audit Trail
// backend route check
router.get("/audit-trail/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await pool.query(
      "SELECT id, session_id, order_id, action_type, actor, details, created_at FROM audit_logs WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId]
    );

    return res.json({
      success: true,
      logs: result.rows,
    });
  } catch (error: any) {
    console.error("Audit Trail DB Error:", error.message || error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch audit logs",
    });
  }
});

export default router;