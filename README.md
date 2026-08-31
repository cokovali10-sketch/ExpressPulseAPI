# ExpressPulse API

Lightweight REST API for real-time system resource monitoring.

## Features

- CPU, memory, disk usage monitoring
- Auto-recording metrics every 10 seconds
- Historical metrics with configurable time range
- Process listing
- CORS enabled
- Zero external dependencies for metrics (uses OS APIs)

## Build & Run

```bash
npm install
npm run build
npm start
# or
npm run dev
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/system` | Full system info |
| GET | `/api/cpu` | CPU details |
| GET | `/api/memory` | Memory usage |
| GET | `/api/disks` | Disk usage |
| GET | `/api/metrics` | Metrics history (?minutes=60) |
| GET | `/api/metrics/record` | Record current metric |
| GET | `/api/processes` | Top processes |

## Example Response

```json
{
  "hostname": "my-pc",
  "platform": "win32",
  "cpu": { "model": "Intel Core i7", "cores": 8, "usage": 35.2 },
  "memory": { "total": 17179869184, "free": 8589934592, "usagePercent": 50.0 },
  "disks": [{ "mount": "C:", "total": 500000000000, "usagePercent": 65.3 }]
}
```

## License

MIT
