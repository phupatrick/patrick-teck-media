import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createPlatformService } from "../src/platform-service.mjs";

const rootDir = process.cwd();
const envFromFile = loadEnvFile(path.join(rootDir, ".env"));

const config = {
  siteUrl: process.env.SITE_URL || envFromFile.SITE_URL || "https://patricktechmedia.vercel.app",
  contentPath: process.env.NEWSROOM_CONTENT_PATH || envFromFile.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
  platformStatePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
  managerStatePath: process.env.OPENCLAW_MANAGER_STATE_PATH || envFromFile.OPENCLAW_MANAGER_STATE_PATH || "data/openclaw-manager-state.json",
  hiddenFeedPath:
    process.env.NEWSROOM_PULL_FILE ||
    envFromFile.NEWSROOM_PULL_FILE ||
    process.env.OPENCLAW_NEWSROOM_FILE ||
    envFromFile.OPENCLAW_NEWSROOM_FILE ||
    "data/openclaw-hidden-feed.json",
  managerName: process.env.OPENCLAW_MANAGER_NAME || envFromFile.OPENCLAW_MANAGER_NAME || "OpenClaw",
  adminEmails: (process.env.ADMIN_GOOGLE_EMAILS || envFromFile.ADMIN_GOOGLE_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

const startedAt = new Date().toISOString();
const feedSource = ensureHiddenFeedSource();
const refresh = runRefreshCycle(feedSource.refreshSource);
const platformService = createPlatformService({
  statePath: config.platformStatePath,
  newsroomContentPath: config.contentPath,
  siteUrl: config.siteUrl,
  adminEmails: config.adminEmails,
  autonomousReviewerId: "openclaw"
});
const submissionReview = platformService.runAutonomousReviewCycle();
const managerSnapshot = buildManagerSnapshot({
  startedAt,
  finishedAt: new Date().toISOString(),
  feedSource,
  refresh,
  submissionReview,
  contentPath: config.contentPath,
  platformStatePath: platformService.statePath
});

writeJson(config.managerStatePath, managerSnapshot);

console.log(
  `OpenClaw manager cycle completed: ${managerSnapshot.newsroom.totalArticles} public article(s), ` +
    `${submissionReview.totalSubmissions} submission(s), ${submissionReview.approved} newly approved, ` +
    `${submissionReview.held} held, ${submissionReview.rejected} rejected.`
);

function ensureHiddenFeedSource() {
  const configuredUrl = process.env.NEWSROOM_PULL_URL || process.env.OPENCLAW_NEWSROOM_URL || "";
  const configuredToken = process.env.NEWSROOM_PULL_TOKEN || process.env.OPENCLAW_NEWSROOM_TOKEN || "";
  const configuredFile = process.env.NEWSROOM_PULL_FILE || process.env.OPENCLAW_NEWSROOM_FILE || "";

  if (configuredUrl) {
    return {
      type: "url",
      generated: false,
      refreshSource: {
        url: configuredUrl,
        token: configuredToken
      },
      output: "Using configured external OpenClaw newsroom URL.",
      warnings: ""
    };
  }

  if (configuredFile) {
    return {
      type: "file",
      generated: false,
      refreshSource: {
        file: configuredFile
      },
      output: `Using configured hidden feed file ${path.resolve(rootDir, configuredFile)}.`,
      warnings: ""
    };
  }

  const scriptPath = path.resolve(rootDir, "scripts/openclaw-newsroom-feed.mjs");
  const hiddenFeedPath = config.hiddenFeedPath;
  const result = spawnSync(process.execPath, [scriptPath, "--output", hiddenFeedPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      OPENCLAW_NEWSROOM_FILE: hiddenFeedPath,
      NEWSROOM_PULL_FILE: hiddenFeedPath
    },
    encoding: "utf8"
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "The OpenClaw hidden feed cycle failed.");
  }

  return {
    type: "file",
    generated: true,
    refreshSource: {
      file: hiddenFeedPath
    },
    output: compactText(result.stdout),
    warnings: compactText(result.stderr)
  };
}

function runRefreshCycle(refreshSource = null) {
  const scriptPath = path.resolve(rootDir, "scripts/newsroom-refresh.mjs");
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(refreshSource?.url ? { NEWSROOM_PULL_URL: refreshSource.url } : {}),
      ...(refreshSource?.token ? { NEWSROOM_PULL_TOKEN: refreshSource.token } : {}),
      ...(refreshSource?.file ? { NEWSROOM_PULL_FILE: refreshSource.file } : {})
    },
    encoding: "utf8"
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "The newsroom refresh cycle failed.");
  }

  return {
    ok: true,
    exitCode: result.status || 0,
    mode: refreshSource?.url || refreshSource?.file ? "external-feed" : "curated-rss",
    output: compactText(result.stdout),
    warnings: compactText(result.stderr)
  };
}

function buildManagerSnapshot({ startedAt, finishedAt, feedSource, refresh, submissionReview, contentPath, platformStatePath }) {
  const payload = readJson(contentPath);
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];

  return {
    manager: {
      id: "openclaw",
      name: config.managerName,
      mode: "autonomous",
      startedAt,
      finishedAt
    },
    newsroom: {
      contentPath: path.resolve(rootDir, contentPath),
      totalArticles: articles.length,
      hiddenFeed: {
        type: feedSource.type,
        generated: feedSource.generated,
        output: feedSource.output,
        warnings: feedSource.warnings,
        path: feedSource.refreshSource?.file ? path.resolve(rootDir, feedSource.refreshSource.file) : "",
        url: feedSource.refreshSource?.url || ""
      },
      refresh
    },
    platform: {
      statePath: path.resolve(rootDir, platformStatePath),
      submissionReview
    }
  };
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function writeJson(targetPath, value) {
  const resolvedPath = path.resolve(rootDir, targetPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(rootDir, targetPath), "utf8"));
  } catch {
    return {};
  }
}

function loadEnvFile(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .reduce((env, line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
        env[key] = value;
        return env;
      }, {});
  } catch {
    return {};
  }
}
