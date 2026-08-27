import { Router, Request, Response } from "express";
import crypto from "crypto";
import pool from "../config/db.js";
import { createRazorpayOrder } from "../services/razorpay.service.js";
import { getRecommendedAddon } from "../utils/addons.js";

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
    const { productId, quantity = 1, includeUpsell, upsellQuantity = 1, requestedDiscountPct, userSessionId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = productResult.rows[0];
    const basePrice = Number(product.price) * quantity;
    
    let upsellPrice = 0;
    let finalTotal = basePrice;
    let discountAmount = 0;
    
    // 2. Fetch Merchant Policy
    const policyQuery = await pool.query(
      "SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
    );
    const maxAllowedPct = policyQuery.rows.length > 0 ? Number(policyQuery.rows[0].max_discount_pct) : 15;

    let effectiveDiscountPct = 0;
    let explanation = "No active policy rules triggered.";
    let upsellRawPrice = 0;

    if (includeUpsell) {
      const accessory = getRecommendedAddon(product.category);
      upsellRawPrice = accessory.price * upsellQuantity;
      
      const requestedPct = requestedDiscountPct !== undefined ? Number(requestedDiscountPct) : maxAllowedPct;
      effectiveDiscountPct = Math.min(requestedPct, maxAllowedPct);
      
      discountAmount = Math.round(upsellRawPrice * (effectiveDiscountPct / 100));
      upsellPrice = upsellRawPrice - discountAmount;
      finalTotal = basePrice + upsellPrice;

      if (requestedPct > maxAllowedPct) {
        explanation = `Requested discount of ${requestedPct}% exceeds merchant limit. Capped at ${maxAllowedPct}%.`;
      } else {
        explanation = `Applied ${effectiveDiscountPct}% bundle discount successfully.`;
      }
    }

    const breakdown = {
      basePrice,
      upsellPrice: upsellRawPrice,
      requestedDiscountPct,
      effectiveDiscountPct,
      discountAmount,
      finalTotal,
      explanation,
    };

    if (userSessionId) {
      await logAuditEvent(userSessionId, "POLICY_BREAKDOWN_GENERATED", "POLICY_ENGINE", {
        productId,
        breakdown,
      });
    }

    return res.json({ success: true, breakdown, product });
  } catch (error: any) {
    console.error("Breakdown preview error:", error);
    return res.status(500).json({ success: false, error: "Failed to generate breakdown", details: error.message });
  }
});

// 2. Create Razorpay Order
router.post("/create-order", async (req: Request, res: Response) => {
  try {
    const { productId, includeUpsell, userSessionId, requestedDiscountPct } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    const product = productResult.rows[0];

    // 1. Calculate unexpired reserved stock
    const reservedResult = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS reserved_count 
       FROM inventory_locks 
       WHERE product_id = $1 
         AND status = 'RESERVED' 
         AND expires_at > CURRENT_TIMESTAMP;`,
      [productId]
    );

    const reservedStock = Number(reservedResult.rows[0].reserved_count);
    const availableStock = product.stock - reservedStock;

    if (availableStock <= 0) {
      return res.status(400).json({
        success: false,
        error: "Item temporarily out of stock or reserved by another shopper.",
      });
    }

    let totalAmount = Number(product.price);

    if (includeUpsell) {
      const accessory = getRecommendedAddon(product.category);
      const policyQuery = await pool.query(
        "SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
      );
      const maxAllowedPct = policyQuery.rows.length > 0 ? Number(policyQuery.rows[0].max_discount_pct) : 15;
      
      const MAX_DISCOUNT = 20;
      const requestedPct = requestedDiscountPct !== undefined ? Number(requestedDiscountPct) : maxAllowedPct;
      
      if (requestedPct > MAX_DISCOUNT) {
        await logAuditEvent(
          userSessionId || "default_session",
          "POLICY_VIOLATION_BLOCKED",
          "POLICY_ENGINE",
          {
            requested: requestedPct,
            clampedTo: MAX_DISCOUNT
          },
          null
        );
      }
      
      const effectiveDiscountPct = Math.min(requestedPct, MAX_DISCOUNT);
      
      const discountAmount = Math.round(accessory.price * (effectiveDiscountPct / 100));
      totalAmount += (accessory.price - discountAmount);
    }

    const amountInPaise = Math.round(totalAmount * 100);
    const receiptId = `rcpt_${Date.now()}`;
    const idempotencyKey = `idemp_${userSessionId || "default"}_${productId}_${Date.now()}`;

    const razorpayOrder = await createRazorpayOrder(amountInPaise, receiptId);

    /**
     * Acquire Inventory TTL Lock (15 Minutes)
     * 
     * Why: Prevents double-spending and overselling. When a user begins checkout,
     * the stock is temporarily reserved. If they abandon the cart or payment fails,
     * the cron job will automatically release this lock after 15 minutes, making
     * the inventory available for other shoppers without manual intervention.
     */
    await pool.query(
      `INSERT INTO inventory_locks (product_id, session_id, razorpay_order_id, quantity, expires_at)
       VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP + INTERVAL '15 minutes');`,
      [productId, userSessionId || "default_session", razorpayOrder.id]
    );

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
  } catch (error: any) {
    console.error("Checkout order error:", error);
    return res.status(500).json({ success: false, error: "Internal server error during checkout creation", details: error.message });
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

    // Mark lock COMMITTED
    await pool.query(
      `UPDATE inventory_locks 
       SET status = 'COMMITTED' 
       WHERE razorpay_order_id = $1;`,
      [razorpay_order_id]
    );

    // Deduct from BOTH inventory.quantity and products.stock using the actual locked quantity
    const lockResult = await pool.query(
      `SELECT product_id, quantity FROM inventory_locks WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );
    for (const lock of lockResult.rows) {
      await pool.query(
        `UPDATE inventory SET quantity = GREATEST(quantity - $1, 0) WHERE product_id = $2`,
        [lock.quantity, lock.product_id]
      );
      await pool.query(
        `UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2`,
        [lock.quantity, lock.product_id]
      );
    }

    if (sessionId) {
      await logAuditEvent(sessionId, "PAYMENT_VERIFIED", "RAZORPAY_CLIENT", {
        razorpay_order_id,
        razorpay_payment_id,
        status: "PAID",
      });
    }

    return res.json({ success: true, message: "Payment verified successfully" });
  } catch (error: any) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ success: false, error: "Verification failed", details: error.message });
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
  } catch (error: any) {
    console.error("Recovery handler error:", error);
    return res.status(500).json({ success: false, error: "Recovery process failed", details: error.message });
  }
});

