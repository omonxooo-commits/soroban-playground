import express from 'express';
import client from 'prom-client';

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

export const requestLatency = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});
register.registerMetric(requestLatency);

export const oracleProofTasksEnqueued = new client.Counter({
  name: 'oracle_proof_tasks_enqueued_total',
  help: 'Total oracle proof tasks accepted by the producer API',
  labelNames: ['priority']
});
register.registerMetric(oracleProofTasksEnqueued);

export const oracleProofTaskTransitions = new client.Counter({
  name: 'oracle_proof_task_transitions_total',
  help: 'Oracle proof task state transitions',
  labelNames: ['from_state', 'to_state']
});
register.registerMetric(oracleProofTaskTransitions);

export const oracleProofTaskRetries = new client.Counter({
  name: 'oracle_proof_task_retries_total',
  help: 'Oracle proof task retry attempts scheduled after worker failures',
  labelNames: ['reason']
});
register.registerMetric(oracleProofTaskRetries);

export const oracleProofDeadLetterTotal = new client.Counter({
  name: 'oracle_proof_dead_letter_total',
  help: 'Oracle proof tasks moved to the dead letter queue',
  labelNames: ['reason']
});
register.registerMetric(oracleProofDeadLetterTotal);

export const oracleProofQueueDepth = new client.Gauge({
  name: 'oracle_proof_queue_depth',
  help: 'Oracle proof task count by queue state',
  labelNames: ['state']
});
register.registerMetric(oracleProofQueueDepth);

export const oracleProofProcessingDuration = new client.Histogram({
  name: 'oracle_proof_processing_duration_seconds',
  help: 'Oracle proof task processing duration',
  labelNames: ['outcome'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});
register.registerMetric(oracleProofProcessingDuration);

export const oracleProofWorkerHeartbeats = new client.Counter({
  name: 'oracle_proof_worker_heartbeats_total',
  help: 'Heartbeat writes from oracle proof workers',
  labelNames: ['worker_id']
});
register.registerMetric(oracleProofWorkerHeartbeats);

router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

export default router;
