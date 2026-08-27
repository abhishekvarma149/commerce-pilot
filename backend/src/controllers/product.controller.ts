import { Request, Response } from "express";
import pool from "../config/db";
import { buildProductDocument } from "../utils/productDocument";
import { generateEmbedding } from "../services/catalog.service";

export const createProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const client = await pool.connect();

  try {
    const {
      merchantId,
      name,
      description,
      category,
      price,
      currency = "INR",
      specifications = {},
      useCases = [],
      quantity = 0,
    } = req.body;

    if (!merchantId || !name || price === undefined) {
      res.status(400).json({
        success: false,
        message: "merchantId, name and price are required",
      });
      return;
    }

    if (Number(price) < 0 || Number(quantity) < 0) {
      res.status(400).json({
        success: false,
        message: "Price and Quantity cannot be negative",
      });
      return;
    }

    const merchantResult = await client.query(
      `SELECT id FROM merchants WHERE id = $1`,
      [merchantId]
    );

    if (merchantResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Merchant not found",
      });
      return;
    }

    // Generate Gemini vector embedding for the new product
    let embeddingVectorString: string | null = null;
    try {
      const documentText = buildProductDocument({
        name,
        description,
        category,
        price,
        currency,
        specifications,
        useCases,
      });
      const embedding = await generateEmbedding(documentText);
      embeddingVectorString = `[${embedding.join(",")}]`;
    } catch (embErr) {
      console.warn("⚠️ Warning: Failed to generate embedding on creation:", embErr);
    }

    await client.query("BEGIN");

    const productResult = await client.query(
      `
      INSERT INTO products (
        merchant_id,
        name,
        description,
        category,
        price,
        currency,
        specifications,
        use_cases,
        embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
      RETURNING *
      `,
      [
        merchantId,
        name,
        description ?? null,
        category ?? null,
        price,
        currency,
        specifications,
        useCases,
        embeddingVectorString,
      ]
    );

    const product = productResult.rows[0];

    const inventoryResult = await client.query(
      `
      INSERT INTO inventory (product_id, quantity)
      VALUES ($1, $2)
      RETURNING *
      `,
      [product.id, quantity]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      product: {
        ...product,
        inventory: inventoryResult.rows[0],
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Create product error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create product",
      details: error.message
    });
  } finally {
    client.release();
  }
};

export const getProducts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const merchantId = req.query.merchantId as string | undefined;

    const query = merchantId
      ? `
        SELECT p.*, i.quantity
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.merchant_id = $1
        ORDER BY p.created_at DESC
      `
      : `
        SELECT p.*, i.quantity
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        ORDER BY p.created_at DESC
      `;

    const result = merchantId
      ? await pool.query(query, [merchantId])
      : await pool.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows,
    });
  } catch (error: any) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      details: error.message
    });
  }
};

export const getProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT p.*, i.quantity
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    res.json({
      success: true,
      product: result.rows[0],
    });
  } catch (error: any) {
    console.error("Get product error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      details: error.message
    });
  }
};

export const updateProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      name,
      description,
      category,
      price,
      currency,
      specifications,
      useCases,
      quantity,
      isActive,
    } = req.body;

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    const current = existing.rows[0];

    // Build the updated product details to regenerate the embedding
    const finalName = name ?? current.name;
    const finalDescription = description ?? current.description;
    const finalCategory = category ?? current.category;
    const finalPrice = price ?? current.price;
    const finalCurrency = currency ?? current.currency;
    const finalSpecs = specifications ?? current.specifications;
    const finalUses = useCases ?? current.use_cases;

    let embeddingVectorString: string | null = null;
    try {
      const documentText = buildProductDocument({
        name: finalName,
        description: finalDescription,
        category: finalCategory,
        price: finalPrice,
        currency: finalCurrency,
        specifications: finalSpecs,
        useCases: finalUses,
      });
      const embedding = await generateEmbedding(documentText);
      embeddingVectorString = `[${embedding.join(",")}]`;
    } catch (embErr) {
      console.warn("⚠️ Failed to update embedding:", embErr);
    }

    const productResult = await client.query(
      `
      UPDATE products
      SET
        name = $1,
        description = $2,
        category = $3,
        price = $4,
        currency = $5,
        specifications = $6,
        use_cases = $7,
        is_active = $8,
        embedding = COALESCE($9::vector, embedding),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
      `,
      [
        finalName,
        finalDescription,
        finalCategory,
        finalPrice,
        finalCurrency,
        finalSpecs,
        finalUses,
        isActive ?? current.is_active,
        embeddingVectorString,
        id,
      ]
    );

    if (quantity !== undefined) {
      if (Number(quantity) < 0) {
        await client.query("ROLLBACK");
        res.status(400).json({
          success: false,
          message: "Quantity cannot be negative",
        });
        return;
      }
      await client.query(
        `
        UPDATE inventory
        SET quantity = $1, updated_at = CURRENT_TIMESTAMP
        WHERE product_id = $2
        `,
        [quantity, id]
      );
    }

    await client.query("COMMIT");

    const finalResult = await client.query(
      `
      SELECT p.*, i.quantity
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.id = $1
      `,
      [id]
    );

    res.json({
      success: true,
      product: finalResult.rows[0] ?? productResult.rows[0],
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update product",
      details: error.message
    });
  } finally {
    client.release();
  }
};

export const deleteProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM products
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Product not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete product",
      details: error.message
    });
  }
};