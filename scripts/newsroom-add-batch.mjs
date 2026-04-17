import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isArticlePublishReady, normalizeText } from "../src/newsroom-quality.mjs";
import { normalizeArticles, publishArticles, readJson } from "./newsroom-publish.mjs";

function getArg(args, flag, fallback = "") {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function isDirectExecution() {
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
}

function isImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function looksLikeImageAsset(value) {
  if (!isImageUrl(value)) return false;
  const trimmed = value.trim();
  if (trimmed.includes("/media/story/")) return false;
  return /\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?.*)?$/i.test(trimmed);
}

function pickBestImageUrl(article) {
  const candidates = [];

  if (article?.image) {
    candidates.push(article.image.src, article.image.url, article.image.image_url, article.image.image);
  }

  if (Array.isArray(article?.source_set)) {
    for (const source of article.source_set) {
      candidates.push(source?.image_url, source?.image, source?.src, source?.url);
    }
  }

  const direct = candidates.find(looksLikeImageAsset);
  if (direct) return direct;

  // Some official feeds publish stable image URLs without extensions; allow a few trusted hosts.
  const soft = candidates.find((value) => {
    if (!isImageUrl(value)) return false;
    const trimmed = value.trim();
    if (trimmed.includes("/media/story/")) return false;
    return /(?:blogger\.googleusercontent\.com|storage\.googleapis\.com|cdn\.arstechnica\.net|static\.techcrunch\.com)/i.test(trimmed);
  });

  return soft || "";
}

function articleKey(article) {
  return article.id || article.href || `${article.language}:${article.content_type}:${article.slug}`;
}

function normalizeTitleSignature(title) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "is",
    "are",
    "what",
    "why",
    "how",
    "when",
    "this",
    "that",
    "these",
    "those",
    "va",
    "và",
    "la",
    "là",
    "cua",
    "của",
    "cho",
    "voi",
    "với",
    "nhung",
    "những",
    "mot",
    "một",
    "cac",
    "các",
    "de",
    "để",
    "tu",
    "từ"
  ]);

  const cleaned = normalizeText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .filter(Boolean)
    .filter((token) => token.length > 1 && !stop.has(token))
    .slice(0, 14);

  return tokens.join(" ");
}

function scoreCandidate(article, now) {
  const topic = String(article?.topic || "").trim();
  const trust = String(article?.source_set?.[0]?.trust_tier || "").trim();
  const sourceTypes = new Set((article?.source_set || []).map((s) => String(s?.source_type || "").trim()).filter(Boolean));
  const contentType = String(article?.content_type || "").trim();

  let score = 0;

  if (topic === "ai") score += 38;
  else if (topic === "devices") score += 20;
  else if (topic === "apps-software") score += 18;
  else if (topic === "internet-business-tech") score += 14;
  else if (topic === "security") score += 12;
  else if (topic === "gaming") score += 8;

  if (contentType === "ComparisonPage") score += 16;
  if (contentType === "EvergreenGuide") score += 12;
  if (contentType === "Roundup") score += 8;

  if (trust === "official") score += 14;
  if (trust === "established-media") score += 10;

  if (sourceTypes.has("official-site")) score += 10;
  if (sourceTypes.size >= 2) score += 6;
  if ((article?.source_set || []).length >= 3) score += 4;

  const publishedAt = new Date(article?.published_at || article?.updated_at || 0).getTime();
  if (Number.isFinite(publishedAt) && publishedAt > 0) {
    const ageHours = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));
    score += Math.max(0, 18 - Math.min(18, ageHours / 12));
  }

  if (pickBestImageUrl(article)) score += 10;
  return score;
}

function buildTargets(count) {
  if (count <= 8) {
    return { ai: Math.min(5, count), devices: 2, "apps-software": 1 };
  }

  // Default: AI-heavy but still diverse.
  return {
    ai: Math.min(12, Math.floor(count * 0.6)),
    devices: Math.max(3, Math.floor(count * 0.2)),
    "apps-software": Math.max(2, Math.floor(count * 0.12)),
    "internet-business-tech": Math.max(1, Math.floor(count * 0.08)),
    security: 1,
    gaming: 1
  };
}

