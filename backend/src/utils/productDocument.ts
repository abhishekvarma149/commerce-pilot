export interface Product {
  name: string;
  description?: string | null;
  category?: string | null;
  price: string | number;
  currency?: string;
  specifications?: Record<string, any>; // Relaxed to 'any' for flexible JSON
  use_cases?: string[]; // From PostgreSQL
  useCases?: string[];  // From Express req.body
  quantity?: number;
}

export const buildProductDocument = (product: Product): string => {
  const specifications = Object.entries(product.specifications ?? {})
    .map(([key, value]) => {
      // Handle potential arrays or nested objects cleanly instead of [object Object]
      const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
      return `${key}: ${formattedValue}`;
    })
    .join(", ");

  // Grab the array from either the DB field or the API payload
  const useCasesArray = product.use_cases || product.useCases || [];
  const useCases = useCasesArray.join(", ");

  return `
Product: ${product.name}
Category: ${product.category ?? "Unknown"}
Price: ${product.currency ?? "INR"} ${product.price}
Description: ${product.description ?? "No description available"}

Specifications:
${specifications || "None"}

Suitable for:
${useCases || "General use"}

Available inventory:
${product.quantity ?? 0} units
`.trim();
};