// 5. Fetch Session Audit Trail
// backend route check
router.get("/audit-trail/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await pool.query(
      "SELECT id, session_id, order_id, action_type, actor, details, created_at FROM audit_logs WHERE session_id = $1 ORDER BY created_at DESC",
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

// 5. Cancel Reservation (When payment fails or modal is closed)
router.post("/cancel-reservation", async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id } = req.body;
    if (razorpay_order_id) {
      await pool.query(
        `UPDATE inventory_locks 
         SET status = 'RELEASED' 
         WHERE razorpay_order_id = $1 AND status = 'RESERVED';`,
        [razorpay_order_id]
      );
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error("Cancel reservation error:", err);
    return res.status(500).json({ success: false, error: "Failed to release lock", details: err.message });
  }
});

// 5.5 Cart Breakdown Preview
router.post("/preview-cart-breakdown", async (req: Request, res: Response) => {
  try {
    const { items, userSessionId, requestedDiscountPct } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Cart is empty" });
    }

    const policyQuery = await pool.query(
      "SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
    );
    const maxAllowedPct = policyQuery.rows.length > 0 ? Number(policyQuery.rows[0].max_discount_pct) : 15;

    const requestedPct = requestedDiscountPct !== undefined ? Number(requestedDiscountPct) : maxAllowedPct;
    const effectiveDiscountPct = Math.min(requestedPct, maxAllowedPct);

    let subtotal = 0;
    let accessorySubtotal = 0;
    for (const item of items) {
      const price = Number(item.price) * item.quantity;
      subtotal += price;
      if (item.isAccessory) {
        accessorySubtotal += price;
      }
    }

    const discountAmount = Math.round(accessorySubtotal * (effectiveDiscountPct / 100));
    const finalTotal = subtotal - discountAmount;

    let policyStatus = "APPROVED";
    if (requestedPct > maxAllowedPct) {
      policyStatus = "BLOCKED_AND_CAPPED";
    }

    const breakdown = {
      subtotal,
      discountPercent: effectiveDiscountPct,
      discountAmount,
      finalTotal,
      policyCap: maxAllowedPct,
      policyStatus,
    };

    if (userSessionId) {
      // 1. Fetch the last breakdown log for this session to check for state mutation
      const lastLogQuery = await pool.query(
        `SELECT details FROM audit_logs 
         WHERE session_id = $1 AND action_type = 'CART_POLICY_BREAKDOWN_GENERATED' 
         ORDER BY created_at DESC LIMIT 1`,
        [userSessionId]
      );
      
      let shouldLog = true;
      if (lastLogQuery.rows.length > 0) {
        const lastDetails = typeof lastLogQuery.rows[0].details === 'string' 
          ? JSON.parse(lastLogQuery.rows[0].details) 
          : lastLogQuery.rows[0].details;
          
        const lastBreakdown = lastDetails?.breakdown;
        
        // 2. Only insert if the cart quantities, items, or negotiated discount actually changed
        if (lastBreakdown && 
            lastBreakdown.subtotal === breakdown.subtotal && 
            lastBreakdown.discountPercent === breakdown.discountPercent) {
          shouldLog = false;
        }
      }
      
      if (shouldLog) {
        await logAuditEvent(userSessionId, "CART_POLICY_BREAKDOWN_GENERATED", "POLICY_ENGINE", {
          breakdown,
        });
      }
    }

    return res.json({ success: true, breakdown });
  } catch (error: any) {
    console.error("Cart breakdown preview error:", error);
    return res.status(500).json({ success: false, error: "Internal server error", details: error.message });
  }
});

