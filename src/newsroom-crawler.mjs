import https from "node:https";
import { createDocumentStore } from "./document-store.mjs";

export async function fetchFeedConditionally(feedUrl, { store, timeoutMs = 15_000 } = {}) {
  const cacheKey = `newsroom:cache:${Buffer.from(String(feedUrl)).toString("base64").slice(0, 32)}`;
  const cacheStore = store || createCacheStore(cacheKey);
  const cachedMeta = (await cacheStore.read()) || {};
  const headers = { "User-Agent": "PatrickTechNewsBot/2.0" };
  if (cachedMeta.etag) headers["If-None-Match"] = cachedMeta.etag;
  if (cachedMeta.lastModified) headers["If-Modified-Since"] = cachedMeta.lastModified;

  return new Promise((resolve, reject) => {
    const request = https.get(String(feedUrl), { headers, timeout: timeoutMs }, (response) => {
      if (response.statusCode === 304) {
        response.resume();
        return resolve({ notModified: true, rawXml: null });
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        return reject(new Error(`HTTP_STATUS_${response.statusCode}`));
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", async () => {
        try {
          await cacheStore.write({
            etag: response.headers.etag || null,
            lastModified: response.headers["last-modified"] || null,
            updated_at: new Date().toISOString()
          });
          resolve({ notModified: false, rawXml: body });
        } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => { request.destroy(); reject(new Error("REQUEST_TIMEOUT_15S")); });
  });
}

export function isDuplicateArticle(article, existingArticles) {
  const cleanUrl = normalizeUrl(article?.link || article?.url);
  const cleanTitle = normalizeTitle(article?.title);
  if (!cleanUrl && !cleanTitle) return false;
  return (Array.isArray(existingArticles) ? existingArticles : []).some((existing) => {
    const existingUrl = normalizeUrl(existing?.link || existing?.url);
    if (cleanUrl && existingUrl && cleanUrl === existingUrl) return true;
    const existingTitle = normalizeTitle(existing?.title);
    if (!cleanTitle || !existingTitle) return false;
    if (cleanTitle === existingTitle) return true;
    const wordsA = new Set(cleanTitle.split(/\s+/));
    const wordsB = new Set(existingTitle.split(/\s+/));
    const intersection = [...wordsA].filter((word) => wordsB.has(word));
    return intersection.length / Math.max(wordsA.size, wordsB.size) > 0.75;
  });
}

function normalizeUrl(value) { return String(value || "").split("?")[0].replace(/\/$/, "").toLowerCase(); }
function normalizeTitle(value) { return String(value || "").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim(); }

function createCacheStore(documentKey) {
  return createDocumentStore({ documentKey, fallbackPath: "data/newsroom-feed-http-cache.json", initialValue: {} });
}
