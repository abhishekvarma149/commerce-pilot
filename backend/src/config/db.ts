import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

console.log(
  "DATABASE_URL:",
  process.env.DATABASE_URL ? "Loaded ✅" : "Missing ❌"
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL error:", err);
});

export default pool;