// 6. Cart Checkout (Create Razorpay order for all items in the cart)
router.post("/checkout-cart", async (req: Request, res: Response) => {
  try {
    const { items, userSessionId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Cart is empty" });
    }

    // 1. Check stock for all items
    for (const item of items) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      if (!isUuid) {
        if (!item.isAccessory) {
          return res.status(400).json({ success: false, error: `Invalid product ID: ${item.name}` });
        }
        continue;
      }

      const productResult = await pool.query("SELECT * FROM products WHERE id = $1", [item.id]);
      if (productResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: `Product ${item.name} not found` });
      }

      const product = productResult.rows[0];
      const reservedResult = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) AS reserved_count 
         FROM inventory_locks 
         WHERE product_id = $1 
           AND status = 'RESERVED' 
           AND expires_at > CURRENT_TIMESTAMP;`,
        [item.id]
      );
      const reservedStock = Number(reservedResult.rows[0].reserved_count);
      const availableStock = product.stock - reservedStock;

      if (availableStock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Item ${item.name} is out of stock or reserved.`,
        });
      }
    }

    // 2. Query merchant policy cap
    const policyQuery = await pool.query(
      "SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
    );
    const maxAllowedPct = policyQuery.rows.length > 0 ? Number(policyQuery.rows[0].max_discount_pct) : 15;

    const MAX_DISCOUNT = 20;
    const { requestedDiscountPct } = req.body;
    const requestedPct = requestedDiscountPct !== undefined ? Number(requestedDiscountPct) : maxAllowedPct;
    
    if (requestedPct > MAX_DISCOUNT) {
      await logAuditEvent(
        userSessionId || "default_session",
        "POLICY_VIOLATION_BLOCKED",
        "POLICY_ENGINE",
        {
          requested: requestedPct,
          clampedTo: MAX_DISCOUNT
        }
      );
    }
    
    const effectiveDiscountPct = Math.min(requestedPct, MAX_DISCOUNT);

    // 3. Calculate total amount
    let subtotal = 0;
    let accessorySubtotal = 0;
    for (const item of items) {
      const price = Number(item.price) * item.quantity;
      subtotal += price;
      if (item.isAccessory) {
        accessorySubtotal += price;
      }
    }

    const discountAmount = Math.round(accessorySubtotal * (effectiveDiscountPct / 100));
    const totalAmount = subtotal - discountAmount;

    const amountInPaise = Math.round(totalAmount * 100);
    const receiptId = `rcpt_cart_${Date.now()}`;
    const razorpayOrder = await createRazorpayOrder(amountInPaise, receiptId);

    // 4. Insert a single consolidated order record
    const mainItem = items.find((i) => !i.isAccessory) || items[0];
    const idempotencyKey = `idemp_${userSessionId || "default"}_cart_${Date.now()}`;
    await pool.query(
      `INSERT INTO orders (user_session_id, product_id, status, total_amount, currency, razorpay_order_id, idempotency_key)
       VALUES ($1, $2, 'PAYMENT_PENDING', $3, 'INR', $4, $5);`,
      [userSessionId || "default_session", mainItem.isAccessory ? null : mainItem.id, totalAmount, razorpayOrder.id, idempotencyKey]
    );

    /**
     * Acquire TTL Locks for each catalog product in the cart
     * 
     * Why: We iterate over each valid catalog item in the cart and place a 15-minute
     * reservation lock. This ensures that while the user is completing the Razorpay
     * transaction, the items cannot be bought by someone else, preserving cart integrity.
     */
    for (const item of items) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      if (isUuid) {
        const checkProd = await pool.query("SELECT id FROM products WHERE id = $1", [item.id]);
        if (checkProd.rows.length > 0) {
          try {
            await pool.query(
              `INSERT INTO inventory_locks (product_id, session_id, razorpay_order_id, quantity, expires_at)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
               ON CONFLICT (razorpay_order_id) DO NOTHING;`,
              [item.id, userSessionId || "default_session", razorpayOrder.id, item.quantity]
            );
          } catch (e: any) {
            console.error("Lock error:", e);
          }
        }
      }
    }

    return res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error: any) {
    console.error("Cart checkout error:", error);
    return res.status(500).json({ success: false, error: "Internal server error during cart checkout", details: error.message });
  }
});

