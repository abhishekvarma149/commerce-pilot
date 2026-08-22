import "dotenv/config";
import app from "./app";
import pool from "./config/db";

const PORT = process.env.PORT || 8000;

const startServer = async () => {
    try {
        await pool.query("SELECT 1");

        console.log("✅ Database connection verified");

        app.listen(PORT, () => {
            console.log(`🚀 CommercePilot backend running on port ${PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
};

startServer();