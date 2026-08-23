import { Router, Request, Response } from "express";
import { runCommerceGraph } from "../agents/orchestrator.js";

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
    
    res.json({
      success: true,
      data: {
        threadId: sessionId,
        recommendation: result.recommendation,
        upsell: result.growthOffer,
        policyCheck: result.policyValidation,
        requiresApproval: result.needsApproval
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