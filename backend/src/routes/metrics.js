import express from 'express';
import client from 'prom-client';
import { oracleLockRegistry } from '../services/oracle/lockMetrics.js';

const router = express.Router();

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'soroban-playground-backend'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
export const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'status']
});
register.registerMetric(rateLimitHits);

export const cacheHitsTotal = new client.Counter({
  name: 'soroban_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['level', 'reason']
});
register.registerMetric(cacheHitsTotal);

export const cacheMissesTotal = new client.Counter({
  name: 'soroban_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['reason']
});
register.registerMetric(cacheMissesTotal);

export const cacheEvictionsTotal = new client.Counter({
  name: 'soroban_cache_evictions_total',
  help: 'Total number of cache evictions and invalidations'
});
register.registerMetric(cacheEvictionsTotal);

export const cacheEntryCount = new client.Gauge({
  name: 'soroban_cache_entry_count',
  help: 'Number of entries currently loaded in L1 cache'
});
register.registerMetric(cacheEntryCount);

export const cacheVersionGauge = new client.Gauge({
  name: 'soroban_cache_version',
  help: 'Current cache namespace version',
  labelNames: ['namespace']
});
register.registerMetric(cacheVersionGauge);

export const cacheLatencyHistogram = new client.Histogram({
  name: 'soroban_cache_latency_seconds',
  help: 'Latency for cache operations',
  labelNames: ['action']
});
register.registerMetric(cacheLatencyHistogram);

export const requestLatency = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
register.registerMetric(requestLatency);

export const eventValidationTotal = new client.Counter({
  name: 'event_validation_total',
  help: 'Total number of event validations by event type, schema version, and outcome',
  labelNames: ['event_type', 'schema_version', 'outcome']
});
register.registerMetric(eventValidationTotal);

export const eventSchemaVersionEventsTotal = new client.Counter({
  name: 'event_schema_version_events_total',
  help: 'Accepted events by event type and schema version',
  labelNames: ['event_type', 'schema_version']
});
register.registerMetric(eventSchemaVersionEventsTotal);

export const eventQuarantineSize = new client.Gauge({
  name: 'event_quarantine_open_items',
  help: 'Number of open quarantined events awaiting review'
});
register.registerMetric(eventQuarantineSize);

export const eventSchemaBreakingChangesTotal = new client.Counter({
  name: 'event_schema_breaking_changes_total',
  help: 'Detected or rejected breaking schema changes by event type',
  labelNames: ['event_type']
});
register.registerMetric(eventSchemaBreakingChangesTotal);

export const eventSchemaDetectionAlertsTotal = new client.Counter({
  name: 'event_schema_detection_alerts_total',
  help: 'Automated schema detection alerts by event type and severity',
  labelNames: ['event_type', 'severity']
});
register.registerMetric(eventSchemaDetectionAlertsTotal);

router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const merged = await client.Registry.merge([register, oracleLockRegistry]).metrics();
    res.end(merged);
  } catch (ex) {
    res.status(500).end(ex);
  }
});

export default router;
