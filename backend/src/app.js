const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const taskRoutes = require("./routes/taskRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const supportRoutes = require("./routes/supportRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  }),
);

app.use(express.json({ limit: "3mb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  // 500 တွေမှာ internal error message ကို client ကို မပြဘူး။
  const status = err.status || 500;

  if (status >= 500) {
    return res.status(status).json({ message: "Internal server error" });
  }

  return res.status(status).json({
    message: err.message || "Request failed",
  });
});

module.exports = app;
