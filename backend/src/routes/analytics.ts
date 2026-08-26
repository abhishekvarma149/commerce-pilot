import { Router, Request, Response } from "express";
import pool from "../config/db.js";

const router = Router();

// 1. Live Intelligence Metrics
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    // 1. Total Paid / Completed Orders Count & AI Attributed Revenue
    const ordersResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_orders,
        COALESCE(SUM(total_amount), 0) AS total_revenue
      FROM orders
      WHERE status = 'PAID' OR status = 'COMPLETED';
    `);

    // 2. Total Unique AI Interactions / Sessions
    const sessionsResult = await pool.query(`
      SELECT COUNT(DISTINCT session_id) AS total_sessions 
      FROM ai_events;
    `);

    const totalOrders = parseInt(ordersResult.rows[0].total_orders, 10) || 0;
    const totalRevenue = parseFloat(ordersResult.rows[0].total_revenue) || 0;
    const totalSessions = parseInt(sessionsResult.rows[0].total_sessions, 10) || 0;

    // 3. Conversion Rate Calculation
    // If sessions exist, calculate (orders / sessions) * 100, else default to baseline
    const conversionRate = totalSessions > 0 
      ? Math.min(100, ((totalOrders / totalSessions) * 100)).toFixed(1)
      : (totalOrders > 0 ? "100.0" : "0.0");

    return res.json({
      success: true,
      data: {
        aiAssistedOrders: totalOrders,
        aiRevenue: totalRevenue,
        conversionRate: `${conversionRate}%`,
        totalSessions
      }
    });
  } catch (error) {
    console.error("Error computing analytics metrics:", error);
    return res.status(500).json({ error: "Failed to fetch analytics metrics" });
  }
});

// 2. Fetch Active Merchant Policy
router.get("/policy", async (_req: Request, res: Response) => {
    try {
        const policyResult = await pool.query(
            "SELECT policy_name, max_discount_pct, is_active FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
        );

        if (policyResult.rows.length === 0) {
            return res.json({ success: true, policy: { max_discount_pct: 15 } });
        }

        return res.json({ success: true, policy: policyResult.rows[0] });
    } catch (error: any) {
        console.error("Policy fetch error:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch policy" });
    }
});

// 3. Update Merchant Policy Cap
router.put("/policy", async (req: Request, res: Response) => {
    try {
        const { max_discount_pct } = req.body;
        const parsedPct = Number(max_discount_pct);

        if (isNaN(parsedPct) || parsedPct < 0 || parsedPct > 100) {
            return res.status(400).json({ success: false, error: "Invalid discount percentage" });
        }

        const updateResult = await pool.query(
            `UPDATE merchant_policies 
       SET max_discount_pct = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' 
       RETURNING *;`,
            [parsedPct]
        );

        return res.json({ success: true, policy: updateResult.rows[0] });
    } catch (error: any) {
        console.error("Policy update error:", error);
        return res.status(500).json({ success: false, error: "Failed to update policy" });
    }
});

export default router;