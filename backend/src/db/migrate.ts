import pool from "../config/db.js";

const runMigration = async () => {
  try {
    console.log("Running database migration for orders state machine...");

    // 1. Drop existing orders table to reset schema cleanly (optional, but prevents leftover schema issues)
    await pool.query(`DROP TABLE IF EXISTS orders CASCADE;`);

    // 2. Create Enum safely
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE order_status AS ENUM (
          'PENDING',
          'PAYMENT_PENDING',
          'PAID',
          'COMPLETED',
          'FAILED',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3. Create Orders Table with all required columns explicitly defined
    await pool.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_session_id VARCHAR(255) NOT NULL,
        product_id UUID REFERENCES products(id),
        status order_status DEFAULT 'PENDING',
        total_amount NUMERIC(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'INR',
        razorpay_order_id VARCHAR(255) UNIQUE,
        razorpay_payment_id VARCHAR(255),
        razorpay_signature VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Create Indexes safely
    await pool.query(`
      CREATE INDEX idx_orders_razorpay_order ON orders(razorpay_order_id);
      CREATE INDEX idx_orders_idempotency ON orders(idempotency_key);
    `);

    console.log("Migration completed successfully! Orders table and state machine ready.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

runMigration();