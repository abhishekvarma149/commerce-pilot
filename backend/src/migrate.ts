import pool from "./config/db.js";

async function runMigrations() {
  try {
    // 1. Audit Logs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        order_id VARCHAR(255),
        action_type VARCHAR(100) NOT NULL,
        actor VARCHAR(100) NOT NULL,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Merchant Policies Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_policies (
        id SERIAL PRIMARY KEY,
        policy_name VARCHAR(100) UNIQUE NOT NULL,
        max_discount_pct NUMERIC DEFAULT 15,
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed default policy if not present
    await pool.query(`
      INSERT INTO merchant_policies (policy_name, max_discount_pct)
      VALUES ('DEFAULT_BUNDLE_POLICY', 15)
      ON CONFLICT (policy_name) DO NOTHING;
    `);

    // 3. Inventory TTL Locks Table
    await pool.query(`
  CREATE TABLE IF NOT EXISTS inventory_locks (
    id SERIAL PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    razorpay_order_id VARCHAR(255) UNIQUE,
    quantity INT DEFAULT 1,
    status VARCHAR(50) DEFAULT 'RESERVED',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    console.log("✅ All migrations executed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
}

runMigrations();