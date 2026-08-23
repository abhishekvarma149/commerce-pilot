import { Router, Request, Response } from "express";
import pool from "../config/db.js";
import { createRazorpayOrder } from "../services/razorpay.service.js";

const router = Router();

router.post("/create-order", async (req: Request, res: Response) => {
  try {
    const { productId, includeUpsell, userSessionId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    // 1. Authoritative price lookup from DB (Never trust frontend price)
    const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = productResult.rows[0];
    let totalAmount = Number(product.price);

    // 2. Add policy-validated upsell price if selected (e.g., Premium Case capped at 15% discount -> ₹1,274)
    if (includeUpsell) {
      totalAmount += 1274; 
    }

    const amountInPaise = Math.round(totalAmount * 100);
    const receiptId = `rcpt_${Date.now()}`;
    const idempotencyKey = `idemp_${userSessionId || "default"}_${productId}_${Date.now()}`;

    // 3. Create Razorpay Order
    const razorpayOrder = await createRazorpayOrder(amountInPaise, receiptId);

    // 4. Save Order to Database with state 'PAYMENT_PENDING'
    const orderQuery = `
      INSERT INTO orders (user_session_id, product_id, status, total_amount, currency, razorpay_order_id, idempotency_key)
      VALUES ($1, $2, 'PAYMENT_PENDING', $3, 'INR', $4, $5)
      RETURNING *;
    `;
    const orderValues = [userSessionId || "default_session", productId, totalAmount, razorpayOrder.id, idempotencyKey];
    const savedOrder = await pool.query(orderQuery, orderValues);

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      dbOrderId: savedOrder.rows.length > 0 ? savedOrder.rows[0].id : null,
      amount: totalAmount,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Checkout order error:", error);
    return res.status(500).json({ success: false, error: "Internal server error during checkout creation" });
  }
});

export default router;