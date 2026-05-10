import crypto from "node:crypto";

import { createDocumentStore } from "./document-store.mjs";

const DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 120;
const DEFAULT_JOB_LEASE_SECONDS = 90;
const MAX_WORKER_CAPABILITIES = 32;
const MAX_JOB_RESULT_CHARS = 16000;

export function createOpenClawControlPlane(options = {}) {
  const store = createDocumentStore({
    documentKey: "openclaw_control_plane_state",
    fallbackPath: options.statePath || "data/openclaw-control-plane.json",
    databaseUrl: options.databaseUrl || "",
    initialValue: createInitialState()
  });
  const heartbeatTimeoutSeconds = toPositiveInteger(
    options.heartbeatTimeoutSeconds,
    DEFAULT_HEARTBEAT_TIMEOUT_SECONDS
  );
  const defaultJobLeaseSeconds = toPositiveInteger(
    options.defaultJobLeaseSeconds,
    DEFAULT_JOB_LEASE_SECONDS
  );

  return {
    statePath: store.statePath,
    storageMode: store.storageMode,
    async getSummary() {
      const state = await loadState();
      return buildSummary(state);
    },
    async getWorkers() {
      const state = await loadState();
      return state.workers;
    },
    async getJobs() {
      const state = await loadState();
      return state.jobs;
    },
    async registerWorker(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);

      if (!workerId) {
        throw new Error("A workerId is required.");
      }

      const worker = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const existing = draft.workers.find((entry) => entry.id === workerId);
        const nextWorker = {
          id: workerId,
          label: normalizeLabel(input.label) || workerId,
          hostname: normalizeLabel(input.hostname),
          platform: normalizeLabel(input.platform),
          version: normalizeLabel(input.version),
          capabilities: normalizeCapabilities(input.capabilities),
          tags: normalizeCapabilities(input.tags),
          metadata: normalizeMetadata(input.metadata),
          status: "online",
          currentJobId: existing?.currentJobId || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          registeredAt: existing?.registeredAt || now,
          lastSeenAt: now
        };

        if (existing) {
          Object.assign(existing, nextWorker);
          return existing;
        }

        draft.workers.push(nextWorker);
        return nextWorker;
      });

      return worker;
    },
    async heartbeatWorker(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);

      if (!workerId) {
        throw new Error("A workerId is required.");
      }

      const worker = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const existing = draft.workers.find((entry) => entry.id === workerId);

        if (!existing) {
          throw new Error(`Worker ${workerId} is not registered.`);
        }

        existing.status = "online";
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        if (input.currentJobId !== undefined) {
          existing.currentJobId = normalizeLabel(input.currentJobId);
        }
        if (Array.isArray(input.capabilities)) {
          existing.capabilities = normalizeCapabilities(input.capabilities);
        }
        if (input.metadata && typeof input.metadata === "object") {
          existing.metadata = normalizeMetadata({
            ...existing.metadata,
            ...input.metadata
          });
        }

        return existing;
      });

      return worker;
    },
    async createJob(input = {}) {
      const now = new Date().toISOString();
      const type = normalizeJobType(input.type);

      if (!type) {
        throw new Error("A job type is required.");
      }

      const job = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const nextJob = {
          id: normalizeWorkerId(input.id) || `job_${crypto.randomUUID()}`,
          type,
          capability: normalizeLabel(input.capability),
          targetWorkerId: normalizeWorkerId(input.targetWorkerId),
          command: normalizeCommand(input.command),
          payload: normalizePayload(input.payload),
          priority: toBoundedInteger(input.priority, 100, 0, 1000),
          leaseSeconds: toPositiveInteger(input.leaseSeconds, defaultJobLeaseSeconds),
          status: "queued",
          createdAt: now,
          updatedAt: now,
          queuedAt: now,
          claimedAt: "",
          completedAt: "",
          leaseOwner: "",
          leaseExpiresAt: "",
          attempts: 0,
          lastError: "",
          result: null
        };

        draft.jobs.push(nextJob);
        return nextJob;
      });

      return job;
    },
    async claimNextJob(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);

      if (!workerId) {
        throw new Error("A workerId is required.");
      }

      const nextJob = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const worker = draft.workers.find((entry) => entry.id === workerId);

        if (!worker) {
          throw new Error(`Worker ${workerId} is not registered.`);
        }

        const capabilities = normalizeCapabilities(
          input.capabilities?.length ? input.capabilities : worker.capabilities
        );
        const queuedJobs = draft.jobs
          .filter((job) => job.status === "queued")
          .filter((job) => {
            if (job.targetWorkerId && job.targetWorkerId !== workerId) {
              return false;
            }
            if (!job.capability) {
              return true;
            }
            return capabilities.includes(job.capability);
          })
          .sort(compareQueuedJobs);

        const claimed = queuedJobs[0];

        if (!claimed) {
          worker.status = "online";
          worker.updatedAt = now;
          worker.lastSeenAt = now;
          worker.currentJobId = "";
          return null;
        }

        claimed.status = "leased";
        claimed.leaseOwner = workerId;
        claimed.claimedAt = claimed.claimedAt || now;
        claimed.leaseExpiresAt = addSeconds(now, claimed.leaseSeconds || defaultJobLeaseSeconds);
        claimed.updatedAt = now;
        claimed.attempts += 1;
        worker.status = "busy";
        worker.currentJobId = claimed.id;
        worker.lastSeenAt = now;
        worker.updatedAt = now;
        return claimed;
      });

      return nextJob;
    },
    async heartbeatJob(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);
      const jobId = normalizeWorkerId(input.jobId);

      if (!workerId || !jobId) {
        throw new Error("A workerId and jobId are required.");
      }

      const job = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const worker = draft.workers.find((entry) => entry.id === workerId);
        const existing = draft.jobs.find((entry) => entry.id === jobId);

        if (!worker) {
          throw new Error(`Worker ${workerId} is not registered.`);
        }

        if (!existing) {
          throw new Error(`Job ${jobId} was not found.`);
        }

        if (!["leased", "running"].includes(existing.status) || existing.leaseOwner !== workerId) {
          throw new Error(`Job ${jobId} is not currently leased by worker ${workerId}.`);
        }

        existing.status = "running";
        existing.leaseExpiresAt = addSeconds(
          now,
          toPositiveInteger(input.leaseSeconds, existing.leaseSeconds || defaultJobLeaseSeconds)
        );
        existing.updatedAt = now;
        worker.status = "busy";
        worker.currentJobId = jobId;
        worker.lastSeenAt = now;
        worker.updatedAt = now;
        return existing;
      });

      return job;
    },
    async completeJob(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);
      const jobId = normalizeWorkerId(input.jobId);

      if (!workerId || !jobId) {
        throw new Error("A workerId and jobId are required.");
      }

      const job = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const worker = draft.workers.find((entry) => entry.id === workerId);
        const existing = draft.jobs.find((entry) => entry.id === jobId);

        if (!worker) {
          throw new Error(`Worker ${workerId} is not registered.`);
        }

        if (!existing) {
          throw new Error(`Job ${jobId} was not found.`);
        }

        if (existing.leaseOwner !== workerId) {
          throw new Error(`Job ${jobId} is not leased by worker ${workerId}.`);
        }

        existing.status = "completed";
        existing.completedAt = now;
        existing.updatedAt = now;
        existing.leaseExpiresAt = "";
        existing.result = summarizeResult(input.result);
        existing.lastError = "";
        worker.status = "online";
        worker.currentJobId = "";
        worker.lastSeenAt = now;
        worker.updatedAt = now;
        return existing;
      });

      return job;
    },
    async failJob(input = {}) {
      const now = new Date().toISOString();
      const workerId = normalizeWorkerId(input.workerId || input.id);
      const jobId = normalizeWorkerId(input.jobId);

      if (!workerId || !jobId) {
        throw new Error("A workerId and jobId are required.");
      }

      const job = await applyMutation((draft) => {
        hydrateState(draft);
        markExpiredJobs(draft, now);
        markStaleWorkers(draft, now, heartbeatTimeoutSeconds);

        const worker = draft.workers.find((entry) => entry.id === workerId);
        const existing = draft.jobs.find((entry) => entry.id === jobId);

        if (!worker) {
          throw new Error(`Worker ${workerId} is not registered.`);
        }

        if (!existing) {
          throw new Error(`Job ${jobId} was not found.`);
        }

        if (existing.leaseOwner !== workerId) {
          throw new Error(`Job ${jobId} is not leased by worker ${workerId}.`);
        }

        existing.status = "failed";
        existing.completedAt = now;
        existing.updatedAt = now;
        existing.leaseExpiresAt = "";
        existing.result = summarizeResult(input.result);
        existing.lastError = truncateText(input.error || "Worker reported an unknown error.");
        worker.status = "online";
        worker.currentJobId = "";
        worker.lastSeenAt = now;
        worker.updatedAt = now;
        return existing;
      });

      return job;
    }
  };

  async function loadState() {
    const state = await store.read();
    const now = new Date().toISOString();
    hydrateState(state);
    markExpiredJobs(state, now);
    markStaleWorkers(state, now, heartbeatTimeoutSeconds);
    return state;
  }

  async function applyMutation(mutator) {
    const state = await store.read();
    const result = await mutator(state);
    await store.write(state);
    return result;
  }
}

