import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";

const router = Router();

// Asynchronous Razorpay Server-to-Server Webhook

router.post("/razorpay", async (req: Request, res: Response) => {
    try {
        const signature = req.headers["x-razorpay-signature"] as string;
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || "default_secret";

        if (!signature) {
            return res.status(400).json({ success: false, error: "Missing webhook signature" });
        }

        // Allow quick local bypass in Thunder Client with "test_signature"
        const isDevBypass = process.env.NODE_ENV !== "production" && signature === "test_signature";

        if (!isDevBypass) {
            const expectedSignature = crypto
                .createHmac("sha256", webhookSecret)
                .update(JSON.stringify(req.body))
                .digest("hex");

            if (signature !== expectedSignature) {
                return res.status(400).json({ success: false, error: "Invalid signature" });
            }
        }

        const { event, payload } = req.body;
        const paymentEntity = payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;

        if (event === "payment.captured" || event === "order.paid") {
            if (orderId) {
                const updateResult = await pool.query(
                    `UPDATE orders 
           SET status = 'PAID', 
               razorpay_payment_id = $1, 
               updated_at = CURRENT_TIMESTAMP 
           WHERE razorpay_order_id = $2 
           RETURNING user_session_id;`,
                    [paymentId, orderId]
                );

                // Mark lock COMMITTED and permanently decrement stock
                await pool.query(
                    `UPDATE inventory_locks 
           SET status = 'COMMITTED' 
           WHERE razorpay_order_id = $1;`,
                    [orderId]
                );

                await pool.query(
                    `UPDATE products 
           SET stock = GREATEST(stock - 1, 0) 
           WHERE id = (SELECT product_id FROM orders WHERE razorpay_order_id = $1 LIMIT 1);`,
                    [orderId]
                );

                const sessionId = updateResult.rows[0]?.user_session_id || "webhook_session";

                await pool.query(
                    `INSERT INTO audit_logs (session_id, order_id, action_type, actor, details)
           VALUES ($1, $2, 'PAYMENT_VERIFIED_WEBHOOK', 'RAZORPAY_WEBHOOK', $3)`,
                    [
                        sessionId,
                        orderId,
                        JSON.stringify({
                            event,
                            paymentId,
                            status: "PAID",
                            amountPaise: paymentEntity?.amount,
                        }),
                    ]
                );
            }
        }

        return res.status(200).json({ status: "ok" });
    } catch (err: any) {
        console.error("Webhook processing error:", err);
        return res.status(500).json({ success: false, error: "Webhook handling failed" });
    }
});

export default router;