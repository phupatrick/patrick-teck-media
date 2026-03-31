import { spawnSync } from "node:child_process";

const allowedPaths = [
  "data/newsroom-content.json",
  "data/platform-state.json",
  "data/openclaw-hidden-feed.json",
  "data/openclaw-manager-state.json",
  "data/openclaw-web-state.json"
];

const autopush = isEnabled(process.env.OPENCLAW_GIT_AUTOPUSH);
const runTests = !isEnabled(process.env.OPENCLAW_GIT_SKIP_TESTS);
const commitMessage = process.env.OPENCLAW_GIT_COMMIT_MESSAGE || "OpenClaw: refresh newsroom and frontpage";
const gitUserName = process.env.OPENCLAW_GIT_USER_NAME || "OpenClaw[bot]";
const gitUserEmail = process.env.OPENCLAW_GIT_USER_EMAIL || "openclaw@users.noreply.github.com";

if (runTests) {
  runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["test"], "OpenClaw test gate failed.");
}

const status = runCommand("git", ["status", "--porcelain", "--", ...allowedPaths], "Unable to inspect git status.", {
  allowFailure: true
});

if ((status.stdout || "").trim().length === 0) {
  console.log("OpenClaw git sync found no allowed changes to publish.");
  process.exit(0);
}

runCommand("git", ["config", "user.name", gitUserName], "Unable to configure git user.name.");
runCommand("git", ["config", "user.email", gitUserEmail], "Unable to configure git user.email.");
runCommand("git", ["add", "--", ...allowedPaths], "Unable to stage OpenClaw-managed files.");
runCommand("git", ["commit", "-m", commitMessage], "Unable to commit OpenClaw-managed files.", {
  allowFailure: true
});

if (autopush) {
  runCommand("git", ["push", "origin", "HEAD"], "Unable to push OpenClaw-managed files.");
}

console.log(`OpenClaw git sync completed.${autopush ? " Changes were pushed to origin." : " Changes were committed locally."}`);

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function runCommand(command, args, errorMessage, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(result.stderr || result.stdout || errorMessage);
  }

  return result;
}
