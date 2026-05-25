const token = String(process.env.GITHUB_WORKFLOW_DISPATCH_TOKEN || "").trim();
const repository = String(process.env.GITHUB_WORKFLOW_REPOSITORY || "phupatrick/patrick-teck-media").trim();
const workflowFile = String(process.env.GITHUB_WORKFLOW_FILE || "newsroom-refresh.yml").trim();
const ref = String(process.env.GITHUB_WORKFLOW_REF || "main").trim();
const reason = process.argv.slice(2).join(" ").trim() || "manual-dispatch-script";

if (!token) {
  throw new Error("GITHUB_WORKFLOW_DISPATCH_TOKEN is required.");
}

const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`, {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "patrick-tech-media-newsroom-dispatch"
  },
  body: JSON.stringify({
    ref,
    inputs: {
      source: "script",
      reason: reason.slice(0, 120)
    }
  })
});

if (!response.ok && response.status !== 204) {
  throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}: ${await response.text()}`);
}

console.log(`Dispatched ${workflowFile} on ${repository}@${ref}.`);
