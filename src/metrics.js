const os = require('os');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const config = require('./config.js');

const EXPORT_INTERVAL_MS = 10000;

// Only export when Grafana is configured, and never from tests.
const exportEnabled = Boolean(config.metrics) && process.env.NODE_ENV !== 'test';

// The SDK reports export failures (bad key, wrong URL, ...) through diag, which is silent by default.
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

const readers = [];
if (exportEnabled) {
  const credentials = Buffer.from(`${config.metrics.accountId}:${config.metrics.apiKey}`).toString('base64');
  const exporter = new OTLPMetricExporter({
    url: config.metrics.endpointUrl,
    headers: { Authorization: `Basic ${credentials}` },
  });
  readers.push(new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: EXPORT_INTERVAL_MS }));
}

const meterProvider = new MeterProvider({
  resource: resourceFromAttributes({ 'service.name': config.metrics?.source ?? 'jwt-pizza-service' }),
  readers,
});
const meter = meterProvider.getMeter('jwt-pizza-service');

const httpRequests = meter.createCounter('http_requests', { description: 'HTTP requests by method' });
const endpointLatency = meter.createHistogram('endpoint_latency', { unit: 'ms' });
const authAttempts = meter.createCounter('auth_attempts', { description: 'Login and register attempts by result' });
const pizzasSold = meter.createCounter('pizzas_sold');
const pizzaFailures = meter.createCounter('pizza_creation_failures', { description: 'Orders the factory failed to fulfill' });
const pizzaRevenue = meter.createCounter('pizza_revenue');
const pizzaLatency = meter.createHistogram('pizza_creation_latency', { unit: 'ms' });

function recordRequest(method) {
  httpRequests.add(1, { method });
}

function recordEndpointLatency(ms) {
  endpointLatency.record(ms);
}

// A user counts as active if they made an authenticated request within this window.
const ACTIVE_USER_WINDOW_MS = 5 * 60 * 1000;
const lastSeen = new Map();

function recordUserSeen(userId) {
  lastSeen.set(userId, Date.now());
}

function getActiveUserCount() {
  const cutoff = Date.now() - ACTIVE_USER_WINDOW_MS;
  // Prune expired entries here so the map doesn't grow forever.
  for (const [userId, seen] of lastSeen) {
    if (seen < cutoff) {
      lastSeen.delete(userId);
    }
  }
  return lastSeen.size;
}

function recordAuthAttempt(success) {
  authAttempts.add(1, { result: success ? 'successful' : 'failed' });
}

// `count` is the number of pizzas in the order. A failed order counts as one failure, not `count`.
function recordPizzaPurchase(success, latencyMs, revenue, count) {
  if (success) {
    pizzasSold.add(count);
    pizzaRevenue.add(revenue);
  } else {
    pizzaFailures.add(1);
  }
  pizzaLatency.record(latencyMs);
}

function getCpuUsagePercentage() {
  return Number(((os.loadavg()[0] / os.cpus().length) * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  return Number(((usedMemory / totalMemory) * 100).toFixed(2));
}

// Observable gauges are sampled by the SDK at each export.
meter.createObservableGauge('active_users').addCallback((result) => result.observe(getActiveUserCount()));
meter.createObservableGauge('cpu_usage', { unit: '%' }).addCallback((result) => result.observe(getCpuUsagePercentage()));
meter.createObservableGauge('memory_usage', { unit: '%' }).addCallback((result) => result.observe(getMemoryUsagePercentage()));

module.exports = {
  meterProvider,
  recordRequest,
  recordEndpointLatency,
  recordUserSeen,
  recordAuthAttempt,
  recordPizzaPurchase,
};
