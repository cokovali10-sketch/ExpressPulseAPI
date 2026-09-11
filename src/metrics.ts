import * as os from "os";
import { execSync } from "child_process";

// ── Interfaces ──────────────────────────────────────────────────────────────

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

export interface NetworkInfo {
  bytesIn: number;
  bytesOut: number;
}

export interface ProcessInfo {
  total: number;
  running: number;
  sleeping: number;
  stopped: number;
  zombie: number;
  other: number;
}

export interface Alert {
  type: "cpu" | "memory" | "disk";
  severity: "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
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
  network: NetworkInfo;
  processes: ProcessInfo;
  alerts: Alert[];
  timestamp: string;
}

export interface MetricPoint {
  timestamp: string;
  cpu: number;
  memoryPercent: number;
  loadAvg: number;
  networkBytesIn: number;
  networkBytesOut: number;
  processCount: number;
}

// ── Alert Thresholds ────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = {
  cpu: { warning: 80, critical: 90 },
  memory: { warning: 75, critical: 85 },
  disk: { warning: 85, critical: 95 },
};

// ── Historical Data ─────────────────────────────────────────────────────────

const metricsHistory: MetricPoint[] = [];
const MAX_HISTORY = parseInt(process.env.METRICS_MAX_HISTORY || "3600", 10);
const RECORD_INTERVAL_MS = parseInt(process.env.METRICS_INTERVAL_MS || "10000", 10);

// ── CPU ─────────────────────────────────────────────────────────────────────

let prevCpuTimes: { idle: number; total: number } | null = null;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += (cpu.times as Record<string, number>)[type];
    }
    totalIdle += cpu.times.idle;
  }

  const current = { idle: totalIdle, total: totalTick };
  if (!prevCpuTimes) {
    prevCpuTimes = current;
    return Math.round((1 - totalIdle / totalTick) * 100 * 100) / 100;
  }

  const idleDiff = current.idle - prevCpuTimes.idle;
  const totalDiff = current.total - prevCpuTimes.total;
  prevCpuTimes = current;

  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 100 * 100) / 100;
}

// ── Disks ───────────────────────────────────────────────────────────────────

