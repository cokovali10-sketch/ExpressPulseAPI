# ExpressPulse API

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![Express](https://img.shields.io/badge/Express-4.18-green?logo=express)
![License](https://img.shields.io/badge/License-MIT-yellow)

Production-grade REST API for real-time system resource monitoring with alerting, rate limiting, and historical metrics.

## Features

- **Real-time monitoring** — CPU, memory, disk, and network metrics on demand
- **Alert system** — Configurable thresholds for CPU (>90%), memory (>85%), disk (>95%)
- **Historical data** — Automatic metric recording with configurable retention (default: 3600 points)
- **Process monitoring** — Process count by status (running, sleeping, stopped, zombie)
- **Rate limiting** — 120 requests/minute per IP with sliding window
- **Request logging** — Timestamped logs with method, path, status, and duration
- **Graceful shutdown** — Handles SIGINT/SIGTERM with cleanup timeout
- **CORS enabled** — Cross-origin requests allowed by default
- **Zero-dependency metrics** — Uses Node.js `os` module for all system data

## Architecture

```
┌─────────────┐     HTTP      ┌──────────────────┐
│   Client    │ ──────────►   │  Express Server   │
│  (curl/UI)  │ ◄──────────   │  ┌────────────┐  │
└─────────────┘               │  │  Middleware  │  │
                              │  │  ├─ CORS     │  │
                              │  │  ├─ Logger   │  │
                              │  │  ├─ Limiter  │  │
                              │  │  └─ JSON     │  │
                              │  └────────────┘  │
                              │        │          │
                              │        ▼          │
                              │  ┌────────────┐  │
                              │  │  Metrics    │  │
                              │  │  Engine     │  │
                              │  │  ├─ CPU     │  │
                              │  │  ├─ Memory  │  │
                              │  │  ├─ Disk    │  │
                              │  │  ├─ Network │  │
                              │  │  ├─ Process │  │
                              │  │  └─ Alerts  │  │
                              │  └────────────┘  │
                              │        │          │
                              │        ▼          │
                              │  ┌────────────┐  │
                              │  │  History    │  │
                              │  │  Buffer     │  │
                              │  └────────────┘  │
                              └──────────────────┘
```

### How Monitoring Works

1. **Metric Collection** — Every 10 seconds, `recordMetric()` snapshots CPU usage, memory percentage, load average, network bytes, and process count into an in-memory ring buffer.
2. **CPU Calculation** — Uses delta between two `os.cpus()` readings to calculate true idle-vs-active ratio, avoiding the initial spike problem of single-point readings.
3. **Alert Evaluation** — On every `/api/system` or `/api/cpu` request, current values are compared against configurable thresholds. Alerts include severity (warning/critical), the measured value, and the threshold that was breached.
4. **History Retention** — The ring buffer holds up to 3600 data points (configurable via `METRICS_MAX_HISTORY`). When full, oldest entries are evicted. Queries filter by time window.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check with uptime |
| `GET` | `/api/system` | Full system snapshot (all metrics + alerts) |
| `GET` | `/api/cpu` | CPU model, cores, usage %, speed |
| `GET` | `/api/memory` | Total, free, used, usage % |
| `GET` | `/api/disks` | Per-mount disk stats |
| `GET` | `/api/network` | Network bytes in/out |
| `GET` | `/api/processes` | Process count by status |
| `GET` | `/api/alerts` | Active alerts + thresholds |
| `GET` | `/api/metrics` | Historical data (`?minutes=60`) |
| `GET` | `/api/metrics/record` | Force a metric snapshot |
| `GET` | `/api/metrics/config` | Current thresholds & retention config |

### Request/Response Examples

**`GET /api/cpu`**

```json
{
  "model": "Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz",
  "cores": 16,
  "usage": 12.45,
  "speed": 3800
}
```

**`GET /api/memory`**

```json
{
  "total": 17179869184,
  "free": 6442450944,
  "used": 10737418240,
  "usagePercent": 62.5
}
```

**`GET /api/alerts`**

```json
{
  "alerts": [
    {
      "type": "cpu",
      "severity": "warning",
      "message": "CPU usage at 82% (warning threshold: 80%)",
      "value": 82,
      "threshold": 80,
      "timestamp": "2026-09-10T12:00:00.000Z"
    }
  ],
  "thresholds": {
    "cpu": { "warning": 80, "critical": 90 },
    "memory": { "warning": 75, "critical": 85 },
    "disk": { "warning": 85, "critical": 95 }
  }
}
```

**`GET /api/processes`**

```json
{
  "total": 342,
  "running": 3,
  "sleeping": 310,
  "stopped": 0,
  "zombie": 0,
  "other": 29
}
```

**`GET /api/metrics?minutes=5`**

```json
[
  {
    "timestamp": "2026-09-10T12:00:00.000Z",
    "cpu": 15.2,
    "memoryPercent": 62.5,
    "loadAvg": 1.23,
    "networkBytesIn": 1048576,
    "networkBytesOut": 524288,
    "processCount": 342
  }
]
```

## Quick Start with curl

```bash
# Health check
curl http://localhost:3001/api/health

# Full system info
curl http://localhost:3001/api/system | jq .

# CPU only
curl http://localhost:3001/api/cpu | jq .

# Memory usage
curl http://localhost:3001/api/memory | jq .

# Disk usage
curl http://localhost:3001/api/disks | jq .

# Network I/O
curl http://localhost:3001/api/network | jq .

# Process counts
curl http://localhost:3001/api/processes | jq .

# Check alerts
curl http://localhost:3001/api/alerts | jq .

# Last 5 minutes of history
curl "http://localhost:3001/api/metrics?minutes=5" | jq .

# View thresholds and config
curl http://localhost:3001/api/metrics/config | jq .

# Force a metric snapshot
curl http://localhost:3001/api/metrics/record | jq .
```

## Alert System

Alerts are generated automatically on every system info request when thresholds are breached:

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Usage | ≥ 80% | ≥ 90% |
| Memory Usage | ≥ 75% | ≥ 85% |
| Disk Usage | ≥ 85% | ≥ 95% |

Thresholds can be customized by editing `ALERT_THRESHOLDS` in `src/metrics.ts`.

Alert response format:
```json
{
  "type": "cpu",
  "severity": "critical",
  "message": "CPU usage at 92% (critical threshold: 90%)",
  "value": 92,
  "threshold": 90,
  "timestamp": "2026-09-10T12:00:00.000Z"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Set to `production` to hide error details |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | `120` | Max requests per window |
| `METRICS_MAX_HISTORY` | `3600` | Max data points in ring buffer |
| `METRICS_INTERVAL_MS` | `10000` | Auto-record interval (ms) |

## Build from Source

```bash
# Clone
git clone https://github.com/your-username/ExpressPulseAPI.git
cd ExpressPulseAPI

# Install
npm install

# Development
npm run dev

# Build
npm run build

# Production
npm start

# Test
npm test

# Type check
npm run lint
```

## Project Structure

```
ExpressPulseAPI/
├── src/
│   ├── index.ts          # Express server, routes, middleware
│   └── metrics.ts        # Metric collection, alerts, history
├── tests/
│   └── api.test.ts       # API endpoint tests (vitest + supertest)
├── .github/
│   └── workflows/
│       └── ci.yml        # GitHub Actions CI (build + test)
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## License

MIT
