import { GoogleGenerativeAI } from "@google/generative-ai";
import pool from "../config/db.js";
import { CandidateProduct } from "./catalog.agent.js";

export interface RecommendationResult {
  recommendedProduct: CandidateProduct | null;
  alternatives: CandidateProduct[];
  reasoning: string[];
  confidence: number;
  summary: string;
  proposedDiscountPct?: number;
  userRequestedDiscountPct?: number;
}

// ─── Deterministic fallback when Gemini API quota is exhausted ───────────────
function scoreProductByIntent(product: CandidateProduct, intent: string): number {
  const intentLower = intent.toLowerCase();
  const nameLower = (product.name || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const catLower = (product.category || "").toLowerCase();
  const combined = `${nameLower} ${descLower} ${catLower}`;

  // Extract intent keywords
  const keywords = intentLower
    .replace(/[₹\d,]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let score = product.similarity ?? 0;

  // Keyword match bonus
  for (const kw of keywords) {
    if (combined.includes(kw)) score += 0.1;
  }

  // Budget check — if user mentioned a price ceiling, penalise exceeding products
  const budgetMatch = intentLower.match(/(?:under|below|within|less than)\s*[₹rs\s]*([0-9,]+)/i);
  if (budgetMatch) {
    const budget = parseFloat(budgetMatch[1].replace(/,/g, ""));
    const price = parseFloat(String(product.price));
    if (!isNaN(budget) && !isNaN(price) && price > budget) {
      score -= 0.5; // heavy penalty for over-budget products
    }
  }

  return score;
}

function fallbackRecommend(userIntent: string, candidates: CandidateProduct[], currentRecommendation: CandidateProduct | null = null): RecommendationResult {
  const intentLower = userIntent.toLowerCase();
  const isFollowUp = currentRecommendation && !intentLower.match(/(another|different|instead|show me|find|search)/);
  
  if (isFollowUp && currentRecommendation) {
    return {
      recommendedProduct: currentRecommendation,
      alternatives: candidates.slice(0, 2),
      reasoning: ["Retained previous product based on follow-up question."],
      confidence: 0.9,
      summary: `(Rate limit fallback) Regarding ${currentRecommendation.name}: I am currently experiencing high traffic, but it is a great choice!`
    };
  }

  const scored = candidates
    .map((p) => ({ product: p, score: scoreProductByIntent(p, userIntent) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const alternatives = scored.slice(1, 3).map((s) => s.product);

  return {
    recommendedProduct: best?.product ?? null,
    alternatives,
    reasoning: [
      `Best semantic match for "${userIntent}"`,
      `Category: ${best?.product?.category ?? "General"}`,
      `Price: ₹${Number(best?.product?.price).toLocaleString("en-IN")}`,
    ],
    confidence: Math.min(0.9, (best?.score ?? 0) + 0.4),
    summary: isFollowUp 
      ? `(Rate limit fallback) Regarding ${currentRecommendation?.name}: I am currently experiencing high traffic, but it is a great choice!`
      : `Based on your request, the best match is ${best?.product?.name ?? "the top result"}.`,
  };
}

// ─── Main evaluateCandidates with Gemini + fallback ─────────────────────────
export const evaluateCandidates = async (
  userIntent: string,
  candidates: CandidateProduct[],
  currentRecommendation: CandidateProduct | null = null,
  currentDiscountPct: number = 0
): Promise<RecommendationResult> => {
  if (!candidates || candidates.length === 0) {
    return {
      recommendedProduct: null,
      alternatives: [],
      reasoning: ["No products found."],
      confidence: 0,
      summary: "I couldn't find any products matching your requirements.",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // If no API key, use fallback immediately
  if (!apiKey) {
    console.warn("⚠️  No GEMINI_API_KEY — using deterministic fallback.");
    return fallbackRecommend(userIntent, candidates, currentRecommendation);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: { responseMimeType: "application/json" },
    });

    const policyRes = await pool.query(
      `SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1;`
    );
    const maxBundleLimit = policyRes.rows.length > 0 ? Number(policyRes.rows[0].max_discount_pct) : 15;

    const prompt = `
You are CommercePilot, an intelligent autonomous shopping assistant.

Follow these rules for handling user messages:
1. SPECIFIC PRODUCT INQUIRY: If the user is asking a question about a product that was just recommended or already in the conversation (e.g., questions about its battery, specs, price, charging, or build), OR if the user is asking for a bigger discount or negotiating the bundle offer for the current product, ANSWER THE QUESTION DIRECTLY using that product's details. Do NOT switch or recommend a new product unless the user explicitly asks for alternatives or a different product. Keep "recommendedProductId" the same as the current product.

2. NEW PRODUCT DISCOVERY: If the user explicitly asks for a different item, different category, or new criteria, perform a search and recommend a matching product from the catalog.

3. TONE & FORMAT: Be concise, clear, and helpful. Always reference exact specs from the database when answering technical questions.

RULES FOR HANDLING DISCOUNT & BUNDLE REQUESTS:
1. STANDALONE PRODUCTS: You cannot discount base standalone items (e.g., laptops or phones directly).
2. BUNDLE INCENTIVES: You may offer a bundle discount on complementary accessories up to a maximum of ${maxBundleLimit}% based on active store policy.
3. CONVERSATION FLOW:
   - For initial bundle suggestions, start with a modest offer (e.g., around 10% to 12%).
   - If the customer negotiates or asks for a better price, increase the concession INCREMENTALLY (e.g., offer 15% before jumping to 20%). DO NOT jump straight to the maximum limit of ${maxBundleLimit}% on the first negotiation attempt.
   - CRITICAL GUARDRAIL: If the user asks for a discount higher than ${maxBundleLimit}%, you MUST decline the higher amount and explicitly state that ${maxBundleLimit}% is the absolute maximum authorized deal you can offer. NEVER agree to or output a discount higher than ${maxBundleLimit}%.
4. NATURAL TONE: Speak like a helpful sales consultant. Never reveal internal code limits or say phrases like "I tried to offer X% but was blocked". Present the offer as the best authorized store deal. If you are proposing a new or updated bundle discount, ALWAYS end your response with: "Would you like me to add the bundle to your cart?"
5. BUNDLE CONFIRMATION: If the user says "yes" or agrees to add the bundle, confirm it by saying: "I have added the bundle to your cart with a discount of [X]%." Do NOT ask "Would you like me to add the bundle to your cart?" again.

Current Conversation Context:
Intent: "${userIntent}"
Currently Recommended Product: ${currentRecommendation ? JSON.stringify(currentRecommendation, null, 2) : "None"}
Candidates: ${JSON.stringify(candidates, null, 2)}
Currently Active Bundle Discount: ${currentDiscountPct}%

Task:
1. If this is a specific product inquiry about the currently recommended product, answer it directly in the summary and set recommendedProductId to the currently recommended product's ID.
2. Otherwise, select the single best product from Candidates.
3. Identify up to 2 alternatives.
4. List 2-4 bullet points explaining why.
5. Provide a confidence score (0.0 to 1.0) and summary (the reply to the user).
6. Set "proposedDiscountPct" (number between 0 and ${maxBundleLimit}) for the accessory bundle:
   - If this is a new initial bundle offer, use 10.
   - If the user is actively negotiating for more, evaluate a slightly higher percentage (e.g., increase by 3-5%), but do NOT jump directly to ${maxBundleLimit} unless they have already rejected an intermediate offer.
   - If the user says "yes" or agrees to a previously offered discount, PRESERVE the "Currently Active Bundle Discount" exactly (${currentDiscountPct}). Do NOT reset it.
7. Set "userRequestedDiscountPct" to the numerical percentage the user is asking for in their message (e.g. if they say "give me 30% discount", output 30). If they do not specify a number, output 0.

Respond ONLY with JSON:
{
  "recommendedProductId": "string",
  "alternatives": ["uuid_string"],
  "reasoning": ["string"],
  "confidence": 0.0,
  "summary": "string",
  "proposedDiscountPct": 0,
  "userRequestedDiscountPct": 0
}
    `;
    const response = await model.generateContent(prompt);
    let rawText = response.response.text();
    rawText = rawText.replace(/```json/i, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(rawText);

    const recommendedProduct =
      candidates.find((c) => c.id === parsed.recommendedProductId) || 
      (parsed.recommendedProductId === currentRecommendation?.id ? currentRecommendation : candidates[0]);
    const alternatives = candidates.filter((c) =>
      parsed.alternativeProductIds?.includes(c.id)
    );

    return {
      recommendedProduct,
      alternatives,
      reasoning: parsed.reasoning || [],
      confidence: parsed.confidence || 0.85,
      summary: parsed.summary || "Here are some options.",
      proposedDiscountPct: parsed.proposedDiscountPct || 0,
      userRequestedDiscountPct: parsed.userRequestedDiscountPct || 0,
    };
  } catch (err: any) {
    const is429 = err?.status === 429;
    const is404 = err?.status === 404;

    if (is429) {
      console.warn("⚠️  Gemini API rate limit hit — using deterministic fallback.");
    } else if (is404) {
      console.warn(`⚠️  Gemini model not available (404) — using deterministic fallback. Error: ${err?.message}`);
    } else {
      console.error("⚠️  Gemini API error — using deterministic fallback:", err?.message);
    }

    return fallbackRecommend(userIntent, candidates, currentRecommendation);
  }
};