function getDisks(): DiskInfo[] {
  try {
    if (os.platform() === "win32") {
      const output = execSync(
        "wmic logicaldisk get Size,FreeSpace,Caption /format:csv",
        { encoding: "utf-8" }
      );
      const lines = output.trim().split("\n").filter((l) => l.includes(","));
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
      return disks.length > 0
        ? disks
        : [{ mount: "/", total: 0, free: 0, used: 0, usagePercent: 0 }];
    } else {
      const output = execSync("df -B1 / /home /tmp 2>/dev/null || df -B1 /", {
        encoding: "utf-8",
      });
      const lines = output.trim().split("\n").slice(1);
      return lines.map((line) => {
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

// ── Network ─────────────────────────────────────────────────────────────────

function getNetwork(): NetworkInfo {
  try {
    const interfaces = os.networkInterfaces();
    let bytesIn = 0;
    let bytesOut = 0;

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === "IPv4") {
          bytesIn += (iface as any).rxbytes || 0;
          bytesOut += (iface as any).txbytes || 0;
        }
      }
    }

    return { bytesIn, bytesOut };
  } catch {
    return { bytesIn: 0, bytesOut: 0 };
  }
}

// ── Processes ───────────────────────────────────────────────────────────────

function getProcessInfo(): ProcessInfo {
  const defaults: ProcessInfo = {
    total: 0,
    running: 0,
    sleeping: 0,
    stopped: 0,
    zombie: 0,
    other: 0,
  };

  try {
    if (os.platform() === "win32") {
      const output = execSync(
        'wmic process get ProcessId /format:csv 2>nul',
        { encoding: "utf-8" }
      );
      const lines = output.trim().split("\n").filter((l) => l.includes(",") && !l.includes("Node"));
      defaults.total = Math.max(0, lines.length - 1);
    } else {
      const output = execSync("ps -eo state 2>/dev/null || true", {
        encoding: "utf-8",
      });
      const lines = output.trim().split("\n").slice(1);
      defaults.total = lines.length;
      for (const line of lines) {
        const state = line.trim();
        if (state.startsWith("R")) defaults.running++;
        else if (state.startsWith("S")) defaults.sleeping++;
        else if (state.startsWith("T")) defaults.stopped++;
        else if (state.startsWith("Z")) defaults.zombie++;
        else defaults.other++;
      }
    }
  } catch {
    // Ignore errors, return defaults
  }

  return defaults;
}

// ── Alerts ──────────────────────────────────────────────────────────────────

function checkAlerts(
  cpuUsage: number,
  memoryPercent: number,
  disks: DiskInfo[]
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  if (cpuUsage >= ALERT_THRESHOLDS.cpu.critical) {
    alerts.push({
      type: "cpu",
      severity: "critical",
      message: `CPU usage at ${cpuUsage}% (critical threshold: ${ALERT_THRESHOLDS.cpu.critical}%)`,
      value: cpuUsage,
      threshold: ALERT_THRESHOLDS.cpu.critical,
      timestamp: now,
    });
  } else if (cpuUsage >= ALERT_THRESHOLDS.cpu.warning) {
    alerts.push({
      type: "cpu",
      severity: "warning",
      message: `CPU usage at ${cpuUsage}% (warning threshold: ${ALERT_THRESHOLDS.cpu.warning}%)`,
      value: cpuUsage,
      threshold: ALERT_THRESHOLDS.cpu.warning,
      timestamp: now,
    });
  }

  if (memoryPercent >= ALERT_THRESHOLDS.memory.critical) {
    alerts.push({
      type: "memory",
      severity: "critical",
      message: `Memory usage at ${memoryPercent}% (critical threshold: ${ALERT_THRESHOLDS.memory.critical}%)`,
      value: memoryPercent,
      threshold: ALERT_THRESHOLDS.memory.critical,
      timestamp: now,
    });
  } else if (memoryPercent >= ALERT_THRESHOLDS.memory.warning) {
    alerts.push({
      type: "memory",
      severity: "warning",
      message: `Memory usage at ${memoryPercent}% (warning threshold: ${ALERT_THRESHOLDS.memory.warning}%)`,
      value: memoryPercent,
      threshold: ALERT_THRESHOLDS.memory.warning,
      timestamp: now,
    });
  }

  for (const disk of disks) {
    if (disk.usagePercent >= ALERT_THRESHOLDS.disk.critical) {
      alerts.push({
        type: "disk",
        severity: "critical",
        message: `Disk ${disk.mount} usage at ${disk.usagePercent}% (critical threshold: ${ALERT_THRESHOLDS.disk.critical}%)`,
        value: disk.usagePercent,
        threshold: ALERT_THRESHOLDS.disk.critical,
        timestamp: now,
      });
    } else if (disk.usagePercent >= ALERT_THRESHOLDS.disk.warning) {
      alerts.push({
        type: "disk",
        severity: "warning",
        message: `Disk ${disk.mount} usage at ${disk.usagePercent}% (warning threshold: ${ALERT_THRESHOLDS.disk.warning}%)`,
        value: disk.usagePercent,
        threshold: ALERT_THRESHOLDS.disk.warning,
        timestamp: now,
      });
    }
  }

  return alerts;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getSystemInfo(): SystemInfo {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const cpuUsage = getCpuUsage();
  const memoryPercent = Math.round((usedMem / totalMem) * 100 * 100) / 100;
  const disks = getDisks();
  const alerts = checkAlerts(cpuUsage, memoryPercent, disks);

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    cpu: {
      model: cpus[0]?.model || "unknown",
      cores: cpus.length,
      usage: cpuUsage,
      speed: cpus[0]?.speed || 0,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: memoryPercent,
    },
    disks,
    network: getNetwork(),
    processes: getProcessInfo(),
    alerts,
    timestamp: new Date().toISOString(),
  };
}

export function recordMetric(): MetricPoint {
  const info = getSystemInfo();
  const point: MetricPoint = {
    timestamp: info.timestamp,
    cpu: info.cpu.usage,
    memoryPercent: info.memory.usagePercent,
    loadAvg: info.loadAvg[0],
    networkBytesIn: info.network.bytesIn,
    networkBytesOut: info.network.bytesOut,
    processCount: info.processes.total,
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

export function getAlertThresholds() {
  return { ...ALERT_THRESHOLDS };
}

export function getHistoryConfig() {
  return { maxHistory: MAX_HISTORY, intervalMs: RECORD_INTERVAL_MS };
}
