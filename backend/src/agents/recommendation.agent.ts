import { GoogleGenerativeAI } from "@google/generative-ai";
import { CandidateProduct } from "./catalog.agent.js";

export interface RecommendationResult {
  recommendedProduct: CandidateProduct | null;
  alternatives: CandidateProduct[];
  reasoning: string[];
  confidence: number;
  summary: string;
}

export const evaluateCandidates = async (
  userIntent: string,
  candidates: CandidateProduct[]
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
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `
Analyze the user's intent against these candidate products:
Intent: "${userIntent}"
Candidates: ${JSON.stringify(candidates, null, 2)}

Task:
1. Select the single best product.
2. Identify up to 2 alternatives.
3. List 2-4 bullet points explaining why.
4. Provide a confidence score (0.0 to 1.0) and summary.

Respond ONLY with JSON:
{
  "recommendedProductId": "string",
  "alternativeProductIds": ["string"],
  "reasoning": ["string"],
  "confidence": 0.9,
  "summary": "string"
}
  `;

  const response = await model.generateContent(prompt);
  const parsed = JSON.parse(response.response.text());

  const recommendedProduct = candidates.find((c) => c.id === parsed.recommendedProductId) || candidates[0];
  const alternatives = candidates.filter((c) => parsed.alternativeProductIds?.includes(c.id));

  return {
    recommendedProduct,
    alternatives,
    reasoning: parsed.reasoning || [],
    confidence: parsed.confidence || 0.85,
    summary: parsed.summary || "",
  };
};