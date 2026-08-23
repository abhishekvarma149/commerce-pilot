import { createAgent, tool } from "langchain";
import * as z from "zod";
import { searchSemantic } from "./catalog.service.js";

const searchCatalogTool = tool(
  async ({ query, budget }) => {
    const products = await searchSemantic(query, 3);
    if (budget) {
      return JSON.stringify(products.filter(p => Number(p.price) <= budget));
    }
    return JSON.stringify(products);
  },
  {
    name: "search_catalog",
    description: "Search the merchant catalog for products based on user intent.",
    schema: z.object({
      query: z.string().describe("The type of product the user wants"),
      budget: z.number().optional().describe("Maximum budget in INR"),
    }),
  }
);

export const commerceAgent = createAgent({
  model: "google-genai:gemini-3.6-flash", 
  tools: [searchCatalogTool],
  systemPrompt: `You are CommercePilot, an AI shopping assistant. 
  Understand user intent, use the search_catalog tool to find matching products, 
  and explain why they fit. Format prices in INR (₹).`,
});

export const runAgent = async (userMessage: string) => {
  const result = await commerceAgent.invoke({
    messages: [{ role: "user", content: userMessage }],
  });
  return result.messages[result.messages.length - 1].content;
};