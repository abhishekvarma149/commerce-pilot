import { GoogleGenerativeAI } from "@google/generative-ai";

import pool from "../config/db.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ GEMINI_API_KEY is missing. Growth Agent will use fallback discounts.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

export async function evaluateGrowthOffer(userMessage: string): Promise<number> {
  if (!apiKey) return 15; // Fallback

  try {
    const policyRes = await pool.query(
      `SELECT max_discount_pct FROM merchant_policies WHERE policy_name = 'DEFAULT_BUNDLE_POLICY' LIMIT 1;`
    );
    const maxBundleLimit = policyRes.rows.length > 0 ? Number(policyRes.rows[0].max_discount_pct) : 15;

    const GROWTH_AGENT_PROMPT = `
You are the Growth Agent for CommercePilot.
When offering a bundle add-on:
- Recommend a discount between 10% and ${maxBundleLimit}% on the accessory based on the user's message.
- For high-intent buyers ready to purchase, a standard 10% to 15% discount is sufficient.
- If the customer hesitates or asks for a deal, propose up to ${maxBundleLimit}%.
Your proposal will be automatically validated against merchant policy.

Analyze the user's message and determine the optimal discount percentage.
Return a JSON object strictly matching this format:
{
  "proposedDiscountPercent": number
}
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: GROWTH_AGENT_PROMPT }] },
        { role: "user", parts: [{ text: `User message: "${userMessage}"` }] }
      ]
    });

    const responseText = result.response.text();
    const data = JSON.parse(responseText);
    
    // Ensure it's within bounds just for sanity, though the prompt asks for 10-25
    return Math.max(10, Math.min(30, Number(data.proposedDiscountPercent) || 15));
  } catch (error) {
    console.error("Growth Agent failed:", error);
    return 15; // Fallback
  }
}
