import { Router, Request, Response } from "express";
import PDFDocument from "pdfkit";
import pool from "../config/db.js";

const router = Router();

// 1. Fetch All Orders
router.get("/", async (_req: Request, res: Response) => {
    try {
        const result = await pool.query(`
      SELECT 
        o.id,
        o.user_session_id,
        o.product_id,
        o.status,
        o.total_amount,
        o.currency,
        o.razorpay_order_id,
        o.razorpay_payment_id,
        o.created_at,
        p.name AS product_name,
        p.category AS product_category
      FROM orders o
      LEFT JOIN products p ON o.product_id = p.id
      ORDER BY o.created_at DESC;
    `);

        return res.json({ success: true, orders: result.rows });
    } catch (error: any) {
        console.error("Fetch orders error:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch orders" });
    }
});

// 2. Stream Generated PDF Invoice
router.get("/:orderId/invoice", async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;

        const result = await pool.query(
            `SELECT o.*, p.name AS product_name, p.price AS product_price 
       FROM orders o 
       LEFT JOIN products p ON o.product_id = p.id 
       WHERE o.id = $1`,
            [orderId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }

        const order = result.rows[0];

        const doc = new PDFDocument({ margin: 50 });
        const filename = `Invoice_${order.id}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        doc.pipe(res);

        // Header
        doc.fontSize(20).text("CommercePilot Tax Invoice", { align: "left" });
        doc.fontSize(10).text("Merchant Workspace: TechMart", { align: "left" });
        doc.moveDown();
        doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Invoice Meta
        doc.fontSize(10).fillColor("#334155");
        doc.text(`Invoice ID: INV-${order.id}`);
        doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`);
        doc.text(`Session ID: ${order.user_session_id}`);
        doc.text(`Payment Status: ${order.status}`);
        doc.text(`Razorpay Payment ID: ${order.razorpay_payment_id || "N/A"}`);
        doc.moveDown();

        // Item Table Header
        const tableTop = doc.y;
        doc.font("Helvetica-Bold").text("Item Description", 50, tableTop);
        doc.text("Status", 350, tableTop);
        doc.text("Amount (INR)", 450, tableTop, { align: "right" });
        doc.moveDown(0.5);
        doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);

        // Item Row
        doc.font("Helvetica").text(order.product_name || "Product Purchase", 50, doc.y);
        doc.text(order.status, 350, doc.y - 12);
        doc.text(`Rs. ${Number(order.total_amount).toLocaleString("en-IN")}`, 450, doc.y - 12, { align: "right" });
        doc.moveDown();

        doc.strokeColor("#cbd5e1").lineWidth(0.5).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();

        // Total
        doc.font("Helvetica-Bold").fontSize(12).text(`Total Paid: Rs. ${Number(order.total_amount).toLocaleString("en-IN")}`, { align: "right" });
        doc.moveDown(2);

        // Footer
        doc.fontSize(9).fillColor("#94a3b8").text("This is an authoritative system-generated receipt bounded by merchant checkout policies.", { align: "center" });

        doc.end();
    } catch (error: any) {
        console.error("Invoice generation error:", error);
        return res.status(500).json({ success: false, error: "Failed to generate invoice" });
    }
});

export default router;