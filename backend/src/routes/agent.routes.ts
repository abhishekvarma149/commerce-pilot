import { Router, Request, Response } from "express";
import { runCommerceGraph } from "../agents/orchestrator.js";
import pool from "../config/db.js";

const router = Router();

router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, budget, threadId } = req.body;
    
    if (!message) {
      res.status(400).json({ success: false, error: "Message is required" });
      return;
    }

    // Use a unique session thread ID if provided, otherwise fallback
    const sessionId = threadId || `session_${Date.now()}`;
    const result = await runCommerceGraph(message, budget, sessionId);
    
    const matchedProduct = (result as any).recommendation?.recommendedProduct;
    try {
      await pool.query(
        `INSERT INTO ai_events (session_id, event_type, product_id) VALUES ($1, $2, $3)`,
        [sessionId || 'anon_session', 'chat_recommendation', matchedProduct?.id || null]
      );
    } catch (dbErr) {
      console.error("Failed to insert ai_event:", dbErr);
    }
    
    res.json({
  success: true,
  intent: "product_search",
  reply: "I found the best match for your request.",
  data: {
    threadId: sessionId,
    recommendation: (result as any).recommendation,
    upsell: (result as any).growthOffer,
    policyCheck: (result as any).policyValidation,
    requiresApproval: (result as any).needsApproval
  }
});
  } catch (error) {
    console.error("Agent chat error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process graph request",
    });
  }
});

export default router;