import express from "express";
import cors from "cors";
import { getSystemInfo, recordMetric, getMetricsHistory } from "./metrics";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0", uptime: process.uptime() });
});

app.get("/api/system", (_req, res) => {
  res.json(getSystemInfo());
});

app.get("/api/cpu", (_req, res) => {
  const info = getSystemInfo();
  res.json(info.cpu);
});

app.get("/api/memory", (_req, res) => {
  const info = getSystemInfo();
  res.json(info.memory);
});

app.get("/api/disks", (_req, res) => {
  const info = getSystemInfo();
  res.json(info.disks);
});

app.get("/api/metrics", (req, res) => {
  const minutes = parseInt(req.query.minutes as string) || 60;
  res.json(getMetricsHistory(minutes));
});

app.get("/api/metrics/record", (_req, res) => {
  const point = recordMetric();
  res.json(point);
});

app.get("/api/processes", (_req, res) => {
  try {
    const { execSync } = require("child_process");
    const platform = process.platform;
    let output: string;
    if (platform === "win32") {
      output = execSync(
        'wmic process get Name,ProcessId,WorkingSetSize /format:csv 2>nul | head -30',
        { encoding: "utf-8" }
      );
    } else {
      output = execSync("ps aux --sort=-%mem | head -20", { encoding: "utf-8" });
    }
    res.json({ raw: output });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

const interval = setInterval(recordMetric, 10000);

const server = app.listen(PORT, () => {
  console.log(`ExpressPulse API running on http://localhost:${PORT}`);
  console.log(`Endpoints: /api/health, /api/system, /api/cpu, /api/memory, /api/disks, /api/metrics`);
});

process.on("SIGINT", () => {
  clearInterval(interval);
  server.close();
  process.exit(0);
});

export { app };
