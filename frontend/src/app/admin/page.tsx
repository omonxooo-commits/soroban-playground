'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileWarning,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ||
  'http://localhost:5000';

const SAMPLE_PROOF = {
  proofType: 'price_attestation',
  priority: 80,
  maxRetries: 3,
  idempotencyKey: 'btc-usd-2026-04-25T12:00:00Z',
  proof: {
    oracle: 'synthetic-assets-demo',
    asset: 'sBTC',
    price: 68420,
    signature: 'demo-signature',
    valid: true,
  },
  payload: {
    asset: 'sBTC',
    source: 'admin-dashboard',
  },
};

type Notification = {
  type: 'success' | 'error';
  message: string;
};

type RateLimitStat = {
  allowed?: string | number;
  blocked?: string | number;
};

type RateLimitAnalytics = {
  type?: string;
  fallback?: boolean;
  stats?: Record<string, RateLimitStat>;
  topIps?: string[];
};

type OracleTask = {
  id: string;
  proofType: string;
  priority: number;
  attempts: number;
  retryCount: number;
  status: string;
  workerId?: string;
  lastError?: string;
  updatedAt: string;
};

type OracleQueueStatus = {
  storage: string;
  durable: boolean;
  counts: Record<string, number>;
  workers: Array<{
    workerId: string;
    processed: number;
    lastTaskId?: string;
    lastStatus?: string;
    lastSeenAt?: string;
  }>;
  settings: {
    maxRetries: number;
    lockMs: number;
    heartbeatMs: number;
    pollMs: number;
    batchLimit: number;
  };
  recentDeadLetter: OracleTask[];
  generatedAt: string;
};

type ApiPayload<T> = {
  success?: boolean;
  message?: string;
  error?: string;
  data?: T;
  config?: Record<string, number>;
};

function metricNumber(value: unknown) {
  return Number.parseInt(String(value || '0'), 10) || 0;
}

function safeJson(value: string) {
  try {
    return { ok: true as const, data: JSON.parse(value) as unknown };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'Invalid JSON',
    };
  }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);

  return (
    <div className="flex h-32 items-end gap-1">
      {values.length === 0 ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
          Waiting for traffic
        </div>
      ) : (
        values.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className="min-w-2 flex-1 rounded-t bg-cyan-400/70"
            style={{ height: `${Math.max(6, (value / max) * 100)}%` }}
            title={`${value} requests`}
          />
        ))
      )}
    </div>
  );
}

