import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function publishArticles({ incomingArticles, outputPath, replaceMode = false, now = new Date().toISOString() }) {
  if (!Array.isArray(incomingArticles) || incomingArticles.length === 0) {
    throw new Error("No articles found in the input payload.");
  }

  const resolvedOutputPath = path.resolve(process.cwd(), outputPath || "data/newsroom-content.json");
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });

  const existingPayload = replaceMode ? { articles: [] } : readJson(resolvedOutputPath);
  const existingArticles = normalizeArticles(existingPayload).sort(sortByDateDesc);
  const articleMap = new Map(existingArticles.map((article) => [articleKey(article), article]));

  for (const article of incomingArticles.filter(isArticleLike)) {
    const key = articleKey(article);
    const previous = articleMap.get(key) || null;
    const merged = {
      ...previous,
      ...article
    };

    articleMap.set(key, {
      ...merged,
      updated_at: resolveUpdatedAt(previous, article, merged, now)
    });
  }

  const articles = [...articleMap.values()].sort(sortByDateDesc);
  const changed = JSON.stringify(existingArticles) !== JSON.stringify(articles);

  if (!changed && fs.existsSync(resolvedOutputPath)) {
    return {
      changed: false,
      outputPath: resolvedOutputPath,
      publishedCount: incomingArticles.length,
      totalArticles: existingArticles.length
    };
  }

  const outputPayload = {
    generated_at: now,
    articles
  };

  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(outputPayload, null, 2)}\n`, "utf8");

  return {
    changed: true,
    outputPath: resolvedOutputPath,
    publishedCount: incomingArticles.length,
    totalArticles: articles.length
  };
}

export function normalizeArticles(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isArticleLike);
  }

  if (Array.isArray(payload?.articles)) {
    return payload.articles.filter(isArticleLike);
  }

  return [];
}

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function isArticleLike(article) {
  return Boolean(article && typeof article === "object" && article.slug && article.title && article.language && article.content_type);
}

function articleKey(article) {
  return article.id || article.href || `${article.language}:${article.content_type}:${article.slug}`;
}

function sortByDateDesc(left, right) {
  return new Date(right.published_at || right.updated_at || 0).getTime() - new Date(left.published_at || left.updated_at || 0).getTime();
}

function resolveUpdatedAt(previous, incoming, merged, now) {
  if (incoming.updated_at) {
    return incoming.updated_at;
  }

  if (!previous) {
    return merged.published_at || now;
  }

  const previousComparable = JSON.stringify(stripTemporalFields(previous));
  const nextComparable = JSON.stringify(stripTemporalFields(merged));
  return previousComparable === nextComparable ? previous.updated_at || previous.published_at || now : now;
}

function stripTemporalFields(article) {
  if (!article || typeof article !== "object") {
    return article;
  }

  const { generated_at, updated_at, ...rest } = article;
  return rest;
}

function getArg(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return args[index + 1] || "";
}

function isDirectExecution() {
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
}

if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const inputPath = getArg(args, "--input");
  const outputPath = getArg(args, "--output") || "data/newsroom-content.json";
  const replaceMode = args.includes("--replace");

  if (!inputPath) {
    console.error("Missing --input <path-to-json>");
    process.exit(1);
  }

  const sourcePath = path.resolve(process.cwd(), inputPath);
  const incomingPayload = readJson(sourcePath);
  const incomingArticles = normalizeArticles(incomingPayload);

  try {
    const result = publishArticles({ incomingArticles, outputPath, replaceMode });
    const label = result.changed ? "Published" : "No changes found for";
    console.log(`${label} ${result.publishedCount} article(s) into ${result.outputPath}`);
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
