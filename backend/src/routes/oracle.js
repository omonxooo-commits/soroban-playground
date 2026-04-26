import express from 'express';
import { asyncHandler, createHttpError } from '../middleware/errorHandler.js';
import oracleProofQueueService from '../services/oracleProofQueueService.js';
import { sendSuccess } from '../utils/response.js';

const router = express.Router();

function clientIdentity(req) {
  return req.headers['x-worker-id'] || req.ip || 'api';
}

function forwardServiceError(next, error) {
  return next(
    createHttpError(
      error.statusCode || 500,
      error.message || 'Oracle proof queue request failed',
      error.details
    )
  );
}

router.post(
  '/proofs',
  asyncHandler(async (req, res, next) => {
    try {
      const result = await oracleProofQueueService.enqueueProofTask(req.body || {}, {
        source: clientIdentity(req),
      });
      return sendSuccess(res, {
        statusCode: result.deduplicated ? 200 : 202,
        data: result,
        message: result.deduplicated
          ? 'Oracle proof task already exists'
          : 'Oracle proof task queued',
      });
    } catch (error) {
      return forwardServiceError(next, error);
    }
  })
);

router.post(
  '/proofs/batch',
  asyncHandler(async (req, res, next) => {
    try {
      const tasks = Array.isArray(req.body) ? req.body : req.body?.tasks;
      const results = await oracleProofQueueService.enqueueBatch(tasks, {
        source: clientIdentity(req),
      });
      return sendSuccess(res, {
        statusCode: 202,
        data: {
          count: results.length,
          tasks: results.map((result) => ({
            id: result.task.id,
            status: result.task.status,
            priority: result.task.priority,
            deduplicated: result.deduplicated,
          })),
        },
        message: 'Oracle proof task batch queued',
      });
    } catch (error) {
      return forwardServiceError(next, error);
    }
  })
);

router.get(
  '/proofs/:id',
  asyncHandler(async (req, res, next) => {
    const task = await oracleProofQueueService.getTask(req.params.id);
    if (!task) {
      return next(createHttpError(404, 'Oracle proof task not found'));
    }
    return sendSuccess(res, {
      data: task,
      message: 'Oracle proof task retrieved',
    });
  })
);

router.get(
  '/queue/status',
  asyncHandler(async (_req, res) => {
    return sendSuccess(res, {
      data: await oracleProofQueueService.getStatus(),
      message: 'Oracle proof queue status retrieved',
    });
  })
);

router.get(
  '/queue/tasks',
  asyncHandler(async (req, res) => {
    const tasks = await oracleProofQueueService.listTasks(
      req.query.state || 'all',
      req.query.limit || 50
    );
    return sendSuccess(res, {
      data: tasks,
      message: 'Oracle proof queue tasks retrieved',
      meta: { count: tasks.length },
    });
  })
);

router.get(
  '/queue/dead-letter',
  asyncHandler(async (req, res) => {
    const tasks = await oracleProofQueueService.listDeadLetter(
      req.query.limit || 50
    );
    return sendSuccess(res, {
      data: tasks,
      message: 'Oracle proof dead letter queue retrieved',
      meta: { count: tasks.length },
    });
  })
);

router.post(
  '/queue/dead-letter/:id/requeue',
  asyncHandler(async (req, res, next) => {
    try {
      const task = await oracleProofQueueService.requeueDeadLetter(req.params.id);
      return sendSuccess(res, {
        data: task,
        message: 'Dead letter task requeued',
      });
    } catch (error) {
      return forwardServiceError(next, error);
    }
  })
);

router.post(
  '/queue/recover',
  asyncHandler(async (_req, res) => {
    const recovered = await oracleProofQueueService.recoverStalledTasks();
    return sendSuccess(res, {
      data: { recovered },
      message: 'Oracle proof queue recovery completed',
    });
  })
);

export default router;