function StatePill({ state }: { state: string }) {
  const color =
    state === 'completed'
      ? 'bg-emerald-500/20 text-emerald-300'
      : state === 'processing'
        ? 'bg-cyan-500/20 text-cyan-300'
        : state === 'dead_letter'
          ? 'bg-red-500/20 text-red-300'
          : state === 'retrying'
            ? 'bg-amber-500/20 text-amber-300'
            : 'bg-gray-800 text-gray-300';

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${color}`}>
      {state}
    </span>
  );
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState<RateLimitAnalytics | null>(null);
  const [config, setConfig] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Array<{ time: string; hits: number }>>([]);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [queueStatus, setQueueStatus] = useState<OracleQueueStatus | null>(null);
  const [deadLetter, setDeadLetter] = useState<OracleTask[]>([]);
  const [proofJson, setProofJson] = useState(JSON.stringify(SAMPLE_PROOF, null, 2));

  const showNotification = useCallback((next: Notification) => {
    setNotification(next);
    window.setTimeout(() => setNotification(null), 3000);
  }, []);

  const refreshOracleQueue = useCallback(async () => {
    const [statusRes, deadLetterRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/oracle/queue/status`),
      fetch(`${API_BASE_URL}/api/oracle/queue/dead-letter?limit=10`),
    ]);
    const [statusPayload, deadLetterPayload] = await Promise.all([
      statusRes.json() as Promise<ApiPayload<OracleQueueStatus>>,
      deadLetterRes.json() as Promise<ApiPayload<OracleTask[]>>,
    ]);

    if (statusPayload.data) {
      setQueueStatus(statusPayload.data);
    }
    if (deadLetterPayload.data) {
      setDeadLetter(deadLetterPayload.data);
    }
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/rate-limits`)
      .then((res) => res.json() as Promise<ApiPayload<never>>)
      .then((data) => {
        setConfig(data.config || {});
      })
      .catch((err) => console.error('Failed to fetch config:', err));

    refreshOracleQueue().catch((err) =>
      console.error('Failed to fetch oracle queue:', err),
    );
    const queueTimer = window.setInterval(() => {
      refreshOracleQueue().catch(() => {});
    }, 5000);

    const ws = new WebSocket(`${API_BASE_URL.replace(/^http/, 'ws')}/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as RateLimitAnalytics;
      if (data.type === 'rate-limit-analytics') {
        setAnalytics(data);
        setHistory((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString(),
            hits: Object.values(data.stats || {}).reduce(
              (acc, curr) => acc + metricNumber(curr.allowed),
              0,
            ),
          },
        ]);
      }
      if (data.type === 'oracle-proof-progress') {
        refreshOracleQueue().catch(() => {});
      }
    };

    return () => {
      window.clearInterval(queueTimer);
      ws.close();
    };
  }, [refreshOracleQueue]);

  const blockedRequests = useMemo(
    () =>
      Object.values(analytics?.stats || {}).reduce(
        (total, value) => total + metricNumber(value.blocked),
        0,
      ),
    [analytics],
  );

  const queueTotal = useMemo(() => {
    const counts = queueStatus?.counts || {};
    return Object.values(counts).reduce((sum, value) => sum + value, 0);
  }, [queueStatus]);

  const handleUpdateLimit = async (endpoint: string, limit: number) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/rate-limits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, limit }),
      });
      const data = (await res.json()) as ApiPayload<never>;
      if (data.success) {
        showNotification({
          type: 'success',
          message: `Updated ${endpoint} limit to ${limit}`,
        });
        setConfig({ ...config, [endpoint]: limit });
      } else {
        showNotification({
          type: 'error',
          message: data.error || 'Failed to update',
        });
      }
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setIsSaving(false);
    }
  };

  const submitProof = async () => {
    const parsed = safeJson(proofJson);
    if (!parsed.ok) {
      showNotification({ type: 'error', message: parsed.message });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/oracle/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = (await res.json()) as ApiPayload<{ task: OracleTask }>;
      if (!res.ok || !data.data) {
        throw new Error(data.message || data.error || 'Failed to queue proof');
      }
      showNotification({
        type: 'success',
        message: `Queued ${data.data.task.id}`,
      });
      await refreshOracleQueue();
    } catch (error) {
      showNotification({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to queue proof',
      });
    }
  };

  const recoverQueue = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/oracle/queue/recover`, {
        method: 'POST',
      });
      const data = (await res.json()) as ApiPayload<{ recovered: number }>;
      if (!res.ok) {
        throw new Error(data.message || 'Recovery failed');
      }
      showNotification({
        type: 'success',
        message: `Recovered ${data.data?.recovered || 0} stalled tasks`,
      });
      await refreshOracleQueue();
    } catch (error) {
      showNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Recovery failed',
      });
    }
  };

  const requeueDeadLetter = async (taskId: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/oracle/queue/dead-letter/${taskId}/requeue`,
        { method: 'POST' },
      );
      const data = (await res.json()) as ApiPayload<OracleTask>;
      if (!res.ok) {
        throw new Error(data.message || 'Requeue failed');
      }
      showNotification({ type: 'success', message: `Requeued ${taskId}` });
      await refreshOracleQueue();
    } catch (error) {
      showNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Requeue failed',
      });
    }
  };

  const exportCSV = () => {
    const counts = queueStatus?.counts || {};
    const rows = [
      ['Metric', 'Value'],
      ['Traffic Hits', history.reduce((a, b) => a + b.hits, 0)],
      ['Blocked Requests', blockedRequests],
      ['Queue Storage', queueStatus?.storage || 'unknown'],
      ['Queue Durable', queueStatus?.durable ? 'yes' : 'no'],
      ['Queued Proofs', counts.queued || 0],
      ['Retrying Proofs', counts.retrying || 0],
      ['Processing Proofs', counts.processing || 0],
      ['Completed Proofs', counts.completed || 0],
      ['Dead Letter Proofs', counts.dead_letter || 0],
    ];
    const csvContent =
      'data:text/csv;charset=utf-8,' + rows.map((row) => row.join(',')).join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', 'oracle_queue_admin.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const statCards = [
    {
      label: 'Total Hits',
      value: history.reduce((a, b) => a + b.hits, 0),
      icon: Activity,
      color: 'text-cyan-400',
    },
    {
      label: 'Redis Status',
      value: analytics ? (analytics.fallback ? 'FALLBACK' : 'CONNECTED') : 'PENDING',
      icon: BarChart3,
      color: analytics?.fallback ? 'text-orange-400' : 'text-emerald-400',
    },
    {
      label: 'Queued Proofs',
      value: queueStatus?.counts?.queued || 0,
      icon: UploadCloud,
      color: 'text-emerald-400',
    },
    {
      label: 'Dead Letter',
      value: queueStatus?.counts?.dead_letter || 0,
      icon: FileWarning,
      color: 'text-red-400',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <ShieldCheck className="h-8 w-8 text-emerald-400" />
            Admin Control Center
          </h1>
          <p className="mt-2 text-gray-400">
            Rate limits and distributed oracle proof processing.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => refreshOracleQueue()}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 transition-colors hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 transition-colors hover:bg-gray-800"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-4 ${
            notification.type === 'success'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/50 bg-red-500/10 text-red-300'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          {notification.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-800 bg-gray-900/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-400">{stat.label}</p>
                <h3 className="mt-1 text-2xl font-bold">{stat.value}</h3>
              </div>
              <stat.icon className={`${stat.color} h-6 w-6`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6 lg:col-span-2">
          <h3 className="mb-5 text-lg font-semibold">Traffic Real-time</h3>
          <Sparkline values={history.map((item) => item.hits)} />
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
          <h3 className="mb-5 text-lg font-semibold">Queue Durability</h3>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Storage</span>
              <span className="font-mono text-gray-200">
                {queueStatus?.storage || 'unknown'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Durable</span>
              <span
                className={
                  queueStatus?.durable ? 'text-emerald-300' : 'text-amber-300'
                }
              >
                {queueStatus?.durable ? 'Redis backed' : 'Not durable'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Workers</span>
              <span>{queueStatus?.workers?.length || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Heartbeat</span>
              <span>{formatDuration(queueStatus?.settings?.heartbeatMs || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold">
            <Settings className="h-5 w-5" /> Dynamic Rate Limits
          </h3>
          <div className="space-y-5">
            {['compile', 'invoke', 'deploy', 'global'].map((endpoint) => (
              <div key={endpoint} className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium capitalize text-gray-300">
                    {endpoint} limit
                  </span>
                  <span className="font-bold text-cyan-300">
                    {config[endpoint] || 10} / hr
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="500"
                  value={config[endpoint] || 10}
                  onChange={(event) =>
                    setConfig({
                      ...config,
                      [endpoint]: Number.parseInt(event.target.value, 10),
                    })
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-800 accent-cyan-400"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => handleUpdateLimit(endpoint, config[endpoint] || 10)}
                    disabled={isSaving}
                    className="flex items-center gap-2 rounded bg-cyan-600 px-3 py-1 text-xs transition-colors hover:bg-cyan-500 disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" /> Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Play className="h-5 w-5" /> Oracle Queue State
            </h3>
            <button
              onClick={recoverQueue}
              className="flex items-center gap-2 rounded bg-gray-800 px-3 py-2 text-sm transition-colors hover:bg-gray-700"
            >
              <RotateCcw className="h-4 w-4" /> Recover
            </button>
          </div>
          <div className="space-y-4">
            {['queued', 'retrying', 'processing', 'completed', 'dead_letter'].map(
              (state) => {
                const value = queueStatus?.counts?.[state] || 0;
                const width = queueTotal > 0 ? (value / queueTotal) * 100 : 0;
                return (
                  <div key={state} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize text-gray-400">
                        {state.replace('_', ' ')}
                      </span>
                      <span className="font-semibold">{value}</span>
                    </div>
                    <div className="h-3 rounded bg-gray-800">
                      <div
                        className="h-3 rounded bg-emerald-400"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <UploadCloud className="h-5 w-5" /> Queue Proof Verification
            </h3>
            <button
              onClick={submitProof}
              className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-sm transition-colors hover:bg-emerald-500"
            >
              <UploadCloud className="h-4 w-4" /> Queue Proof
            </button>
          </div>
          <textarea
            value={proofJson}
            onChange={(event) => setProofJson(event.target.value)}
            spellCheck={false}
            className="h-80 w-full resize-none rounded-lg border border-gray-800 bg-black/40 p-4 font-mono text-sm text-gray-200 outline-none focus:border-emerald-500"
          />
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
          <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5" /> Worker Pool
          </h3>
          <div className="space-y-3">
            {queueStatus?.workers?.length ? (
              queueStatus.workers.map((worker) => (
                <div key={worker.workerId} className="rounded-lg bg-gray-950 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-gray-300">
                      {worker.workerId}
                    </span>
                    <span className="text-sm text-emerald-300">
                      {worker.processed} processed
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {worker.lastTaskId || 'No tasks yet'} ·{' '}
                    {worker.lastStatus || 'idle'}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-gray-950 p-6 text-sm text-gray-500">
                No active workers. Redis-backed workers start with the backend.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
        <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold">
          <FileWarning className="h-5 w-5" /> Dead Letter Queue
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="pb-3 font-medium">Task</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Attempts</th>
                <th className="pb-3 font-medium">Error</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {deadLetter.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    No dead letter tasks.
                  </td>
                </tr>
              ) : (
                deadLetter.map((task) => (
                  <tr key={task.id}>
                    <td className="py-4 font-mono text-gray-300">{task.id}</td>
                    <td className="py-4">{task.proofType}</td>
                    <td className="py-4">{task.attempts}</td>
                    <td className="py-4 text-red-300">
                      {task.lastError || 'Verification failed'}
                    </td>
                    <td className="py-4">
                      <button
                        onClick={() => requeueDeadLetter(task.id)}
                        className="flex items-center gap-2 rounded bg-gray-800 px-3 py-1 transition-colors hover:bg-gray-700"
                      >
                        <RotateCcw className="h-3 w-3" /> Requeue
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-6">
        <h3 className="mb-5 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5" /> Queue Snapshot
        </h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Object.entries(queueStatus?.counts || {}).map(([state, value]) => (
            <div key={state} className="rounded-lg bg-gray-950 p-4">
              <StatePill state={state} />
              <p className="mt-3 text-2xl font-bold">{value}</p>
            </div>
          ))}
          {!queueStatus && (
            <div className="col-span-full rounded-lg bg-gray-950 p-6 text-sm text-gray-500">
              Queue status unavailable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
