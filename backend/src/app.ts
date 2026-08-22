import express from "express";
import cors from "cors";

import merchantRoutes from "./routes/merchant.routes";
import productRoutes from "./routes/product.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/merchants", merchantRoutes);
app.use("/api/products", productRoutes);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "commerce-pilot-backend",
  });
});

export default app;