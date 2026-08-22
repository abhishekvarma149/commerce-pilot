import { Request, Response } from "express";
import pool from "../config/db";

export const createMerchant = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            res.status(400).json({
                success: false,
                message: "Name and email are required",
            });
            return;
        }

        const result = await pool.query(
            `
      INSERT INTO merchants (name, email)
      VALUES ($1, $2)
      RETURNING *
      `,
            [name, email]
        );

        res.status(201).json({
            success: true,
            merchant: result.rows[0],
        });
    } catch (error) {
        console.error("Create merchant error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create merchant",
            error: error instanceof Error ? error.message : String(error),
        });
    }
};

export const getMerchant = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM merchants WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({
                success: false,
                message: "Merchant not found",
            });
            return;
        }

        res.json({
            success: true,
            merchant: result.rows[0],
        });
    } catch (error) {
        console.error("Get merchant error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch merchant",
        });
    }
};