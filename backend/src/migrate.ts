import pool from "./config/db.js";

// Run this once when your backend starts up
export const initAuditTable = async () => {
  try {
    await pool.query(`
  CREATE TABLE IF NOT EXISTS merchant_policies (
    id SERIAL PRIMARY KEY,
    policy_name VARCHAR(100) NOT NULL UNIQUE,
    max_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  INSERT INTO merchant_policies (policy_name, max_discount_pct, is_active)
  VALUES ('DEFAULT_BUNDLE_POLICY', 15.00, TRUE)
  ON CONFLICT (policy_name) DO NOTHING;
`);
    console.log("Migration: merchant_policies table initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize audit_logs table:", err);
  }
};

// Call the function on server launch:
initAuditTable();
