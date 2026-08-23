import express from "express";
import cors from "cors";

import merchantRoutes from "./routes/merchant.routes";
import productRoutes from "./routes/product.routes";
// Add this to your imports at the top
import catalogRoutes from "./routes/catalog.routes";

import agentRoutes from "./routes/agent.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js";
const app = express();

app.use(cors());
app.use(express.json());
// Add this below your existing routes
app.use("/api/catalog", catalogRoutes);


// Mount your checkout routes
app.use("/api/checkout", checkoutRoutes);

// Add this below your other route registrations:
app.use("/api/agent", agentRoutes);

app.use("/api/merchants", merchantRoutes);
app.use("/api/products", productRoutes);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "commerce-pilot-backend",
  });
});

export default app;