// 7. Verify Cart Payment (deducts inventory after cart checkout success)
router.post("/verify-cart", async (req: Request, res: Response) => {
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

    // Mark order as PAID
    await pool.query(
      `UPDATE orders 
       SET status = 'PAID', razorpay_payment_id = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    // Mark locks COMMITTED
    await pool.query(
      `UPDATE inventory_locks SET status = 'COMMITTED' WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );

    // Deduct from inventory.quantity and products.stock for each locked product
    const lockResult = await pool.query(
      `SELECT product_id, quantity FROM inventory_locks WHERE razorpay_order_id = $1`,
      [razorpay_order_id]
    );
    for (const lock of lockResult.rows) {
      await pool.query(
        `UPDATE inventory SET quantity = GREATEST(quantity - $1, 0) WHERE product_id = $2`,
        [lock.quantity, lock.product_id]
      );
      await pool.query(
        `UPDATE products SET stock = GREATEST(stock - $1, 0) WHERE id = $2`,
        [lock.quantity, lock.product_id]
      );
    }

    if (sessionId) {
      await logAuditEvent(sessionId, "CART_PAYMENT_VERIFIED", "RAZORPAY_CLIENT", {
        razorpay_order_id,
        razorpay_payment_id,
        itemsDeducted: lockResult.rows.length,
      });
    }

    return res.json({ success: true, message: "Cart payment verified and inventory updated" });
  } catch (error: any) {
    console.error("Cart verification error:", error);
    return res.status(500).json({ success: false, error: "Cart verification failed", details: error.message });
  }
});
router.get("/config", (req: Request, res: Response) => {
  res.json({ keyId: process.env.RAZORPAY_KEY_ID });
});

// --- Recovery & Expiry Workflow ---

router.post("/dismiss-recovery-modal", async (req: Request, res: Response) => {
  try {
    const { sessionId, orderId } = req.body;
    
    if (sessionId && orderId) {
      await logAuditEvent(
        sessionId,
        "RECOVERY_MODAL_DISMISSED",
        "RECOVERY_AGENT",
        { orderId },
        orderId
      );
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Error dismissing recovery modal:", error);
    return res.status(500).json({ success: false, error: "Failed to record dismissal" });
  }
});

/**
 * Auto-expiry worker for PAYMENT_PENDING orders older than 15 minutes.
 * 
 * Why: This acts as the garbage collector for the inventory locking system. 
 * If a user drops off during payment, their reserved stock remains locked. 
 * This cron sweeps through expired orders, marks them FAILED, and releases 
 * the locks so other users can purchase the stock.
 */
setInterval(async () => {
  try {
    const expiredOrdersQuery = await pool.query(
      `UPDATE orders 
       SET status = 'FAILED', failure_reason = 'PAYMENT_LOCK_EXPIRED', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'PAYMENT_PENDING' 
         AND created_at < NOW() - INTERVAL '15 minutes'
       RETURNING *`
    );

    for (const order of expiredOrdersQuery.rows) {
      const { user_session_id, razorpay_order_id, id } = order;

      await logAuditEvent(
        user_session_id || "default_session",
        "PAYMENT_LOCK_EXPIRED",
        "SYSTEM_CRON",
        {
          orderId: razorpay_order_id,
          failureReason: "PAYMENT_LOCK_EXPIRED",
          cartStatus: "LOCK_RELEASED",
          reason: '15-minute TTL elapsed'
        },
        id
      );

      // Ensure associated locks are released
      await pool.query(
        `UPDATE inventory_locks 
         SET status = 'RELEASED' 
         WHERE razorpay_order_id = $1 AND status = 'RESERVED'`,
        [razorpay_order_id]
      );
    }
  } catch (err) {
    console.error("Error in auto-expiry cron:", err);
  }
}, 60 * 1000); // Check every 60 seconds

// 8. Re-Verify Stock on "Retry Payment"
router.post("/retry-check", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    
    const orderQuery = await pool.query(`
      SELECT o.status, p.stock 
      FROM orders o JOIN products p ON o.product_id = p.id 
      WHERE o.razorpay_order_id = $1 OR o.id::text = $1
    `, [orderId]);

    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ error: "Order not found." });
    }

    const order = orderQuery.rows[0];

    if (order.status !== 'PAYMENT_PENDING') {
      return res.status(400).json({ error: 'Order expired or already paid.' });
    }
    
    // We check stock instead of stock_count as per our schema
    if (order.stock <= 0) {
      return res.status(400).json({ error: 'Item sold out while pending.' });
    }

    return res.json({ success: true, allowed: true });
  } catch (error: any) {
    console.error("Retry check error:", error);
    return res.status(500).json({ error: "Internal server error during retry check", details: error.message });
  }
});

export default router;