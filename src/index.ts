import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { getSystemInfo, recordMetric, getMetricsHistory, getAlertThresholds, getHistoryConfig } from "./metrics";

// ── App Setup ───────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  _res.on("finish", () => {
    const duration = Date.now() - start;
    const log = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms`;
    if (process.env.NODE_ENV !== "test") {
      console.log(log);
    }
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || "120", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api", limiter);

// ── Routes ──────────────────────────────────────────────────────────────────

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: "2.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/system", (_req: Request, res: Response) => {
  res.json(getSystemInfo());
});

app.get("/api/cpu", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json(info.cpu);
});

app.get("/api/memory", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json(info.memory);
});

app.get("/api/disks", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json(info.disks);
});

app.get("/api/network", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json(info.network);
});

app.get("/api/processes", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json(info.processes);
});

app.get("/api/alerts", (_req: Request, res: Response) => {
  const info = getSystemInfo();
  res.json({
    alerts: info.alerts,
    thresholds: getAlertThresholds(),
  });
});

app.get("/api/metrics", (req: Request, res: Response) => {
  const minutes = parseInt(req.query.minutes as string) || 60;
  res.json(getMetricsHistory(minutes));
});

app.get("/api/metrics/record", (_req: Request, res: Response) => {
  const point = recordMetric();
  res.json(point);
});

app.get("/api/metrics/config", (_req: Request, res: Response) => {
  res.json({
    thresholds: getAlertThresholds(),
    history: getHistoryConfig(),
  });
});

// ── Error Handling ──────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${new Date().toISOString()} ${err.message}`);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "production" ? undefined : err.message,
  });
});

// ── Server Start ────────────────────────────────────────────────────────────

let recordInterval: ReturnType<typeof setInterval>;

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`ExpressPulse API v2.0.0 running on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  GET /api/health       - Health check`);
    console.log(`  GET /api/system       - Full system info`);
    console.log(`  GET /api/cpu          - CPU details`);
    console.log(`  GET /api/memory       - Memory usage`);
    console.log(`  GET /api/disks        - Disk usage`);
    console.log(`  GET /api/network      - Network I/O`);
    console.log(`  GET /api/processes    - Process info`);
    console.log(`  GET /api/alerts       - Active alerts`);
    console.log(`  GET /api/metrics      - History (?minutes=60)`);
    console.log(`  GET /api/metrics/record - Record snapshot`);
    console.log(`  GET /api/metrics/config - Thresholds & config`);
  });

  recordInterval = setInterval(recordMetric, 10000);

  // Graceful shutdown
  function shutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    clearInterval(recordInterval);
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 5000);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return server;
}

// Only start if not in test environment
let server: ReturnType<typeof app.listen> | undefined;
if (process.env.NODE_ENV !== "test") {
  server = startServer();
}

export { app, startServer };
