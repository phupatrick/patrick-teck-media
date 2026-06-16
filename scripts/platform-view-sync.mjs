import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = process.cwd();
const envFromFile = loadEnvFile(path.join(rootDir, ".env"));

const config = {
  siteUrl: process.env.SITE_URL || envFromFile.SITE_URL || "https://patricktechmedia.com",
  platformStatePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
  limit: clampInteger(process.env.PLATFORM_VIEW_SYNC_LIMIT || envFromFile.PLATFORM_VIEW_SYNC_LIMIT, 1, 500, 200)
};

export async function runPlatformViewSync(options = {}) {
  const siteUrl = String(options.siteUrl || config.siteUrl || "").replace(/\/+$/, "");
  const platformStatePath = options.platformStatePath || config.platformStatePath;
  const limit = clampInteger(options.limit || config.limit, 1, 500, 200);

  if (!siteUrl) {
    return { ok: true, skipped: true, imported: 0, reason: "SITE_URL is missing." };
  }

  const snapshots = await fetchViewSnapshots(siteUrl, limit);

  if (!snapshots.length) {
    return { ok: true, skipped: true, imported: 0, reason: "No production view snapshot was available." };
  }

  const resolvedPath = path.resolve(rootDir, platformStatePath);
  const currentState = readJson(resolvedPath, createDefaultPlatformState());
  const nextState = mergeArticleViewSnapshots(currentState, snapshots);

  writeJson(resolvedPath, nextState);

  return {
    ok: true,
    skipped: false,
    imported: snapshots.length,
    articleViews: nextState.articleViews.length,
    path: resolvedPath
  };
}

export function mergeArticleViewSnapshots(state, snapshots) {
  const nextState = {
    ...createDefaultPlatformState(),
    ...(state && typeof state === "object" ? state : {})
  };
  const currentViews = Array.isArray(nextState.articleViews) ? nextState.articleViews : [];
  const byKey = new Map();

  for (const entry of currentViews) {
    const normalized = normalizeViewEntry(entry);
    const key = makeViewKey(normalized);

    if (key) {
      byKey.set(key, normalized);
    }
  }

  for (const snapshot of snapshots) {
    const incoming = normalizeViewEntry(snapshot);
    const key = makeViewKey(incoming);

    if (!key || incoming.views <= 0) {
      continue;
    }

    byKey.set(key, mergeViewEntry(byKey.get(key), incoming));
  }

  nextState.articleViews = [...byKey.values()]
    .sort((left, right) => Date.parse(right.last_viewed_at || 0) - Date.parse(left.last_viewed_at || 0))
    .slice(0, 1000);

  return nextState;
}

async function fetchViewSnapshots(siteUrl, limit) {
  const results = [];

  for (const lang of ["vi", "en"]) {
    try {
      const url = `${siteUrl}/api/newsroom/views?lang=${lang}&limit=${limit}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "patrick-tech-media-view-sync/1.0"
        }
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const articles = Array.isArray(payload?.articles) ? payload.articles : [];
      results.push(...articles);
    } catch {
      // View sync is opportunistic; publishing should not fail if production is cold.
    }
  }

  return results;
}

function mergeViewEntry(existing = {}, incoming = {}) {
  const daily = mergeDailyViews(existing.daily, incoming.daily);
  const firstViewedAt = earliestDate(existing.first_viewed_at, incoming.first_viewed_at);
  const lastViewedAt = latestDate(existing.last_viewed_at, incoming.last_viewed_at);

  return {
    article_id: incoming.article_id || existing.article_id || "",
    article_href: incoming.article_href || existing.article_href || "",
    title: incoming.title || existing.title || "",
    language: incoming.language === "en" ? "en" : existing.language === "en" ? "en" : "vi",
    topic: incoming.topic || existing.topic || "",
    content_type: incoming.content_type || existing.content_type || "",
    source_type: incoming.source_type || existing.source_type || "",
    views: Math.max(clampInteger(existing.views, 0, 1_000_000_000, 0), clampInteger(incoming.views, 0, 1_000_000_000, 0)),
    unique_views: Math.max(
      clampInteger(existing.unique_views, 0, 1_000_000_000, 0),
      clampInteger(incoming.unique_views, 0, 1_000_000_000, 0)
    ),
    first_viewed_at: firstViewedAt,
    last_viewed_at: lastViewedAt,
    daily
  };
}

function mergeDailyViews(existingDaily = [], incomingDaily = []) {
  const byDate = new Map();

  for (const item of [...(Array.isArray(existingDaily) ? existingDaily : []), ...(Array.isArray(incomingDaily) ? incomingDaily : [])]) {
    const date = safeTrim(item?.date).slice(0, 10);

    if (!date) {
      continue;
    }

    const previous = byDate.get(date) || { date, views: 0, unique_views: 0 };
    byDate.set(date, {
      date,
      views: Math.max(previous.views, clampInteger(item?.views, 0, 1_000_000_000, 0)),
      unique_views: Math.max(previous.unique_views, clampInteger(item?.unique_views, 0, 1_000_000_000, 0))
    });
  }

  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 45);
}

function normalizeViewEntry(entry = {}) {
  return {
    article_id: safeTrim(entry.article_id),
    article_href: safeTrim(entry.article_href),
    title: safeTrim(entry.title),
    language: entry.language === "en" ? "en" : "vi",
    topic: safeTrim(entry.topic),
    content_type: safeTrim(entry.content_type),
    source_type: safeTrim(entry.source_type),
    views: clampInteger(entry.views, 0, 1_000_000_000, 0),
    unique_views: clampInteger(entry.unique_views, 0, 1_000_000_000, 0),
    first_viewed_at: safeTrim(entry.first_viewed_at),
    last_viewed_at: safeTrim(entry.last_viewed_at),
    daily: Array.isArray(entry.daily) ? entry.daily : []
  };
}

function makeViewKey(entry) {
  return entry.article_id || entry.article_href || "";
}

function createDefaultPlatformState() {
  return {
    users: [],
    submissions: [],
    withdrawals: [],
    articleComments: [],
    articleReactions: [],
    articleViews: []
  };
}

function earliestDate(left, right) {
  const dates = [left, right].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates[0] || "";
}

function latestDate(left, right) {
  const dates = [left, right].filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a));
  return dates[0] || "";
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeTrim(value) {
  return String(value || "").trim();
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(number)));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runPlatformViewSync();
  console.log(
    result.skipped
      ? `Platform view sync skipped: ${result.reason}`
      : `Platform view sync imported ${result.imported} view row(s) into ${result.path}.`
  );
}
