import pool from "./config/db.js";

// Run this once when your backend starts up
export const initAuditTable = async () => {
  try {
    await pool.query(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    action_type VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`);
    console.log("Migration: audit_logs table created or already exists.");
  } catch (err) {
    console.error("❌ Failed to initialize audit_logs table:", err);
  }
};

// Call the function on server launch:
initAuditTable();
