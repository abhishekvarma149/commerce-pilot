import express from "express";
import cors from "cors";

import merchantRoutes from "./routes/merchant.routes";
import productRoutes from "./routes/product.routes";
import catalogRoutes from "./routes/catalog.routes";
import agentRoutes from "./routes/agent.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import analyticsRouter from "./routes/analytics.js";

const app = express();

app.use(cors());

// Capture raw body for HMAC cryptographic verification in Razorpay webhooks
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Route Registrations
app.use("/api/catalog", catalogRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/webhook", webhookRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/merchants", merchantRoutes);
app.use("/api/products", productRoutes);
// Mount beside existing routers
app.use("/api/analytics", analyticsRouter);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "commerce-pilot-backend",
  });
});

export default app;