import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { TwitterApi } from "twitter-api-v2";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pendingPath = resolve(ROOT, "data/openclaw-pending-clusters.json");
const historyPath = resolve(ROOT, "data/posted-history.json");
const siteUrl = (process.env.SITE_URL || "https://patricktechmedia.com").replace(/\/$/, "");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function getArticles(payload) {
  if (Array.isArray(payload)) return payload.map((item) => item?.article || item).filter(Boolean);
  if (Array.isArray(payload?.items)) return payload.items.map((item) => item?.article || item).filter(Boolean);
  if (Array.isArray(payload?.articles)) return payload.articles;
  return [];
}

function articleId(article) {
  return String(article?.id || article?.cluster_id || article?.slug || "").trim();
}

function articleUrl(article) {
  if (article?.href && /^https?:\/\//i.test(article.href)) return article.href;
  return `${siteUrl}/news/${encodeURIComponent(article?.slug || articleId(article))}`;
}

function articleContext(article) {
  const sections = Array.isArray(article?.sections) ? article.sections.slice(0, 3).map((section) => section?.body || section?.heading).filter(Boolean) : [];
  const source = article?.source_set?.[0]?.source_name || "";
  return [article?.title, article?.summary || article?.dek || article?.hook, ...sections, source].filter(Boolean).join("\n");
}

function cleanTweet(text, url) {
  const normalized = String(text || "").replace(/^```(?:text)?\s*|\s*```$/gi, "").replace(/\s+/g, " ").trim();
  const hashtags = "#AI #TechNews #PatrickTech";
  const body = normalized.replaceAll(url, "").replace(/#AI\s+#TechNews\s+#PatrickTech/gi, "").trim();
  const suffix = `${url} ${hashtags}`;
  const available = Math.max(0, 270 - suffix.length - 1);
  return `${body.slice(0, available).trimEnd()} ${suffix}`.trim();
}

async function generateTweet(article) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const url = articleUrl(article);
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 180,
    messages: [
      {
        role: "system",
        content: "You write concise English X posts for Patrick Tech Co. Use a professional, fast tech voice for developers and technology readers. Return only one post, no quotes or commentary. Include an engaging one-sentence hook, then 2-3 compact bullet-like highlights separated by •, the supplied URL, and exactly these hashtags: #AI #TechNews #PatrickTech. Keep the entire post at or below 250 characters before the URL is appended."
      },
      { role: "user", content: `Article:\n${articleContext(article)}\nURL: ${url}` }
    ]
  });
  return cleanTweet(response.choices?.[0]?.message?.content, url);
}

async function main() {
  const pending = getArticles(await readJson(pendingPath, []));
  const history = await readJson(historyPath, []);
  const postedIds = new Set((Array.isArray(history) ? history : []).map((entry) => String(entry?.articleId || entry?.id || entry).trim()));
  const candidates = pending.filter((article) => {
    const id = articleId(article);
    return id && !postedIds.has(id);
  }).sort((a, b) => new Date(b?.published_at || b?.updated_at || 0) - new Date(a?.published_at || a?.updated_at || 0)).slice(0, 2);

  if (!candidates.length) {
    console.log("No new articles to post.");
    return;
  }
  for (const name of ["OPENAI_API_KEY", "X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"]) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  const client = new TwitterApi({ appKey: process.env.X_API_KEY, appSecret: process.env.X_API_SECRET, accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_SECRET });
  const updatedHistory = Array.isArray(history) ? history : [];
  for (const article of candidates) {
    const tweetText = await generateTweet(article);
    const result = await client.v2.tweet(tweetText);
    const tweetId = String(result?.data?.id || "");
    if (!tweetId) throw new Error("X API returned no tweet ID.");
    const id = articleId(article);
    updatedHistory.push({ articleId: id, tweetId, postedAt: new Date().toISOString(), url: articleUrl(article), text: tweetText });
    await mkdir(dirname(historyPath), { recursive: true });
    await writeFile(historyPath, `${JSON.stringify(updatedHistory, null, 2)}\n`, "utf8");
    console.log(`Tweet ID: ${tweetId}`);
    console.log(`Content: ${tweetText}`);
    console.log(`URL: https://x.com/PatrickTechCo/status/${tweetId}`);
  }
}

main().catch((error) => {
  console.error("Auto-poster failed:", error.message);
  process.exitCode = 1;
});
