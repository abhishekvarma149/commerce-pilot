import { GoogleGenerativeAI } from "@google/generative-ai";
import pool from "../config/db.js";

// Simple in-memory cache for embeddings (Query text -> Vector array)
const embeddingCache = new Map<string, number[]>();

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const sanitizedText = text.trim().toLowerCase();

  // 1. Check local cache first for lightning-fast responses
  if (embeddingCache.has(sanitizedText)) {
    console.log(`⚡ [Cache Hit] Using cached embedding for: "${text}"`);
    return embeddingCache.get(sanitizedText)!;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ CRITICAL: GEMINI_API_KEY is undefined. Check your .env file!");
    throw new Error("Missing Gemini API Key");
  }

  console.log(`🌐 [API Call] Generating fresh embedding for: "${text}"`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  
  // Pass the text string directly to avoid SDK schema version discrepancies
  const result = await model.embedContent(text);

  // Safely extract values and downsize to 768 dimensions using Matryoshka truncation
  const embedding = result.embedding.values.slice(0, 768);

  if (!embedding || embedding.length === 0) {
    throw new Error("Failed to generate embedding from Gemini");
  }

  // 2. Save result to cache
  embeddingCache.set(sanitizedText, embedding);

  return embedding;
};

// Semantic vector search in PostgreSQL using pgvector
export const searchSemantic = async (query: string, maxPrice?: number, limit: number = 5) => {
  const embedding = await generateEmbedding(query);
  const vectorString = `[${embedding.join(",")}]`;

  let sql = `
    SELECT id, name, description, category, price, currency, specifications, use_cases,
           1 - (embedding <=> $1::vector) AS similarity
    FROM products
  `;
  
  const params: any[] = [vectorString];

  if (maxPrice !== undefined) {
    sql += ` WHERE price <= $2`;
    params.push(maxPrice);
  }

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
};

// Sync utility for populating database product embeddings
export const syncAllEmbeddings = async () => {
  const res = await pool.query("SELECT id, name, description, category FROM products WHERE embedding IS NULL");
  console.log(`Syncing embeddings for ${res.rows.length} products...`);
  
  for (const product of res.rows) {
    const textToEmbed = `${product.name} - ${product.description} - ${product.category}`;
    const embedding = await generateEmbedding(textToEmbed);
    const vectorString = `[${embedding.join(",")}]`;
    
    await pool.query("UPDATE products SET embedding = $1::vector WHERE id = $2", [vectorString, product.id]);
    console.log(`Updated embedding for: ${product.name}`);
  }
  console.log("Embedding sync complete!");
};