import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";

const router = Router();

/**
 * Razorpay Webhook Handler
 * 
 * Why: This route receives async payment notifications from Razorpay.
 * - Security (HMAC): We cryptographically verify the x-razorpay-signature against the raw body 
 *   using our webhook secret to ensure the request is authentically from Razorpay.
 * - Idempotency: Webhooks can be delivered multiple times. The UPDATE queries are idempotent,
 *   meaning they can safely run multiple times for the same order without adverse side effects.
 */
router.post("/razorpay", async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

    if (!signature) {
      res.status(400).json({ error: "Missing x-razorpay-signature header" });
      return;
    }

    // 1. Verify Webhook Signature using raw payload buffer
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update((req as any).rawBody || JSON.stringify(req.body))
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("⚠️ Invalid Razorpay webhook signature");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    const event = req.body.event;
    const payload = req.body.payload;

    // 2. Handle Payment Success (Captured)
    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = payload.payment.entity;
      const rzpOrderId = paymentEntity.order_id;
      const rzpPaymentId = paymentEntity.id;

      await pool.query(
        `UPDATE orders 
         SET status = 'PAID', 
             razorpay_payment_id = $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE razorpay_order_id = $2`,
        [rzpPaymentId, rzpOrderId]
      );
    }

    // 3. Handle Payment Failure (Graceful Failure & Recovery State)
    if (event === "payment.failed") {
      const paymentEntity = payload.payment.entity;
      const rzpOrderId = paymentEntity.order_id;
      const rzpPaymentId = paymentEntity.id;
      const failureReason = paymentEntity.error_description || "Payment authorization failed";

      await pool.query(
        `UPDATE orders 
         SET status = 'FAILED', 
             razorpay_payment_id = $1, 
             failure_reason = $2,
             updated_at = CURRENT_TIMESTAMP 
         WHERE razorpay_order_id = $3`,
        [rzpPaymentId, failureReason, rzpOrderId]
      );
    }

    res.status(200).json({ status: "ok" });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Webhook processing failed", details: error.message });
  }
});

export default router;