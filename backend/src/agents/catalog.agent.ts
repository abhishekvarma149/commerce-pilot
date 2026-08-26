import { searchSemantic } from "../services/catalog.service.js";

export interface CandidateProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  specifications: Record<string, any>;
  use_cases: string[];
  quantity: number;
  similarity: number;
}

interface RetrieveCandidatesParams {
  query: string;
  maxPrice?: number;
  limit?: number;
}

/**
 * Retrieves relevant product candidates from the database using vector similarity search.
 */
export async function retrieveCatalogCandidates({
  query,
  maxPrice,
  limit = 5,
}: RetrieveCandidatesParams): Promise<CandidateProduct[]> {

  
  try {
    const products = await searchSemantic(query, maxPrice, limit);

    return products as CandidateProduct[];
  } catch (error) {
    console.error("❌ Error in retrieveCatalogCandidates:", error);
    throw error;
  }
}