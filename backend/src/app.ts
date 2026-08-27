import express from "express";
import cors from "cors";
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';

import merchantRoutes from "./routes/merchant.routes";
import productRoutes from "./routes/product.routes";
import catalogRoutes from "./routes/catalog.routes";
import agentRoutes from "./routes/agent.routes.js";
import checkoutRoutes from "./routes/checkout.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import analyticsRouter from "./routes/analytics.js";
import webhookRouter from "./routes/webhook.js";
import ordersRouter from "./routes/orders.js";
const app = express();

app.use(cors());

// 1. Initialize Redis Client
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// 2. Use Redis for Sessions
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'commercepilot_session_secret_2026',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

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
// Mount beside your other route handlers
app.use("/api/webhooks", webhookRouter);


app.use("/api/orders", ordersRouter);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "commerce-pilot-backend",
  });
});

export default app;