import * as os from "os";
import * as fs from "fs";

export interface CpuInfo {
  model: string;
  cores: number;
  usage: number;
  speed: number;
}

export interface MemoryInfo {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface DiskInfo {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
  mount: string;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  uptime: number;
  loadAvg: number[];
  cpu: CpuInfo;
  memory: MemoryInfo;
  disks: DiskInfo[];
  timestamp: string;
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as any)[type];
    }
    totalIdle += cpu.times.idle;
  }
  return Math.round((1 - totalIdle / totalTick) * 100 * 100) / 100;
}

function getDisks(): DiskInfo[] {
  try {
    const { execSync } = require("child_process");
    if (os.platform() === "win32") {
      const output = execSync("wmic logicaldisk get Size,FreeSpace,Caption /format:csv", { encoding: "utf-8" });
      const lines = output.trim().split("\n").filter((l: string) => l.includes(","));
      const disks: DiskInfo[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(",");
        if (parts.length >= 4) {
          const free = parseInt(parts[1]) || 0;
          const total = parseInt(parts[2]) || 0;
          const mount = parts[3] || "unknown";
          if (total > 0) {
            disks.push({
              mount,
              total,
              free,
              used: total - free,
              usagePercent: Math.round(((total - free) / total) * 100 * 100) / 100,
            });
          }
        }
      }
      return disks;
    } else {
      const output = execSync("df -B1 / /home /tmp 2>/dev/null || df -B1 /", { encoding: "utf-8" });
      const lines = output.trim().split("\n").slice(1);
      return lines.map((line: string) => {
        const parts = line.trim().split(/\s+/);
        const total = parseInt(parts[1]) || 0;
        const used = parseInt(parts[2]) || 0;
        const free = parseInt(parts[3]) || 0;
        return {
          mount: parts[5] || "/",
          total,
          free,
          used,
          usagePercent: total > 0 ? Math.round((used / total) * 100 * 100) / 100 : 0,
        };
      });
    }
  } catch {
    return [{ mount: "/", total: 0, free: 0, used: 0, usagePercent: 0 }];
  }
}

export function getSystemInfo(): SystemInfo {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    cpu: {
      model: cpus[0]?.model || "unknown",
      cores: cpus.length,
      usage: getCpuUsage(),
      speed: cpus[0]?.speed || 0,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: Math.round((usedMem / totalMem) * 100 * 100) / 100,
    },
    disks: getDisks(),
    timestamp: new Date().toISOString(),
  };
}

export interface MetricPoint {
  timestamp: string;
  cpu: number;
  memoryPercent: number;
  loadAvg: number;
}

const metricsHistory: MetricPoint[] = [];
const MAX_HISTORY = 3600;

export function recordMetric(): MetricPoint {
  const info = getSystemInfo();
  const point: MetricPoint = {
    timestamp: info.timestamp,
    cpu: info.cpu.usage,
    memoryPercent: info.memory.usagePercent,
    loadAvg: info.loadAvg[0],
  };
  metricsHistory.push(point);
  if (metricsHistory.length > MAX_HISTORY) {
    metricsHistory.shift();
  }
  return point;
}

export function getMetricsHistory(minutes: number = 60): MetricPoint[] {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  return metricsHistory.filter((p) => p.timestamp >= cutoff);
}
