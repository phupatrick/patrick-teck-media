import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeArticles, readJson } from "./newsroom-publish.mjs";

const rootDir = process.cwd();
const outputPath =
  process.env.OPENCLAW_NEWSROOM_FILE ||
  process.env.NEWSROOM_PULL_FILE ||
  getArg(process.argv.slice(2), "--output") ||
  "data/openclaw-hidden-feed.json";
const resolvedOutputPath = path.resolve(rootDir, outputPath);
const tempSeedPath = path.resolve(
  rootDir,
  "data",
  `.openclaw-hidden-feed-seed-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.json`
);

const refreshEnv = {
  ...process.env,
  NEWSROOM_CONTENT_PATH: tempSeedPath,
  NEWSROOM_PULL_URL: "",
  NEWSROOM_PULL_TOKEN: "",
  NEWSROOM_PULL_FILE: "",
  OPENCLAW_NEWSROOM_URL: "",
  OPENCLAW_NEWSROOM_TOKEN: "",
  OPENCLAW_NEWSROOM_FILE: ""
};

const refreshResult = spawnSync(process.execPath, [path.resolve(rootDir, "scripts/newsroom-refresh.mjs")], {
  cwd: rootDir,
  env: refreshEnv,
  encoding: "utf8"
});

if (refreshResult.stdout) {
  process.stdout.write(refreshResult.stdout);
}

if (refreshResult.stderr) {
  process.stderr.write(refreshResult.stderr);
}

if (refreshResult.status !== 0) {
  throw new Error(refreshResult.stderr || refreshResult.stdout || "Failed to generate the OpenClaw hidden feed.");
}

const seedPayload = readJson(tempSeedPath);
const articles = normalizeArticles(seedPayload).map((article) => ({
  ...article,
  updated_at: article.updated_at || article.published_at || new Date().toISOString(),
  machine_source: "openclaw-hidden-feed",
  hidden_feed: {
    manager: "openclaw",
    generated_at: new Date().toISOString(),
    origin: "local-curated-rss"
  }
}));

fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(
  resolvedOutputPath,
  `${JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      manager: {
        id: "openclaw",
        mode: "hidden-feed",
        source: "local-curated-rss"
      },
      articles
    },
    null,
    2
  )}\n`,
  "utf8"
);

try {
  fs.unlinkSync(tempSeedPath);
} catch {
  // ignore cleanup failures for temp feed seeds
}

console.log(`Generated OpenClaw hidden feed with ${articles.length} article(s) at ${resolvedOutputPath}`);

function getArg(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return args[index + 1] || "";
}
