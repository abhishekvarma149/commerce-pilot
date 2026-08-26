import { Annotation, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { retrieveCatalogCandidates, CandidateProduct } from "./catalog.agent.js";
import { evaluateCandidates, RecommendationResult } from "./recommendation.agent.js";
import { getRecommendedAddon } from "../utils/addons.js";
import { evaluateGrowthOffer } from "./growth.agent.js";
import pool from "../config/db.js";

// 1. Define the Graph State
export const CommerceState = Annotation.Root({
  userMessage: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  budget: Annotation<number | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  candidates: Annotation<CandidateProduct[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  recommendation: Annotation<RecommendationResult | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  growthOffer: Annotation<any | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  needsApproval: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

// 2. Define the Agent Nodes
async function catalogNode(state: typeof CommerceState.State) {

  const candidates = await retrieveCatalogCandidates({
    query: state.userMessage,
    maxPrice: state.budget,
    limit: 5,
  });
  return { candidates };
}

async function recommendationNode(state: typeof CommerceState.State) {

  try {
    const recommendation = await evaluateCandidates(
      state.userMessage,
      state.candidates,
      state.recommendation?.recommendedProduct || null,
      state.growthOffer?.discountPct || 0
    );
    return { recommendation };
  } catch (err: any) {
    console.warn("⚠️  Recommendation agent failed, using keyword fallback:", err?.message?.split("\n")[0]);
    // Deterministic fallback: pick candidate with highest similarityScore
    const sorted = [...(state.candidates || [])].sort(
      (a, b) => (b.similarity ?? 0) - (a.similarity ?? 0)
    );
    const best = sorted[0] ?? null;
    return {
      recommendation: {
        recommendedProduct: best,
        alternatives: sorted.slice(1, 3),
        reasoning: ["Best semantic match from catalog"],
        confidence: 0.75,
        summary: best
          ? `Based on your request, the best match is ${best.name}.`
          : "No matching product found.",
      },
    };
  }
}

async function growthNode(state: typeof CommerceState.State, config: any) {

  if (state.recommendation?.recommendedProduct) {
    const addon = getRecommendedAddon(state.recommendation.recommendedProduct.category);
    
    // 1. AI proposes a discount based on user message (now handled by Recommendation Agent in single pass)
    const aiProposedDiscount = (state.recommendation as any).proposedDiscountPct || 0;

    
    // 2. Query merchant policy limit
    const policyQuery = await pool.query(
      "SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1"
    );
    const merchantLimit = policyQuery.rows.length > 0 ? Number(policyQuery.rows[0].max_discount_pct) : 15;
    
    const sessionId = config.configurable?.thread_id || "default_session";
    
    // 3. Evaluate against Guardrail
    
    // Fallback extraction for user requested discount if LLM misses it
    let userRequestedPct = (state.recommendation as any)?.userRequestedDiscountPct || 0;
    if (userRequestedPct === 0) {
      const match = state.userMessage.match(/\b(\d+)\s*%/);
      if (match) {
        userRequestedPct = parseInt(match[1], 10);
      }
    }
    
    let finalDiscount = aiProposedDiscount;
    let policyStatus = "APPROVED";

    if (userRequestedPct > merchantLimit || aiProposedDiscount > merchantLimit) {
      finalDiscount = Math.min(aiProposedDiscount, merchantLimit);
      policyStatus = "BLOCKED_AND_CAPPED";
      
      try {
        await pool.query(
          `INSERT INTO audit_logs (session_id, action_type, actor, details)
           VALUES ($1, $2, $3, $4)`,
          [sessionId, "POLICY_VIOLATION_BLOCKED", "POLICY_ENGINE", JSON.stringify({
            requestedDiscount: userRequestedPct,
            policyCap: merchantLimit,
            enforcedDiscount: merchantLimit,
            reason: "User requested discount exceeded merchant limit"
          })]
        );
      } catch (err) {
        console.error("Failed to log audit event:", err);
      }
      
      // Override the summary to prevent double variables or contradictory statements
      if (userRequestedPct > merchantLimit) {
         state.recommendation.summary = `While I understand you are looking for the best deal, I cannot offer a ${userRequestedPct}% discount. I can, however, provide our absolute maximum authorized store discount of ${merchantLimit}% on the accessory bundle. Would you like me to add the bundle to your cart?`;
      }
    }

    const discountedPrice = Math.round(addon.price * (1 - finalDiscount / 100));

    // Log the breakdown if the user confirms
    const isYes = /^(yes|yeah|sure|add it|please add|ok|okay|yep)(\s|$|\.|!)/i.test(state.userMessage.trim());
    if (isYes && state.recommendation?.recommendedProduct) {
      const basePrice = Number(state.recommendation.recommendedProduct.price);
      const subtotal = basePrice + addon.price;
      const discountAmount = Math.round(addon.price * (finalDiscount / 100));
      const finalTotal = subtotal - discountAmount;
      
      try {
        await pool.query(
          `INSERT INTO audit_logs (session_id, action_type, actor, details)
           VALUES ($1, $2, $3, $4)`,
          [sessionId, "CART_POLICY_BREAKDOWN_GENERATED", "POLICY_ENGINE", JSON.stringify({
            breakdown: {
              subtotal,
              discountPercent: finalDiscount,
              discountAmount,
              finalTotal,
              policyCap: merchantLimit,
              policyStatus: "APPROVED" // if it reached here and they say yes, the final applied discount is within bounds
            }
          })]
        );
      } catch (err) {
        console.error("Failed to log breakdown event:", err);
      }
    }

    return {
      growthOffer: {
        title: addon.name,
        price: discountedPrice,
        discountedFrom: addon.price,
        discountPct: finalDiscount,
        policyStatus,
      }
    };
  }
  return { growthOffer: null };
}

async function paymentNode(state: typeof CommerceState.State) {

  return { needsApproval: true };
}

// 3. Initialize MemorySaver Checkpointer
const checkpointer = new MemorySaver();

const workflow = new StateGraph(CommerceState)
  .addNode("catalog", catalogNode)
  .addNode("recommendationAgent", recommendationNode)
  .addNode("growth", growthNode)
  .addNode("payment", paymentNode)

  .addEdge(START, "catalog")
  .addEdge("catalog", "recommendationAgent")
  .addEdge("recommendationAgent", "growth")
  .addEdge("growth", "payment")
  .addEdge("payment", END);

// Compile graph with the in-memory checkpointer and breakpoint
export const commerceGraph = workflow.compile({
  checkpointer,
  interruptBefore: ["payment"],
});

export const runCommerceGraph = async (message: string, budget?: number, threadId: string = "default-session") => {


  const initialState = {
    userMessage: message,
    budget: budget,
  };

  const config = { configurable: { thread_id: threadId } };
  const finalState = await commerceGraph.invoke(initialState, config);
  return finalState;
};