function createInitialState() {
  return {
    workers: [],
    jobs: []
  };
}

function hydrateState(state) {
  if (!Array.isArray(state.workers)) {
    state.workers = [];
  }
  if (!Array.isArray(state.jobs)) {
    state.jobs = [];
  }
}

function buildSummary(state) {
  const workers = state.workers;
  const jobs = state.jobs;

  return {
    workers: {
      total: workers.length,
      online: workers.filter((worker) => worker.status === "online").length,
      busy: workers.filter((worker) => worker.status === "busy").length,
      offline: workers.filter((worker) => worker.status === "offline").length
    },
    jobs: {
      total: jobs.length,
      queued: jobs.filter((job) => job.status === "queued").length,
      leased: jobs.filter((job) => job.status === "leased").length,
      running: jobs.filter((job) => job.status === "running").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      failed: jobs.filter((job) => job.status === "failed").length
    },
    recentWorkers: workers
      .slice()
      .sort((left, right) => compareIsoDates(right.lastSeenAt, left.lastSeenAt))
      .slice(0, 10),
    recentJobs: jobs
      .slice()
      .sort((left, right) => compareIsoDates(right.updatedAt || right.createdAt, left.updatedAt || left.createdAt))
      .slice(0, 10)
  };
}

function markStaleWorkers(state, now, heartbeatTimeoutSeconds) {
  const deadline = Date.parse(now) - heartbeatTimeoutSeconds * 1000;

  for (const worker of state.workers) {
    if (!worker.lastSeenAt) {
      worker.status = "offline";
      continue;
    }

    worker.status = Date.parse(worker.lastSeenAt) >= deadline
      ? worker.currentJobId
        ? "busy"
        : "online"
      : "offline";
  }
}