function selectBatch(candidates, existingArticles, count, nowIso) {
  const now = new Date(nowIso).getTime();
  const existingKeys = new Set(existingArticles.map(articleKey));
  const existingSlugs = new Set(existingArticles.map((a) => `${a.language}:${a.slug}`));
  const existingTitleSigs = new Set(existingArticles.map((a) => `${a.language}:${normalizeTitleSignature(a.title)}`));

  const filtered = candidates
    .filter(isArticlePublishReady)
    .filter((article) => !existingKeys.has(articleKey(article)))
    .filter((article) => !existingSlugs.has(`${article.language}:${article.slug}`))
    .filter((article) => {
      const sig = normalizeTitleSignature(article.title);
      if (!sig) return true;
      return !existingTitleSigs.has(`${article.language}:${sig}`);
    })
    .filter((article) => Boolean(pickBestImageUrl(article)));

  const scored = filtered
    .map((article) => ({
      article,
      score: scoreCandidate(article, now)
    }))
    .sort((a, b) => b.score - a.score);

  const targets = buildTargets(count);
  const picked = [];
  const topicCounts = new Map();
  const langCounts = new Map();

  const minVi = Math.min(6, Math.max(0, scored.filter((c) => c.article.language === "vi").length));

  for (const { article } of scored) {
    if (picked.length >= count) break;

    const topic = String(article.topic || "").trim() || "unknown";
    const lang = String(article.language || "").trim() || "unknown";
    const topicLimit = targets[topic];
    const currentTopicCount = topicCounts.get(topic) || 0;
    const currentLangCount = langCounts.get(lang) || 0;

    // Ensure minimum Vietnamese presence early.
    if (picked.length < minVi && lang !== "vi") {
      continue;
    }

    // Soft-topic caps to avoid a wall of one topic.
    if (typeof topicLimit === "number" && currentTopicCount >= topicLimit) {
      continue;
    }

    // Avoid overloading English-only in case the page is mostly VI.
    if (lang === "en" && currentLangCount >= Math.max(12, Math.floor(count * 0.7))) {
      continue;
    }

    picked.push(article);
    topicCounts.set(topic, currentTopicCount + 1);
    langCounts.set(lang, currentLangCount + 1);
  }

  // Fill remaining slots ignoring targets (still avoiding duplicates), keeping recency/score order.
  if (picked.length < count) {
    const pickedKeys = new Set(picked.map(articleKey));
    for (const { article } of scored) {
      if (picked.length >= count) break;
      const key = articleKey(article);
      if (pickedKeys.has(key)) continue;
      picked.push(article);
      pickedKeys.add(key);
    }
  }

  return picked.slice(0, count);
}

export async function addBatch({
  inputPath,
  outputPath = "data/newsroom-content.json",
  count = 20,
  now = new Date().toISOString()
}) {
  const sourcePayload = readJson(path.resolve(process.cwd(), inputPath));
  const incomingArticles = normalizeArticles(sourcePayload);

  const existingPayload = readJson(path.resolve(process.cwd(), outputPath));
  const existingArticles = normalizeArticles(existingPayload);

  const batch = selectBatch(incomingArticles, existingArticles, count, now);

  if (!batch.length) {
    return { changed: false, outputPath, publishedCount: 0, totalArticles: existingArticles.length, selected: 0 };
  }

  const result = await publishArticles({
    incomingArticles: batch,
    outputPath,
    replaceMode: false,
    now,
    databaseUrl: process.env.DATABASE_URL || ""
  });

  return { ...result, selected: batch.length };
}

if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const inputPath = getArg(args, "--input", "");
  const outputPath = getArg(args, "--output", "data/newsroom-content.json");
  const count = Number.parseInt(getArg(args, "--count", "20"), 10);

  if (!inputPath) {
    console.error("Missing --input <path-to-json>");
    process.exit(1);
  }

  addBatch({
    inputPath,
    outputPath,
    count: Number.isFinite(count) && count > 0 ? count : 20
  })
    .then((result) => {
      if (!result.changed) {
        console.log(`No new publish-ready stories found to add from ${inputPath}.`);
        process.exit(0);
      }
      console.log(`Added ${result.selected} story/stories into ${result.outputPath} (${result.totalArticles} total).`);
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || error);
      process.exit(1);
    });
}

