import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createOpenClawControlPlane } from "../src/openclaw-control-plane.mjs";

const tempPath = path.join(
  os.tmpdir(),
  `openclaw-control-plane-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
);

try {
  const controlPlane = createOpenClawControlPlane({
    statePath: tempPath,
    heartbeatTimeoutSeconds: 60,
    defaultJobLeaseSeconds: 30
  });

  const worker = await controlPlane.registerWorker({
    workerId: "pc-main",
    label: "Main Desktop",
    capabilities: ["shell", "windows"]
  });
  assert.equal(worker.id, "pc-main");
  assert.deepEqual(worker.capabilities, ["shell", "windows"]);

  const job = await controlPlane.createJob({
    type: "shell",
    capability: "shell",
    command: "echo hello"
  });
  assert.equal(job.status, "queued");

  const claimed = await controlPlane.claimNextJob({
    workerId: "pc-main",
    capabilities: ["shell", "windows"]
  });
  assert.equal(claimed.id, job.id);
  assert.equal(claimed.status, "leased");

  const running = await controlPlane.heartbeatJob({
    workerId: "pc-main",
    jobId: job.id
  });
  assert.equal(running.status, "running");

  const completed = await controlPlane.completeJob({
    workerId: "pc-main",
    jobId: job.id,
    result: {
      exitCode: 0,
      stdout: "hello"
    }
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.stdout, "hello");

  const summary = await controlPlane.getSummary();
  assert.equal(summary.workers.total, 1);
  assert.equal(summary.jobs.completed, 1);

  console.log("openclaw-control-plane.test.mjs passed");
} finally {
  fs.rmSync(tempPath, { force: true });
}
