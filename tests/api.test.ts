import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/index";

let server: ReturnType<typeof app.listen>;

beforeAll(() => {
  server = app.listen(0);
});

afterAll((done) => {
  server.close(done);
});

describe("GET /api/health", () => {
  it("should return status ok with version and uptime", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("2.0.0");
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("GET /api/cpu", () => {
  it("should return CPU info with model, cores, usage, and speed", async () => {
    const res = await request(app).get("/api/cpu");
    expect(res.status).toBe(200);
    expect(typeof res.body.model).toBe("string");
    expect(typeof res.body.cores).toBe("number");
    expect(res.body.cores).toBeGreaterThan(0);
    expect(typeof res.body.usage).toBe("number");
    expect(res.body.usage).toBeGreaterThanOrEqual(0);
    expect(res.body.usage).toBeLessThanOrEqual(100);
    expect(typeof res.body.speed).toBe("number");
  });
});

describe("GET /api/memory", () => {
  it("should return memory info with total, free, used, and usagePercent", async () => {
    const res = await request(app).get("/api/memory");
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.free).toBe("number");
    expect(typeof res.body.used).toBe("number");
    expect(res.body.used).toBe(res.body.total - res.body.free);
    expect(typeof res.body.usagePercent).toBe("number");
    expect(res.body.usagePercent).toBeGreaterThanOrEqual(0);
    expect(res.body.usagePercent).toBeLessThanOrEqual(100);
  });
});

describe("GET /api/disks", () => {
  it("should return an array of disk objects", async () => {
    const res = await request(app).get("/api/disks");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const disk = res.body[0];
    expect(typeof disk.mount).toBe("string");
    expect(typeof disk.total).toBe("number");
    expect(typeof disk.free).toBe("number");
    expect(typeof disk.used).toBe("number");
    expect(typeof disk.usagePercent).toBe("number");
  });
});

describe("GET /api/processes", () => {
  it("should return process count info", async () => {
    const res = await request(app).get("/api/processes");
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.running).toBe("number");
    expect(typeof res.body.sleeping).toBe("number");
  });
});

describe("GET /api/metrics", () => {
  it("should return historical metric points", async () => {
    const res = await request(app).get("/api/metrics?minutes=60");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should default to 60 minutes when no parameter given", async () => {
    const res = await request(app).get("/api/metrics");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/network", () => {
  it("should return network bytes in/out", async () => {
    const res = await request(app).get("/api/network");
    expect(res.status).toBe(200);
    expect(typeof res.body.bytesIn).toBe("number");
    expect(typeof res.body.bytesOut).toBe("number");
  });
});

describe("GET /api/alerts", () => {
  it("should return alerts array and thresholds", async () => {
    const res = await request(app).get("/api/alerts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.thresholds).toBeDefined();
    expect(res.body.thresholds.cpu).toBeDefined();
    expect(res.body.thresholds.memory).toBeDefined();
    expect(res.body.thresholds.disk).toBeDefined();
  });
});

describe("GET /api/metrics/config", () => {
  it("should return thresholds and history config", async () => {
    const res = await request(app).get("/api/metrics/config");
    expect(res.status).toBe(200);
    expect(res.body.thresholds).toBeDefined();
    expect(res.body.history).toBeDefined();
    expect(typeof res.body.history.maxHistory).toBe("number");
    expect(typeof res.body.history.intervalMs).toBe("number");
  });
});

describe("GET /api/system", () => {
  it("should return full system info with all sections", async () => {
    const res = await request(app).get("/api/system");
    expect(res.status).toBe(200);
    expect(typeof res.body.hostname).toBe("string");
    expect(typeof res.body.platform).toBe("string");
    expect(typeof res.body.arch).toBe("string");
    expect(typeof res.body.uptime).toBe("number");
    expect(Array.isArray(res.body.loadAvg)).toBe(true);
    expect(res.body.cpu).toBeDefined();
    expect(res.body.memory).toBeDefined();
    expect(Array.isArray(res.body.disks)).toBe(true);
    expect(res.body.network).toBeDefined();
    expect(res.body.processes).toBeDefined();
    expect(Array.isArray(res.body.alerts)).toBe(true);
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("404 handling", () => {
  it("should return 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Endpoint not found");
  });
});
