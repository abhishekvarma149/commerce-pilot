import { Router, Request, Response } from "express";
import pool from "../config/db.js";

const router = Router();

// 1. Live Intelligence Metrics
router.get("/metrics", async (_req: Request, res: Response) => {
    try {
        const ordersResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_orders,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) AS successful_orders,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS total_revenue
      FROM orders;
    `);

        const { total_orders, successful_orders, total_revenue } = ordersResult.rows[0];
        const totalCount = Number(total_orders) || 0;
        const paidCount = Number(successful_orders) || 0;
        const conversionRate = totalCount > 0 ? ((paidCount / totalCount) * 100).toFixed(1) : "0.0";

        return res.json({
            success: true,
            metrics: {
                totalOrders: totalCount,
                paidOrders: paidCount,
                totalRevenue: Number(total_revenue),
                conversionRate: `${conversionRate}%`,
            },
        });
    } catch (error: any) {
        console.error("Analytics fetch error:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch analytics metrics" });
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