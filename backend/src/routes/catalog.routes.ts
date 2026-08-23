import { Router, Request, Response } from "express";
// Added .js extension to satisfy Node's strict resolution
import { syncAllEmbeddings, searchSemantic } from "../services/catalog.service.js";

const router = Router();

// POST /api/catalog/sync
router.post("/sync", async (_req: Request, res: Response): Promise<void> => {
  try {
    const updatedCount = await syncAllEmbeddings();
    res.json({
      success: true,
      message: `Successfully generated embeddings for ${updatedCount} products`,
      updated: updatedCount,
    });
  } catch (error) {
    console.error("Sync embeddings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync catalog embeddings",
    });
  }
});

// POST /api/catalog/search
router.post("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, limit } = req.body;

    if (!query) {
      res.status(400).json({
        success: false,
        message: "Search query is required",
      });
      return;
    }

    const products = await searchSemantic(query, limit || 5);
    
    res.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to perform semantic search",
    });
  }
});

export default router;