function markExpiredJobs(state, now) {
  const nowMs = Date.parse(now);

  for (const job of state.jobs) {
    if (!job.leaseExpiresAt || !["leased", "running"].includes(job.status)) {
      continue;
    }

    if (Date.parse(job.leaseExpiresAt) > nowMs) {
      continue;
    }

    job.status = "queued";
    job.leaseOwner = "";
    job.leaseExpiresAt = "";
    job.updatedAt = now;
    job.lastError = truncateText(
      [job.lastError, `Lease expired at ${now}.`].filter(Boolean).join(" ")
    );
  }

  for (const worker of state.workers) {
    if (worker.currentJobId) {
      const currentJob = state.jobs.find((job) => job.id === worker.currentJobId);
      if (!currentJob || currentJob.leaseOwner !== worker.id || !["leased", "running"].includes(currentJob.status)) {
        worker.currentJobId = "";
      }
    }
  }
}

function compareQueuedJobs(left, right) {
  if ((left.priority || 0) !== (right.priority || 0)) {
    return (right.priority || 0) - (left.priority || 0);
  }

  return compareIsoDates(left.createdAt, right.createdAt);
}

function compareIsoDates(left, right) {
  return Date.parse(left || 0) - Date.parse(right || 0);
}

function normalizeWorkerId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizeLabel(value) {
  return String(value || "").trim().slice(0, 160);
}

function normalizeCapabilities(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => normalizeWorkerId(value))
      .filter(Boolean)
      .slice(0, MAX_WORKER_CAPABILITIES)
  )];
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .slice(0, 32)
    .map(([key, entryValue]) => [
      normalizeWorkerId(key) || "value",
      truncateText(typeof entryValue === "string" ? entryValue : JSON.stringify(entryValue))
    ]);

  return Object.fromEntries(entries);
}

function normalizeJobType(value) {
  return normalizeWorkerId(value).slice(0, 48);
}

function normalizeCommand(value) {
  if (typeof value === "string") {
    return value.trim().slice(0, 4000);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => truncateText(entry, 400)).join(" ").trim().slice(0, 4000);
  }

  return "";
}

function normalizePayload(value) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return JSON.parse(JSON.stringify(value));
}

function summarizeResult(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return truncateText(value);
  }

  return JSON.parse(JSON.stringify(limitNestedText(value)));
}

function limitNestedText(value) {
  if (typeof value === "string") {
    return truncateText(value);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(limitNestedText);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, entryValue]) => [key, limitNestedText(entryValue)])
  );
}

function truncateText(value, maxLength = MAX_JOB_RESULT_CHARS) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function addSeconds(isoDate, seconds) {
  return new Date(Date.parse(isoDate) + seconds * 1000).toISOString();
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
