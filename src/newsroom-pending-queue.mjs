import fs from "node:fs";
import path from "node:path";

export const PENDING_TTL_MS = 60 * 60 * 1000;

export function readPendingQueue(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
    return Array.isArray(payload?.items) ? payload.items.filter((item) => item?.article) : [];
  } catch {
    return [];
  }
}

export function writePendingQueue(filePath, items, now = new Date().toISOString()) {
  const target = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ generated_at: now, items }, null, 2) + "\n", "utf8");
}

export function preparePendingArticles(items, now = new Date().toISOString()) {
  const nowMs = Date.parse(now);
  return (Array.isArray(items) ? items : []).map((item) => {
    const parsedFirstSeenAt = Date.parse(item.first_seen_at);
    const firstSeenAt = Number.isFinite(parsedFirstSeenAt) ? item.first_seen_at : now;
    const ageMs = Math.max(0, nowMs - Date.parse(firstSeenAt));
    const expired = ageMs >= PENDING_TTL_MS;
    return {
      ...item,
      first_seen_at: firstSeenAt,
      retry_count: Math.max(0, Number(item.retry_count || 0)),
      last_retry_at: String(item.last_retry_at || ""),
      ttl_ms: Math.max(1, Number(item.ttl_ms || PENDING_TTL_MS)),
      age_ms: ageMs,
      expired,
      allowed_single_source: canPublishSingleSource(item.article, expired)
    };
  });
}

export function markPendingTranslationFailure(item, now = new Date().toISOString()) {
  return { ...item, retry_count: Math.max(0, Number(item?.retry_count || 0)) + 1, last_retry_at: now, ttl_ms: Math.max(1, Number(item?.ttl_ms || PENDING_TTL_MS)) };
}

export function getPendingArticleKey(article) {
  const primarySource = (article?.source_set || [])
    .map((source) => String(source?.source_url || "").trim().toLowerCase().replace(/#.*$/, ""))
    .find(Boolean);
  return String(article?.id || article?.slug || primarySource || "").trim();
}

export function isSingleSourceArticle(article) {
  return (article?.source_set || []).filter((source) => source?.source_url).length < 2;
}

export function hasTrustedSource(article) {
  return (article?.source_set || []).some((source) =>
    source?.source_type === "official-site"
    || (source?.source_type === "press" && ["official", "established-media"].includes(source?.trust_tier))
  );
}

export function getSourceQualityTier(article) {
  const sources = Array.isArray(article?.source_set) ? article.source_set : [];
  if (sources.some((source) => source?.source_type === "official-site" || (source?.source_type === "official-social" && source?.trust_tier === "official"))) return 1;
  if (sources.some((source) => source?.source_type === "press" && ["official", "established-media"].includes(source?.trust_tier))) return 2;
  return 3;
}

export function canPublishSingleSource(article, expired = false) {
  const tier = getSourceQualityTier(article);
  return tier === 1 || (tier === 2 && expired);
}

export function applySingleSourcePublicationPolicy(article, expired = false) {
  if (!isSingleSourceArticle(article) || !canPublishSingleSource(article, expired)) return article;
  const tier = getSourceQualityTier(article);
  return { ...article, single_source_exception: true, is_single_source: true, show_editorial_label: true, editorial_label: tier === 1 ? "Xác thực chính thức" : "Tin nhanh xác thực" };
}
