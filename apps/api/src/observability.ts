import pino from "pino";

let logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "whistle-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function configureLogger(level: string) {
  logger = pino({
    level,
    base: { service: "whistle-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return logger;
}

export function getLogger() {
  return logger;
}

export type Metrics = {
  startedAt: number;
  httpRequests: number;
  httpErrors: number;
  deposits: number;
  settlements: number;
  voids: number;
  sseReconnects: number;
  lastIngestAt: number | null;
  lastSettleAt: number | null;
};

const metrics: Metrics = {
  startedAt: Date.now(),
  httpRequests: 0,
  httpErrors: 0,
  deposits: 0,
  settlements: 0,
  voids: 0,
  sseReconnects: 0,
  lastIngestAt: null,
  lastSettleAt: null,
};

export function getMetrics(): Metrics {
  return { ...metrics };
}

export function bumpMetric(
  key: Exclude<keyof Metrics, "startedAt" | "lastIngestAt" | "lastSettleAt">,
  n = 1
) {
  metrics[key] += n;
}

export function markIngest() {
  metrics.lastIngestAt = Date.now();
}

export function markSettle() {
  metrics.lastSettleAt = Date.now();
  metrics.settlements += 1;
}

export function metricsPrometheus(): string {
  const m = metrics;
  const uptime = (Date.now() - m.startedAt) / 1000;
  return [
    `# HELP whistle_uptime_seconds Process uptime`,
    `# TYPE whistle_uptime_seconds gauge`,
    `whistle_uptime_seconds ${uptime.toFixed(1)}`,
    `# HELP whistle_http_requests_total HTTP requests`,
    `# TYPE whistle_http_requests_total counter`,
    `whistle_http_requests_total ${m.httpRequests}`,
    `# HELP whistle_http_errors_total HTTP 5xx`,
    `# TYPE whistle_http_errors_total counter`,
    `whistle_http_errors_total ${m.httpErrors}`,
    `# HELP whistle_deposits_total Deposits`,
    `# TYPE whistle_deposits_total counter`,
    `whistle_deposits_total ${m.deposits}`,
    `# HELP whistle_settlements_total Settlements`,
    `# TYPE whistle_settlements_total counter`,
    `whistle_settlements_total ${m.settlements}`,
    `# HELP whistle_voids_total Voids`,
    `# TYPE whistle_voids_total counter`,
    `whistle_voids_total ${m.voids}`,
    `# HELP whistle_last_ingest_unixtime Last ingest`,
    `# TYPE whistle_last_ingest_unixtime gauge`,
    `whistle_last_ingest_unixtime ${m.lastIngestAt ? (m.lastIngestAt / 1000).toFixed(0) : 0}`,
  ].join("\n") + "\n";
}
