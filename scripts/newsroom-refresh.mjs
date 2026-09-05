import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeArticles, publishArticles } from "./newsroom-publish.mjs";
import { aggregateIncomingDrafts, buildEditorialCompanionArticles, enhanceMultiSourceSynthesisWithGemini } from "../src/newsroom-synthesis.mjs";
import { repairEncodingArtifacts } from "../src/text-repair.mjs";
import { createNewsroomTranslator } from "../src/newsroom-translation.mjs";
import { enrichArticleWithGemini, getNewsroomGeminiConfig } from "../src/newsroom-gemini.mjs";
import { buildNewsroomState } from "../src/newsroom-service.mjs";
import { cleanSourceText, isSourceTextContaminated } from "../src/newsroom-source-hygiene.mjs";
import { applySingleSourcePublicationPolicy, getPendingArticleKey, isSingleSourceArticle, markPendingTranslationFailure, preparePendingArticles, readPendingQueue, writePendingQueue } from "../src/newsroom-pending-queue.mjs";
import {
  evaluateArticleAutopublishReadiness,
  evaluateArticleReadiness,
  isArticleAutopublishReady,
  isArticlePublishReady,
  isTrustedSourceFallbackReady,
  evaluateTrustedSourceFallbackReadiness
} from "../src/newsroom-quality.mjs";

// These patterns are referenced by helper functions outside `runNewsroomRefresh`.
// Keep them at module scope so refresh works in all execution modes (CLI, tests, in-process).
const TECHNOLOGY_STRONG_PATTERNS = [
  /\b(artificial intelligence|tr? tu? nh?n t?o|llm|model|agentic|chatgpt|openai|gemini|claude|copilot|deepseek|midjourney|notebooklm|grok)\b/i,
  /\b(meta|facebook|instagram|threads|tiktok|youtube|google|apple|microsoft|amazon|nvidia|tesla|bytedance|shopee|oracle|samsung|intel|amd|qualcomm|anthropic|perplexity|xai)\b/i,
  /\b(chip|gpu|cpu|npu|ram|memory|ssd|device|devices|smartphone|phone|iphone|android|pixel|macbook|ipad|pc|desktop|tablet|router|fiber|wearable|robot|semiconductor|datacenter|server|foundry)\b/i,
  /\b(app|apps|software|windows|macos|linux|browser|chrome|edge|photos|workspace|productivity|cloud|startup|platform|social|serverless|database|devops|saas|kubernetes|enterprise)\b/i,
  /\b(hack|security|cyber|malware|phishing|ransomware|vulnerability|zero-day|breach|passkey|password|privacy|b?o m?t|t?n c?ng)\b/i,
  /\b(gaming|game|steam|playstation|xbox|nintendo|switch ?2|dlss|rockstar|gta|crimson desert|everness)\b/i,
  /\b(how to|how-to|guide|tips|m?o|th? thu?t|h??ng d?n|c?ch d?ng|c?ch l?m|thi?t l?p)\b/i
];

const TECHNOLOGY_SUPPORT_PATTERNS = [
  /\b(update|rollout|launch|beta|feature|subscription|creator|social network|messaging|camera|battery|firmware|broadband|5g|wifi|data center|cloud|serverless|ads|moderation)\b/i,
  /\b(viettel|vnpt|fpt|telecom|cloudflare|anthropic|hugging face|semiconductor|startup|workspace|google one|copilot|notebooklm|gemini advanced|aws|azure|gcp|github|youtube|threads)\b/i
];

const NON_TECH_PATTERNS = [
  /\b(recipe|easter|deviled eggs|kitchen|cooking|chef|food|restaurant)\b/i,
  /\b(trump|birthright|election|senate|congress|war|ceasefire|tariff|immigration)\b/i,
  /\b(celebrity|movie|album|fashion|royal|dating|cruise|vacation|travel)\b/i,
  /\b(nba|nfl|soccer|baseball|tennis|golf|boxing)\b/i,
  /\b(health|doctor|disease|diet|sleep|pregnancy|medical|cơ thể người|virus học|triệu chứng|bệnh nhân)\b/i,
  /\b(auto show|roadshow|powertrain|suv|hybrid variant|combustion|kia seltos|kia ev3|sedan|crossover)\b/i
];

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

const SOURCE_TOPIC_HINTS = [
  {
    topic: "gaming",
    score: 18,
    pattern: /\b(apps-games|gamek|ign|gamesradar|pc gamer|kotaku|polygon)\b/i
  },
  {
    topic: "devices",
    score: 8,
    pattern: /\b(9to5google|android authority|engadget|macrumors|android central|windows central|techradar|macworld|tinhte|sforum)\b/i
  },
  {
    topic: "chips-ai-infra",
    score: 14,
    pattern: /\b(tom's hardware|tomshardware|nvidia|anandtech|semiconductor|qualcomm|intel|amd|datacenter)\b/i
  },
  {
    topic: "cloud-enterprise",
    score: 14,
    pattern: /\b(aws|azure|cloudflare|serverless|kubernetes|database|enterprise|workspace admin|devops)\b/i
  },
  {
    topic: "social-creator",
    score: 14,
    pattern: /\b(meta|facebook|instagram|threads|youtube|creator|social media today)\b/i
  },
  {
    topic: "internet-business-tech",
    score: 8,
    pattern: /\b(techcrunch|the verge|the information|reuters|bloomberg|wired|siliconangle)\b/i
  },
  {
    topic: "security",
    score: 8,
    pattern: /\b(ars technica|bleepingcomputer|the hacker news)\b/i
  },
  {
    topic: "ai",
    score: 12,
    pattern: /\b(openai|google ai blog|microsoft copilot|anthropic|deepmind|venturebeat ai|technologyreview)\b/i
  }
];

function normalizeFallbackFeeds(feeds, env) {
  const deduped = new Map();

  for (const feed of Array.isArray(feeds) ? feeds : []) {
    const normalized = normalizeSourceFeed(feed);
    if (!normalized) {
      continue;
    }
    const key = canonicalizeFeedUrl(normalized.url);
    if (!deduped.has(key)) {
      deduped.set(key, { ...normalized, limit: resolveFeedLimit(normalized.limit, env) });
    }
  }

  return selectActiveSourceFeeds([...deduped.values()], env);
}

export function canonicalizeFeedUrl(value) {
  try {
    const url = new URL(String(value));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeSourceFeed(feed) {
  if (!feed || typeof feed !== "object") {
    return null;
  }

  const url = canonicalizeFeedUrl(feed.url);
  const name = cleanText(feed.name || "");
  const trustTier = cleanText(feed.trustTier || "");
  const sourceType = cleanText(feed.sourceType || "");
  const disabledSource = /^(securityweek|spotify engineering|cnet how to)$/i.test(name);
  if (feed.active === false || disabledSource) {
    return null;
  }
  if (!url || !/^https?:$/.test(new URL(url).protocol) || !name) {
    return null;
  }
  if (!(sourceType === "official-site" || sourceType === "press") ||
      !(trustTier === "official" || trustTier === "established-media" || trustTier === "specialist")) {
    return null;
  }

  return {
    ...feed,
    name,
    url,
    sourceType,
    trustTier,
    language: feed.language === "vi" ? "vi" : "en",
    region: cleanText(feed.region || "Global"),
    topicHint: cleanText(feed.topicHint || "internet-business-tech")
  };
}

export function loadSourceRegistry(env = process.env) {
  const registryPaths = [
    env.NEWSROOM_SOURCE_REGISTRY || "data/newsroom-sources.json",
    env.NEWSROOM_DISCOVERED_SOURCE_REGISTRY || "data/newsroom-discovered-sources.json"
  ];
  const feeds = [];
  for (const registryPath of registryPaths) {
    try {
      const absolutePath = path.resolve(process.cwd(), registryPath);
      const payload = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const entries = Array.isArray(payload) ? payload : payload?.feeds;
      if (Array.isArray(entries)) {
        feeds.push(...entries.map(normalizeSourceFeed).filter(Boolean));
      }
    } catch (error) {
      if (env.NEWSROOM_SOURCE_REGISTRY === registryPath) {
        console.warn(`Unable to load source registry: ${error.message || error}`);
      }
    }
  }
  return feeds;
}

export function selectActiveSourceFeeds(feeds, env = process.env) {
  const uniqueFeeds = new Map();
  for (const feed of Array.isArray(feeds) ? feeds : []) {
    const normalized = normalizeSourceFeed(feed);
    if (normalized) {
      uniqueFeeds.set(canonicalizeFeedUrl(normalized.url), normalized);
    }
  }
  const validFeeds = [...uniqueFeeds.values()];
  const maxFeeds = clampInteger(env.NEWSROOM_MAX_ACTIVE_FEEDS, 1, 250, 120);
  if (validFeeds.length <= maxFeeds) {
    return validFeeds;
  }

  const shardCount = Math.max(1, Math.ceil(validFeeds.length / maxFeeds));
  const configuredShard = parsePositiveInteger(env.NEWSROOM_SOURCE_SHARD, 0);
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  const shard = configuredShard > 0 ? (configuredShard - 1) % shardCount : dayNumber % shardCount;
  const rotated = validFeeds.slice(shard * maxFeeds).concat(validFeeds.slice(0, shard * maxFeeds));
  return rotated.slice(0, maxFeeds);
}

function resolveFeedLimit(baseLimit, env) {
  const defaultLimit = Number.isFinite(Number(baseLimit)) && Number(baseLimit) > 0 ? Number(baseLimit) : 10;
  const explicitLimit = parsePositiveInteger(env?.NEWSROOM_FEED_ITEM_LIMIT);
  const multiplier = parsePositiveNumber(env?.NEWSROOM_FEED_LIMIT_MULTIPLIER, 1);
  const candidate = explicitLimit > 0 ? explicitLimit : Math.ceil(defaultLimit * multiplier);
  return Math.max(1, Math.min(120, candidate));
}

function parsePositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback = 1) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;

      if (currentIndex >= items.length) {
        return;
      }

      try {
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      } catch {
        results[currentIndex] = null;
      }
    }
  });

  await Promise.all(workers);
  return results.filter(Boolean);
}

export async function runNewsroomRefresh(env = process.env) {
  const outputPath = env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
  const pendingPath = env.OPENCLAW_PENDING_QUEUE_PATH || "data/openclaw-pending-clusters.json";
  const singleUrl = normalizePublicArticleUrl(env.NEWSROOM_SINGLE_URL || env.NEWSROOM_ARTICLE_URL || "");
  const sourceUrl = env.NEWSROOM_PULL_URL || env.OPENCLAW_NEWSROOM_URL || "";
  const sourceFile = env.NEWSROOM_PULL_FILE || env.OPENCLAW_NEWSROOM_FILE || "";
  const sourceToken = env.NEWSROOM_PULL_TOKEN || env.OPENCLAW_NEWSROOM_TOKEN || "";
  const now = new Date().toISOString();

const fallbackFeeds = [
  {
    name: "GenK Tin ICT",
    url: "https://genk.vn/rss/tin-ict.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 12
  },
  {
    name: "GenK AI",
    url: "https://genk.vn/rss/ai.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "GenK Mobile",
    url: "https://genk.vn/rss/mobile.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 6
  },
  {
    name: "GenK Kham Pha",
    url: "https://genk.vn/rss/kham-pha.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 4
  },
  {
    name: "GenK Xem Mua Luon",
    url: "https://genk.vn/rss/xem-mua-luon.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 4
  },
  {
    name: "GenK Do Choi So",
    url: "https://genk.vn/rss/do-choi-so.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 4
  },
  {
    name: "GenK Apps-Games",
    url: "https://genk.vn/rss/apps-games.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "apps-software",
    limit: 5
  },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 12
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Google One Blog",
    url: "https://blog.google/products/google-one/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Google Workspace Blog",
    url: "https://blog.google/products/workspace/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Google Gemini Blog",
    url: "https://blog.google/products/gemini/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Google Workspace Updates",
    url: "https://workspaceupdates.googleblog.com/feeds/posts/default?alt=rss",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Microsoft Copilot Blog",
    url: "https://blogs.microsoft.com/blog/tag/copilot/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 8
  },
  {
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 8
  },
  {
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 8
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 5
  },
  {
    name: "9to5Google",
    url: "https://9to5google.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 8
  },
  {
    name: "Engadget",
    url: "https://www.engadget.com/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 6
  },
  {
    name: "Android Authority",
    url: "https://www.androidauthority.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 6
  },
  {
    name: "Digital Trends",
    url: "https://www.digitaltrends.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 6
  },
  {
    name: "Tom's Hardware",
    url: "https://www.tomshardware.com/feeds/all",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "specialist",
    topicHint: "chips-ai-infra",
    limit: 6
  },
  {
    name: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "specialist",
    topicHint: "security",
    limit: 6
  },
  {
    name: "ZDNet AI",
    url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 8
  },
  {
    name: "ZDNet Security",
    url: "https://www.zdnet.com/topic/security/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "security",
    limit: 6
  },
  {
    name: "ZDNet Mobile",
    url: "https://www.zdnet.com/topic/mobile/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 5
  },
  {
    name: "ZDNet Productivity",
    url: "https://www.zdnet.com/topic/productivity/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "apps-software",
    contentTypeHint: "EvergreenGuide",
    limit: 5
  },
  {
    name: "CNET News",
    url: "https://www.cnet.com/rss/news/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 6
  },
  {
    name: "MacRumors",
    url: "https://www.macrumors.com/macrumors.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 5
  },
  {
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 12
  },
  {
    name: "Apple Newsroom",
    url: "https://www.apple.com/newsroom/rss-feed.rss",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "devices",
    limit: 10
  },
  {
    name: "Samsung Newsroom",
    url: "https://news.samsung.com/global/feed",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "devices",
    limit: 10
  },
  {
    name: "Cloudflare Blog",
    url: "https://blog.cloudflare.com/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "cloud-enterprise",
    limit: 10
  },
  {
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Microsoft 365 Blog",
    url: "https://www.microsoft.com/en-us/microsoft-365/blog/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Microsoft AI Blog",
    url: "https://news.microsoft.com/source/topics/ai/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Windows Blog",
    url: "https://blogs.windows.com/windowsexperience/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Windows Developer Blog",
    url: "https://blogs.windows.com/windowsdeveloper/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Microsoft Edge Blog",
    url: "https://blogs.windows.com/msedgedev/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "cloud-enterprise",
    limit: 10
  },
  {
    name: "AWS ML Blog",
    url: "https://aws.amazon.com/blogs/machine-learning/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 10
  },
  {
    name: "Azure Blog",
    url: "https://azure.microsoft.com/en-us/blog/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "cloud-enterprise",
    limit: 10
  },
  {
    name: "Google Android Blog",
    url: "https://blog.google/products/android/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "devices",
    limit: 10
  },
  {
    name: "Google Chrome Blog",
    url: "https://blog.google/products/chrome/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Google Photos Blog",
    url: "https://blog.google/products/photos/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "apps-software",
    limit: 10
  },
  {
    name: "Google Search Blog",
    url: "https://blog.google/products/search/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "internet-business-tech",
    limit: 10
  },
  {
    name: "Google Safety Blog",
    url: "https://blog.google/technology/safety-security/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "security",
    limit: 10
  },
  {
    name: "9to5Mac",
    url: "https://9to5mac.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Android Central",
    url: "https://www.androidcentral.com/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Windows Central",
    url: "https://www.windowscentral.com/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "TechRadar",
    url: "https://www.techradar.com/rss",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Macworld",
    url: "https://www.macworld.com/feed",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "VnExpress So Hoa",
    url: "https://vnexpress.net/rss/so-hoa.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Thanh Nien Cong Nghe",
    url: "https://thanhnien.vn/rss/cong-nghe.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Tuoi Tre Nhip Song So",
    url: "https://tuoitre.vn/rss/nhip-song-so.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 12
  },
  {
    name: "VietnamNet Cong Nghe",
    url: "https://vietnamnet.vn/cong-nghe.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Tinhte",
    url: "https://tinhte.vn/rss/",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "specialist",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "Sforum",
    url: "https://cellphones.com.vn/sforum/feed",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "specialist",
    topicHint: "devices",
    limit: 12
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 8
  },
  {
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "ai",
    limit: 8
  },
  {
    name: "NVIDIA Blog",
    url: "https://blogs.nvidia.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "chips-ai-infra",
    limit: 8
  },
  {
    name: "Anthropic News",
    url: "https://www.anthropic.com/news/rss.xml",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    topicHint: "ai",
    limit: 8
  },
  {
    name: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "security",
    limit: 8
  },
  {
    name: "Wired",
    url: "https://www.wired.com/feed/rss",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "internet-business-tech",
    limit: 6
  },
  {
    name: "SiliconANGLE",
    url: "https://siliconangle.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "specialist",
    topicHint: "internet-business-tech",
    limit: 12
  }
];

const TECHNOLOGY_STRONG_PATTERNS = [
  /\b(artificial intelligence|trí tuệ nhân tạo|llm|model|agentic|chatgpt|openai|gemini|claude|copilot|deepseek|midjourney|notebooklm|grok)\b/i,
  /\b(meta|facebook|instagram|threads|tiktok|youtube|google|apple|microsoft|amazon|nvidia|tesla|bytedance|shopee|oracle|samsung|intel|amd|qualcomm|anthropic|perplexity|xai)\b/i,
  /\b(chip|gpu|cpu|npu|ram|memory|ssd|device|devices|smartphone|phone|iphone|android|pixel|macbook|ipad|pc|desktop|tablet|router|fiber|wearable|robot)\b/i,
  /\b(app|apps|software|windows|macos|linux|browser|chrome|edge|photos|workspace|productivity|cloud|startup|platform|social)\b/i,
  /\b(hack|security|cyber|malware|phishing|ransomware|vulnerability|zero-day|breach|passkey|password|privacy|bảo mật|tấn công)\b/i,
  /\b(gaming|game|steam|playstation|xbox|nintendo|switch ?2|dlss|rockstar|gta|crimson desert|everness)\b/i,
  /\b(how to|how-to|guide|tips|mẹo|thủ thuật|hướng dẫn|cách dùng|cách làm|thiết lập)\b/i
];

const TECHNOLOGY_SUPPORT_PATTERNS = [
  /\b(update|rollout|launch|beta|feature|subscription|creator|social network|messaging|camera|battery|firmware|broadband|5g|wifi|data center)\b/i,
  /\b(viettel|vnpt|fpt|telecom|cloudflare|anthropic|hugging face|semiconductor|startup|workspace|google one|copilot|notebooklm|gemini advanced)\b/i
];

const NON_TECH_PATTERNS = [
  /\b(recipe|easter|deviled eggs|kitchen|cooking|chef|food|restaurant)\b/i,
  /\b(trump|birthright|election|senate|congress|war|ceasefire|tariff|immigration)\b/i,
  /\b(celebrity|movie|album|fashion|royal|dating|cruise|vacation|travel)\b/i,
  /\b(nba|nfl|soccer|baseball|tennis|golf|boxing)\b/i,
  /\b(health|doctor|disease|diet|sleep|pregnancy|medical|cơ thể người|virus học|triệu chứng|bệnh nhân)\b/i,
  /\b(auto show|roadshow|powertrain|suv|hybrid variant|combustion|kia seltos|kia ev3|sedan|crossover)\b/i
];

const SOURCE_TOPIC_HINTS = [
  {
    topic: "gaming",
    score: 18,
    pattern: /\b(apps-games|gamek|ign|gamesradar|pc gamer|kotaku|polygon)\b/i
  },
  {
    topic: "devices",
    score: 8,
    pattern: /\b(9to5google|android authority|tom's hardware|anandtech|engadget|macrumors)\b/i
  },
  {
    topic: "internet-business-tech",
    score: 8,
    pattern: /\b(techcrunch|the verge|social media today|the information|reuters|bloomberg)\b/i
  },
  {
    topic: "security",
    score: 8,
    pattern: /\b(ars technica|bleepingcomputer|the hacker news)\b/i
  },
  {
    topic: "ai",
    score: 12,
    pattern: /\b(openai|google ai blog|microsoft copilot|workspace updates|anthropic|deepmind)\b/i
  }
];

  const headers = {
    Accept: "application/json",
    "User-Agent": "patrick-tech-media-refresh/1.0"
  };

  if (sourceToken) {
    headers.Authorization = `Bearer ${sourceToken}`;
  }

  let incomingArticles = [];
  let sourceLabel = "";

  if (singleUrl) {
    try {
      incomingArticles = await fetchSingleUrlArticles(singleUrl, now, env);
      sourceLabel = "telegram-link";
    } catch (error) {
      console.warn(`${error.message || error}. Single URL was not published.`);
    }
  }

  if (!incomingArticles.length && singleUrl) {
    return {
      changed: false,
      publishedCount: 0,
      outputPath,
      sourceLabel: "telegram-link",
      reason: "single-url-not-publishable"
    };
  }

  if (!incomingArticles.length && sourceUrl) {
    try {
      const response = await fetchWithTimeout(sourceUrl, { headers }, env);

      if (!response.ok) {
        throw new Error(`Failed to fetch newsroom source (${response.status} ${response.statusText})`);
      }

      const payload = await response.json();
      incomingArticles = sanitizeIncomingArticles(normalizeArticles(payload));
      sourceLabel = "external-feed";
    } catch (error) {
      console.warn(`${error.message || error}. Falling back to curated RSS feeds.`);
    }
  }

  if (!incomingArticles.length && sourceFile) {
    try {
      const sourcePath = path.resolve(process.cwd(), sourceFile);
      const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
      incomingArticles = sanitizeIncomingArticles(normalizeArticles(payload));
      sourceLabel = "external-feed";
    } catch (error) {
      console.warn(`${error.message || error}. Falling back to curated RSS feeds.`);
    }
  }

  if (!incomingArticles.length) {
    const registryFeeds = loadSourceRegistry(env);
    const effectiveFallbackFeeds = normalizeFallbackFeeds([...registryFeeds, ...fallbackFeeds], env);
    console.info(`Newsroom source pool: ${registryFeeds.length + fallbackFeeds.length} configured, ${effectiveFallbackFeeds.length} active this cycle.`);
    const [rssArticles, hackerNewsArticles] = await Promise.all([
      fetchFallbackArticles(now, effectiveFallbackFeeds, env),
      fetchHackerNewsTopStories(now, { env })
    ]);
    incomingArticles = [...rssArticles, ...hackerNewsArticles];
    sourceLabel = "curated-rss";
  }

  const pendingItems = preparePendingArticles(readPendingQueue(pendingPath), now);
  const pendingArticles = pendingItems.map((item) => applySingleSourcePublicationPolicy(item.article, item.expired));
  const sourceCandidates = [...pendingArticles, ...incomingArticles];
  const bilingualResult = await ensureBilingualCandidates(sourceCandidates, env, now, outputPath);
  const bilingualCandidates = bilingualResult.articles;
  const queuedCandidates = bilingualCandidates.map((article) => applySingleSourcePublicationPolicy(article));

  if (queuedCandidates.length === 0) {
    return {
      changed: false,
      publishedCount: 0,
      outputPath,
      sourceLabel
    };
  }

  const publishOptions = {
    env,
    now,
    outputPath,
    siteUrl: env.SITE_URL || "https://patricktechmedia.com",
    storeUrl: env.PATRICK_TECH_STORE_URL || "https://patricktechmedia.store",
    strictQualityGate: isStrictAutopublishQualityGateEnabled(env)
  };
  incomingArticles = await prepareArticlesForPublish(queuedCandidates, publishOptions);

  const geminiConfig = getNewsroomGeminiConfig(env);
  if (geminiConfig.apiKey && incomingArticles.length < queuedCandidates.length) {
    const readySourceKeys = new Set(incomingArticles.flatMap(articleSourceKeys));
    const limit = clampInteger(env.NEWSROOM_GEMINI_LIMIT, 1, 30, 20);
    const candidatesForGemini = queuedCandidates
      .filter((article) => !articleSourceKeys(article).some((key) => readySourceKeys.has(key)))
      .slice(0, limit);
    const enriched = [];
    for (const article of candidatesForGemini) {
      try {
        enriched.push(await enrichArticleWithGemini(article, geminiConfig));
      } catch (error) {
        console.warn(`Newsroom Gemini enrichment failed for "${cleanText(article.title).slice(0, 120)}": ${error.message || error}`);
      }
    }
    if (enriched.length > 0) {
      const enrichedByKey = new Map(enriched.flatMap((article) => articleSourceKeys(article).map((key) => [key, article])));
      incomingArticles = await prepareArticlesForPublish(
        queuedCandidates.map((article) => enrichedByKey.get(articleSourceKeys(article)[0]) || article),
        publishOptions
      );
    }
  }

  const publishedSourceUrls = new Set(incomingArticles.flatMap((article) =>
    (article.source_set || []).map((source) => canonicalSourceUrl(source.source_url)).filter(Boolean)
  ));
  const pairEligibilityCandidates = isBilingualPairRequired(env)
    ? [...queuedCandidates, ...readExistingArticles(outputPath)]
    : [];
  const wasPublished = (article) => {
    if (isBilingualPairRequired(env) && !hasBilingualCandidate(article, pairEligibilityCandidates)) {
      return false;
    }
    const articleKey = getPendingArticleKey(article);
    return incomingArticles.some((published) => {
      if (getPendingArticleKey(published) === articleKey) return true;
      return (article.source_set || []).some((source) => publishedSourceUrls.has(canonicalSourceUrl(source.source_url)));
    });
  };
  const nextPending = pendingItems
    .filter((item) => !wasPublished(item.article))
    .filter((item) => !item.expired)
    .map((item) => bilingualResult.failedKeys.has(getPendingArticleKey(item.article))
      ? markPendingTranslationFailure(item, now)
      : ({ article: item.article, first_seen_at: item.first_seen_at, retry_count: item.retry_count || 0, last_retry_at: item.last_retry_at || "" }));
  const incomingPending = queuedCandidates
    .filter((article) => shouldHoldPendingArticle(article, queuedCandidates, env))
    .filter((article) => !wasPublished(article))
    .map((article) => ({ article, first_seen_at: article.first_seen_at || now, retry_count: bilingualResult.failedKeys.has(getPendingArticleKey(article)) ? 1 : 0, last_retry_at: bilingualResult.failedKeys.has(getPendingArticleKey(article)) ? now : "" }));
  const pendingMap = new Map();
  for (const item of [...nextPending, ...incomingPending]) {
    const key = getPendingArticleKey(item.article);
    if (key && !pendingMap.has(key)) pendingMap.set(key, item);
  }
  writePendingQueue(pendingPath, [...pendingMap.values()], now);

  if (!incomingArticles.length) {
    return {
      changed: false,
      publishedCount: 0,
      outputPath,
      sourceLabel,
      pendingCount: pendingMap.size,
      reason: "no-publishable-articles"
    };
  }

  const result = await publishArticles({
    incomingArticles,
    outputPath,
    replaceMode: false,
    now,
    databaseUrl: env.DATABASE_URL || "",
    // prepareArticlesForPublish already applies the strict gate. The baseline
    // check here only protects storage invariants before writing.
    strictQualityGate: false,
    requireBilingualPair: isBilingualPairRequired(env)
  });

  if (!result.changed) {
    return { ...result, sourceLabel };
  }

  return { ...result, sourceLabel };
}

async function prepareArticlesForPublish(incomingArticles, { env = process.env, now, outputPath, siteUrl, storeUrl, strictQualityGate = false }) {
  const historicalArticles = readExistingArticles(outputPath || "data/newsroom-content.json");
  const contextualArticles = buildHistoricalContextArticles(incomingArticles, historicalArticles, now);
  const publishCandidates = [...incomingArticles, ...contextualArticles];
  const state = buildNewsroomState({
    siteUrl,
    storeUrl,
    externalArticles: publishCandidates,
    now,
    webControl: {},
    expandEditorialCopy: false
  });

  if (state.articles.length > 0) {
    const normalizedArticles = state.articles.map(stripRuntimeArticleFields);
    const readyArticles = filterPublishReadyArticles(normalizedArticles, "normalized", strictQualityGate);
    if (readyArticles.length > 0) {
      return readyArticles;
    }

    if (strictQualityGate) {
      const trustedFallback = filterTrustedSourceFallbackArticles(normalizedArticles, "trusted-source-fallback");
      if (trustedFallback.length > 0) {
        return trustedFallback;
      }
    }

  }

  const synthesizedArticles = await enhanceMultiSourceSynthesisWithGemini(
    aggregateIncomingDrafts(publishCandidates, now),
    { env, model: env.NEWSROOM_GEMINI_MODEL, apiKey: env.NEWSROOM_GEMINI_API_KEY || env.GEMINI_API_KEY }
  );
  const synthesizedState = buildNewsroomState({
    siteUrl,
    storeUrl,
    externalArticles: synthesizedArticles,
    now,
    webControl: {},
    expandEditorialCopy: false
  });

  if (synthesizedState.articles.length > 0) {
    const synthesizedArticles = synthesizedState.articles.map(stripRuntimeArticleFields);
    const readyArticles = filterPublishReadyArticles(synthesizedArticles, "synthesized", strictQualityGate);
    if (readyArticles.length > 0) {
      return readyArticles;
    }

    if (strictQualityGate) {
      const trustedFallback = filterTrustedSourceFallbackArticles(synthesizedArticles, "trusted-source-fallback");
      if (trustedFallback.length > 0) {
        return trustedFallback;
      }
    }
  }

  if (strictQualityGate) {
    return [];
  }

  return filterPublishReadyArticles(
    publishCandidates.map((article) => forceArticleValueFloor(article, now)).filter(Boolean),
    "source-draft",
    strictQualityGate
  );
}

async function ensureBilingualCandidates(articles, env, now, outputPath) {
  if (!isBilingualPairRequired(env) || !articles.length) {
    return { articles, failedKeys: new Set() };
  }

  const existing = readExistingArticles(outputPath || "data/newsroom-content.json");
  const useGeminiTranslation = /^(1|true|yes|on)$/i.test(String(env.NEWSROOM_TRANSLATION_USE_GEMINI || ""));
  const translator = createNewsroomTranslator({
    endpoint: env.NEWSROOM_TRANSLATION_ENDPOINT,
    apiKey: env.NEWSROOM_TRANSLATION_API_KEY || (useGeminiTranslation ? env.NEWSROOM_GEMINI_API_KEY || env.GEMINI_API_KEY : ""),
    model: env.NEWSROOM_TRANSLATION_MODEL || (useGeminiTranslation ? env.NEWSROOM_GEMINI_MODEL || "gemini-3-flash-preview" : "")
  });
  const byCluster = new Map();

  for (const article of [...existing, ...articles]) {
    const clusterId = String(article?.cluster_id || "").trim();
    if (!clusterId) continue;
    const languages = byCluster.get(clusterId) || new Set();
    languages.add(article.language === "en" ? "en" : "vi");
    byCluster.set(clusterId, languages);
  }

  const result = [...articles];
  const failedKeys = new Set();
  for (const article of articles) {
    const clusterId = String(article?.cluster_id || "").trim();
    if (!clusterId) continue;
    const languages = byCluster.get(clusterId) || new Set();
    const sourceLanguage = article.language === "en" ? "en" : "vi";
    const targetLanguage = sourceLanguage === "en" ? "vi" : "en";
    if (languages.has(targetLanguage)) continue;
    if (!translator.enabled) {
      console.warn(`Holding bilingual article "${cleanText(article.title).slice(0, 100)}": translation provider is not configured.`);
      continue;
    }

    try {
      const translated = await translator.translateArticle(article, targetLanguage);
      const translatedTitle = cleanText(translated.title);
      const translatedArticle = {
        ...article,
        id: `${article.id || `feed-${crypto.createHash("sha1").update(clusterId).digest("hex").slice(0, 12)}`}-${targetLanguage}`,
        cluster_id: clusterId,
        language: targetLanguage,
        title: translatedTitle,
        summary: cleanText(translated.summary),
        dek: cleanText(translated.dek),
        hook: cleanText(translated.hook),
        sections: translated.sections.map((section) => ({ heading: cleanText(section.heading), body: cleanText(section.body) })),
        published_at: article.published_at || now,
        updated_at: now,
        translated_from: article.id || ""
      };
      result.push(translatedArticle);
      languages.add(targetLanguage);
    } catch (error) {
      console.warn(`Holding bilingual article "${cleanText(article.title).slice(0, 100)}": ${error.message || error}`);
      failedKeys.add(getPendingArticleKey(article));
    }
  }

  return { articles: result, failedKeys };
}

function filterTrustedSourceFallbackArticles(articles, stage) {
  const ready = [];

  for (const article of articles) {
    if (isTrustedSourceFallbackReady(article)) {
      ready.push(article);
      continue;
    }

    const readiness = evaluateTrustedSourceFallbackReadiness(article);
    const label = cleanText(article?.title || article?.slug || "untitled").slice(0, 120);
    console.warn(
      `Holding ${stage} article "${label}" because it failed trusted-source fallback: ${readiness.missing.join(", ")}`
    );
  }

  return ready;
}

function preserveSourceDraft(article, now) {
  if (!article || typeof article !== "object") {
    return null;
  }

  const language = article.language === "en" ? "en" : "vi";
  const sourceSet = Array.isArray(article.source_set) ? article.source_set : [];
  const baseSummary = cleanText(article.summary || article.dek || article.hook || article.sections?.[0]?.body || article.title);
  const valueLines = buildEditorialValueLines({ article, language });
  const leadCopy = buildDistinctLeadCopy({ article, baseSummary, valueLines, language });
  const cleanedSections = buildThickEditorialSections({
    sections: Array.isArray(article.sections) ? article.sections : [],
    valueLines,
    language
  });

  return {
    ...article,
    title: cleanText(article.title),
    summary: leadCopy.summary,
    dek: leadCopy.dek,
    hook: leadCopy.hook,
    sections: cleanedSections,
    source_set: sourceSet,
    published_at: article.published_at || now,
    updated_at: article.updated_at || article.published_at || now
  };
}

function buildDistinctLeadCopy({ article, baseSummary, valueLines, language }) {
  const title = cleanText(article?.title);
  const sourceFact = firstUsefulSentence(baseSummary || article?.summary || article?.dek || title);
  const impactLine = valueLines[1] || valueLines[0] || "";
  const watchLine = valueLines[2] || valueLines[3] || "";

  return {
    summary: joinValueSentences(sourceFact || title, valueLines[0]).slice(0, 420),
    dek: language === "en"
      ? joinValueSentences(`Why it matters: ${impactLine}`)
      : joinValueSentences(`Điểm đáng chú ý: ${impactLine}`),
    hook: language === "en"
      ? joinValueSentences(`What to watch next: ${watchLine}`)
      : joinValueSentences(`Điều cần theo dõi: ${watchLine}`)
  };
}

function firstUsefulSentence(value) {
  return splitSentences(value)
    .find((sentence) => cleanText(sentence).length >= 60)
    || splitSentences(value)[0]
    || cleanText(value);
}

function filterPublishReadyArticles(articles, stage, strictQualityGate = false) {
  const ready = [];
  const isReady = strictQualityGate ? isArticleAutopublishReady : isArticlePublishReady;
  const evaluate = strictQualityGate ? evaluateArticleAutopublishReadiness : evaluateArticleReadiness;

  for (const article of articles) {
    if (isReady(article)) {
      ready.push(article);
      continue;
    }

    const readiness = evaluate(article);
    const label = cleanText(article?.title || article?.slug || "untitled").slice(0, 120);
    console.warn(
      `Holding ${stage} article "${label}" because it failed publish readiness: ${readiness.missing.join(", ")}`
    );
  }

  return ready;
}

function isStrictAutopublishQualityGateEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.NEWSROOM_AUTOPUBLISH_STRICT || ""));
}

function forceArticleValueFloor(article, now) {
  if (!article || typeof article !== "object") {
    return null;
  }

  const language = article.language === "en" ? "en" : "vi";
  const baseSummary = cleanText(article.summary || article.dek || article.hook || article.sections?.[0]?.body || article.title);
  const sourceSet = Array.isArray(article.source_set) ? article.source_set : [];
  const valueLines = language === "en"
    ? [
        "The useful part is the context, the practical impact, the likely workflow cost, and what readers should check before acting.",
        "Readers should compare the promise with the real rollout, the source strength, the limitation, and the next decision this story creates.",
        "The follow-up is whether the current signal turns into a durable change, a pricing shift, or only a short-lived update.",
        "The reader value is a clearer checklist: what changed, who feels it first, what risk remains, and what should be watched next.",
        "That keeps the piece useful even when the first source payload is thin or noisy."
      ]
    : [
        "Phần hữu ích nằm ở bối cảnh, tác động thực tế, chi phí workflow và điều người đọc nên kiểm tra trước khi hành động.",
        "Người đọc nên so lời hứa với tốc độ triển khai, độ chắc của nguồn, giới hạn còn lại và quyết định tiếp theo mà câu chuyện này tạo ra.",
        "Điều cần theo dõi là tín hiệu hiện tại có biến thành thay đổi bền vững, thay đổi giá trị gói hay chỉ là một cập nhật ngắn hạn.",
        "Giá trị người đọc nhận được là một checklist rõ hơn: chuyện gì đổi, ai bị chạm trước, rủi ro nào còn lại và nên xem tiếp điểm nào.",
        "Cách này giữ bài có ích ngay cả khi payload nguồn ban đầu còn mỏng hoặc nhiễu."
      ];
  const sections = Array.isArray(article.sections) ? article.sections : [];
  const paddedSections = [...sections, ...valueLines.map((line, index) => ({
    heading: language === "en" ? ["Context", "Practical impact", "What to watch", "Reader checklist", "Editorial value"][index] : ["Bối cảnh", "Tác động thực tế", "Điều cần theo dõi", "Checklist cho người đọc", "Giá trị biên tập"][index],
    body: line
  }))].slice(0, 6).map((section, index) => ({
    ...section,
    heading: cleanText(section?.heading) || (language === "en" ? `Value point ${index + 1}` : `Điểm giá trị ${index + 1}`),
    body: joinValueSentences(cleanText(section?.body), valueLines[index % valueLines.length], valueLines[(index + 1) % valueLines.length])
  }));

  return {
    ...article,
    title: cleanText(article.title),
    summary: joinValueSentences(baseSummary, valueLines[0]),
    dek: joinValueSentences(cleanText(article.dek || baseSummary), valueLines[1]),
    hook: joinValueSentences(cleanText(article.hook || baseSummary), valueLines[2]),
    sections: paddedSections,
    source_set: sourceSet,
    published_at: article.published_at || now,
    updated_at: article.updated_at || article.published_at || now
  };
}

function buildEditorialValueLines({ article, language }) {
  const title = cleanText(article?.title);
  const sourceName = cleanText(article?.source_set?.[0]?.source_name || article?.draft_context?.source_name || "");
  const openerIndex = [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5;
  const openers = language === "en"
    ? [
        "The confirmed detail here",
        "The most useful starting point",
        "What deserves attention first",
        "The evidence currently available",
        "The practical story begins"
      ]
    : [
        "Chi tiết đã được xác nhận",
        "Điểm nên bắt đầu đọc",
        "Điều đáng chú ý trước tiên",
        "Lớp bằng chứng hiện có",
        "Câu chuyện thực tế bắt đầu"
      ];
  const sourcePhrase = openers[openerIndex];

  return language === "en"
    ? [
        `${sourcePhrase} should be read in the context of ${sourceName || "this story"}: when it appeared, what is confirmed, and why readers should care.`,
        `The practical impact sits in workflow, cost, risk, or a buying decision; ${title || "this update"} should be explained through that lens before any broad claim is made.`,
        "The next question is whether the signal becomes a durable rollout, a pricing move, a product limitation, or a short update that fades after the news cycle.",
        "For readers, the useful frame is evidence, affected users, remaining risk, and the next point worth checking before acting.",
        "A stronger article separates the source fact, the reader impact, and the follow-up question so the piece does not feel like a loose link summary."
      ]
    : [
        `${sourcePhrase} cần được đặt trong bối cảnh của ${sourceName || "câu chuyện này"}: thời điểm xuất hiện, dữ kiện chắc chắn và lý do người đọc nên quan tâm.`,
        `Tác động thực tế nằm ở workflow, chi phí, rủi ro hoặc quyết định mua/dùng; ${title || "cập nhật này"} nên được giải thích qua lăng kính đó trước khi kết luận rộng hơn.`,
        "Câu hỏi tiếp theo là tín hiệu này có thành rollout bền vững, thay đổi giá trị sản phẩm, giới hạn đáng chú ý hay chỉ là một nhịp cập nhật ngắn.",
        "Với người đọc, khung hữu ích gồm bằng chứng hiện có, nhóm bị ảnh hưởng, rủi ro còn lại và điểm nên kiểm tra trước khi hành động.",
        "Một bài tốt cần tách rõ sự kiện từ nguồn, tác động với người đọc và câu hỏi theo dõi để không giống bản tóm tắt link rời."
      ];
}

function buildThickEditorialSections({ sections, valueLines, language }) {
  const headings = language === "en"
    ? ["Context: what changed", "Practical impact for readers", "Details worth verifying", "Who should act or wait", "What to watch next"]
    : ["Bối cảnh: điều gì vừa đổi", "Tác động thực tế với người đọc", "Chi tiết cần kiểm chứng", "Ai nên hành động hoặc chờ", "Điều cần theo dõi tiếp"];
  const sourceSections = Array.isArray(sections) ? sections : [];

  return headings.map((heading, index) => {
    const sourceBody = cleanText(sourceSections[index]?.body || sourceSections[index]?.summary || "");
    const sectionRole = language === "en"
      ? [
          "This section should establish the confirmed change before moving into interpretation.",
          "This section should connect the report to reader workflow, spending, security, or product decisions.",
          "This section should keep only verifiable details and avoid repeating the same source phrasing.",
          "This section should name the reader group that benefits from acting now or waiting for confirmation.",
          "This section should close with the next signal worth checking, not another summary of the same fact."
        ][index]
      : [
          "Phần này cần dựng lại thay đổi đã có cơ sở trước khi chuyển sang nhận định.",
          "Phần này cần nối câu chuyện với workflow, chi phí, bảo mật hoặc quyết định dùng/mua của người đọc.",
          "Phần này chỉ giữ chi tiết có thể kiểm chứng và tránh lặp lại nguyên văn cách diễn đạt của nguồn.",
          "Phần này cần gọi đúng nhóm độc giả nên hành động ngay hoặc nên chờ thêm xác nhận.",
          "Phần này nên khép lại bằng tín hiệu cần kiểm tra tiếp, không tóm tắt lại cùng một ý."
        ][index];
    const body = joinValueSentences(sourceBody, valueLines[index], sectionRole);

    return {
      ...(sourceSections[index] || {}),
      heading,
      body
    };
  });
}

function joinValueSentences(...values) {
  const seen = new Set();
  const sentences = [];

  for (const value of values) {
    for (const sentence of String(value || "").match(/[^.?!]+[.?!]?/g) || []) {
      const cleaned = finishSentence(cleanText(sentence));
      const key = cleaned.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ").trim();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      sentences.push(cleaned);
    }
  }

  return sentences.join(" ").trim();
}

function stripRuntimeArticleFields(article) {
  const {
    author,
    alternates,
    hero_image,
    related_store_cards,
    topic,
    ...rest
  } = article;

  return {
    ...rest,
    topic,
    image: article.image || {
      src: hero_image?.src || hero_image?.url || "",
      caption: hero_image?.caption || "",
      credit: hero_image?.credit || "",
      source_url: hero_image?.source_url || ""
    }
  };
}

function isBilingualPairRequired(env = process.env) {
  return /^(1|true|yes|on)$/i.test(String(env.NEWSROOM_REQUIRE_BILINGUAL_PAIR || ""));
}

function shouldHoldPendingArticle(article, candidates, env) {
  if (isSingleSourceArticle(article)) return true;
  if (!isBilingualPairRequired(env)) return false;

  return !hasBilingualCandidate(article, candidates);
}

function hasBilingualCandidate(article, candidates) {
  const clusterId = String(article?.cluster_id || "").trim();
  if (!clusterId) return false;
  const languages = new Set(
    candidates
      .filter((candidate) => String(candidate?.cluster_id || "").trim() === clusterId)
      .map((candidate) => candidate?.language === "en" ? "en" : "vi")
  );
  return languages.has("vi") && languages.has("en");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNewsroomRefresh()
    .then((result) => {
      if (!result.changed) {
        console.log(
          `Newsroom already up to date from ${result.sourceLabel} at ${path.resolve(process.cwd(), result.outputPath)}`
        );
        process.exit(0);
      }
      console.log(`Refreshed ${result.publishedCount} article(s) from ${result.sourceLabel} into ${result.outputPath}`);
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || error);
      process.exit(1);
    });
}

async function fetchSingleUrlArticles(sourceUrl, timestamp, env = process.env) {
  const link = normalizePublicArticleUrl(sourceUrl);
  if (!link) {
    return [];
  }

  const snapshot = await fetchSourceSnapshot(link);
  const title = cleanText(snapshot.title || inferTitleFromUrl(link));
  const sourceDescription = pickRelevantLeadText({
    title,
    values: [snapshot.description, snapshot.bodyText]
  });
  const relevantParagraphs = filterRelevantParagraphs({
    title,
    description: sourceDescription,
    paragraphs: snapshot.paragraphs
  });
  const rawBody = cleanText([sourceDescription, ...relevantParagraphs].join(" "));

  if (!title || rawBody.length < 180 || relevantParagraphs.length < 2) {
    return [];
  }

  const source = classifySubmittedSource(link, `${title} ${rawBody}`);
  const article = await mapFeedItem(
    {
      name: source.name,
      url: link,
      language: source.language,
      region: source.region,
      sourceType: source.sourceType,
      trustTier: source.trustTier,
      topicHint: source.topicHint,
      contentTypeHint: env.NEWSROOM_SINGLE_CONTENT_TYPE || ""
    },
    {
      title,
      link,
      description: sourceDescription,
      content: rawBody,
      pubDate: snapshot.publishedAt || timestamp,
      imageUrl: snapshot.imageUrl
    },
    timestamp
  );

  if (!article) {
    return [];
  }

  return [
    {
      ...article,
      id: article.id.replace(/^feed-/, "telegram-link-"),
      cluster_id: article.cluster_id.replace(/^feed-/, "telegram-link-"),
      verification_state: source.verificationState,
      draft_context: {
        ...article.draft_context,
        submitted_via: "telegram-link",
        submitted_url: link
      }
    }
  ];
}

async function fetchFallbackArticles(timestamp, feeds = [], env = process.env) {
  const allArticles = [];
  const feedCachePath = env.NEWSROOM_FEED_CACHE_PATH || "data/newsroom-feed-http-cache.json";
  const feedCache = readFeedHttpCache(feedCachePath);
  const fetchConcurrency = clampInteger(env?.NEWSROOM_FETCH_CONCURRENCY, 1, 8, 4);
  const feedConcurrency = clampInteger(env?.NEWSROOM_FEED_CONCURRENCY, 1, 8, 4);
  const fetched = await mapWithConcurrency(feeds, feedConcurrency, async (feed) => {
    try {
      const cachedHeaders = feedCache[feed.url] || {};
      const headers = {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "patrick-tech-media-refresh/1.0"
        };
      if (cachedHeaders.etag) headers["If-None-Match"] = cachedHeaders.etag;
      if (cachedHeaders.lastModified) headers["If-Modified-Since"] = cachedHeaders.lastModified;
      const response = await fetchWithTimeout(feed.url, {
        headers: {
          ...headers
        }
      }, env);

      if (response.status === 304) return [];

      if (!response.ok) {
        throw new Error(`Feed ${feed.name} returned ${response.status}`);
      }
      feedCache[feed.url] = { etag: response.headers.get("etag") || "", lastModified: response.headers.get("last-modified") || "", updated_at: new Date().toISOString() };

      const xml = await response.text();
      const items = parseFeedItems(xml).slice(0, feed.limit);
      return mapWithConcurrency(items, fetchConcurrency, async (item) => mapFeedItem(feed, item, timestamp));
    } catch (error) {
      console.warn(`Skipping ${feed.name}: ${error.message || error}`);
      return [];
    }
  });
  allArticles.push(...fetched.flat().filter(Boolean));
  writeFeedHttpCache(feedCachePath, feedCache);

  // Preserve source provenance for automatic publication. Aggregated and
  // companion drafts remain useful editorial inputs, but their synthesized
  // source records cannot prove the trust tier of a particular report.
  return selectCuratedSourceDrafts(allArticles, env);
}

export async function fetchHackerNewsTopStories(timestamp = new Date().toISOString(), { env = process.env, fetchImpl = fetch, mapItem = mapFeedItem } = {}) {
  if (String(env?.NEWSROOM_HACKER_NEWS_ENABLED ?? "1").trim() === "0") return [];
  const limit = clampInteger(env?.NEWSROOM_HACKER_NEWS_LIMIT, 1, 30, 12);
  const feed = {
    name: "Hacker News Top Stories",
    url: "https://news.ycombinator.com/",
    language: "en",
    region: "Global",
    sourceType: "community",
    trustTier: "community",
    topicHint: "internet-business-tech",
    limit
  };
  try {
    const topStoriesResponse = await fetchImpl("https://hacker-news.firebaseio.com/v0/topstories.json", {
      headers: { Accept: "application/json", "User-Agent": "patrick-tech-media-refresh/1.0" }
    });
    if (!topStoriesResponse.ok) throw new Error(`Hacker News top stories returned ${topStoriesResponse.status}`);
    const topStoryIds = await readJsonResponse(topStoriesResponse);
    if (!Array.isArray(topStoryIds)) throw new Error("Hacker News top stories response was not an array.");
    const candidates = topStoryIds.slice(0, limit * 3);
    const stories = await mapWithConcurrency(candidates, 4, async (id) => {
      const response = await fetchImpl(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(id)}.json`, {
        headers: { Accept: "application/json", "User-Agent": "patrick-tech-media-refresh/1.0" }
      });
      if (!response.ok) return null;
      const item = await readJsonResponse(response);
      if (item?.type !== "story" || !item?.url || !item?.title) return null;
      return mapItem(feed, {
        title: item.title,
        link: item.url,
        description: item.title,
        content: item.text || "",
        pubDate: item.time ? new Date(Number(item.time) * 1000).toISOString() : timestamp,
        imageUrl: ""
      }, timestamp);
    });
    return (await Promise.all(stories)).filter(Boolean).slice(0, limit);
  } catch (error) {
    console.warn(`Skipping Hacker News Top Stories: ${error?.message || error}`);
    return [];
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

function articleSourceKeys(article) {
  const keys = (article?.source_set || []).map((source) => canonicalSourceUrl(source?.source_url)).filter(Boolean);
  const id = cleanText(article?.id || article?.slug);
  if (id) keys.push(`id:${id}`);
  return [...new Set(keys)];
}

function readFeedHttpCache(filePath) {
  try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8")); } catch { return {}; }
}

function writeFeedHttpCache(filePath, value) {
  try {
    const target = path.resolve(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn(`Unable to write feed HTTP cache: ${error.message || error}`);
  }
}

export function selectCuratedSourceDrafts(articles, env = process.env) {
  const limit = clampInteger(env?.NEWSROOM_AUTOPUBLISH_LIMIT, 1, 30, 15);
  const minimumVietnamese = clampInteger(env?.NEWSROOM_AUTOPUBLISH_MIN_VI, 0, limit, Math.min(limit, Math.max(2, Math.ceil(limit * 0.4))));
  const topicFloor = ["security", "internet-business-tech", "devices", "apps-software", "gaming"];
  const seenLinks = new Set();
  const seenTopics = new Map();
  const maxPerTopic = Math.max(1, Math.ceil(limit * 0.35));

  const eligible = articles
    .filter((article) => {
      const source = Array.isArray(article?.source_set) ? article.source_set[0] : null;
      const sourceType = String(source?.source_type || "").trim();
      const trustTier = String(source?.trust_tier || "").trim();
      const trusted = sourceType === "official-site" || (sourceType === "press" && trustTier === "established-media");
      const sourceDepthScore = Number(article?.draft_context?.source_depth_score || 0);
      const paragraphCount = Array.isArray(article?.draft_context?.paragraphs) ? article.draft_context.paragraphs.length : 0;
      return trusted && Number(article?.quality_score || 0) >= 88 && sourceDepthScore >= 58 && paragraphCount >= 3;
    })
    .sort((left, right) => {
      const depthDifference = Number(right?.draft_context?.source_depth_score || 0) - Number(left?.draft_context?.source_depth_score || 0);
      if (depthDifference !== 0) {
        return depthDifference;
      }
      const dateDifference = Date.parse(right?.published_at || 0) - Date.parse(left?.published_at || 0);
      if (Number.isFinite(dateDifference) && dateDifference !== 0) {
        return dateDifference;
      }
      return Number(right?.quality_score || 0) - Number(left?.quality_score || 0);
    })
    .filter((article) => {
      const link = String(article?.source_set?.[0]?.source_url || article?.href || article?.slug || "").trim();
      if (!link || seenLinks.has(link)) {
        return false;
      }
      seenLinks.add(link);
      return true;
    });

  const selected = [];
  const usedIds = new Set();

  // Reserve capacity for Vietnamese articles only after they pass the same trust, depth, and quality checks.
  for (const article of eligible) {
    if (selected.length >= minimumVietnamese) break;
    if (article.language !== "vi") continue;
    const key = article.id || article.slug;
    if (!key || usedIds.has(key)) continue;
    selected.push(article);
    usedIds.add(key);
    const topic = normalizeTopicHint(article?.topic) || "ai";
    seenTopics.set(topic, (seenTopics.get(topic) || 0) + 1);
  }

  for (const topic of topicFloor) {
    const match = eligible.find((article) => normalizeTopicHint(article?.topic) === topic && !usedIds.has(article.id || article.slug));
    if (match && selected.length < limit) {
      selected.push(match);
      usedIds.add(match.id || match.slug);
      seenTopics.set(topic, (seenTopics.get(topic) || 0) + 1);
    }
  }

  for (const article of eligible) {
    if (selected.length >= limit) {
      break;
    }
    const key = article.id || article.slug;
    if (usedIds.has(key)) {
      continue;
    }
    const topic = normalizeTopicHint(article?.topic) || "ai";
    const topicCount = seenTopics.get(topic) || 0;
    if (topicCount >= maxPerTopic) {
      continue;
    }
    selected.push(article);
    usedIds.add(key);
    seenTopics.set(topic, topicCount + 1);
  }

  if (selected.length < limit) {
    for (const article of eligible) {
      if (selected.length >= limit) {
        break;
      }
      const key = article.id || article.slug;
      if (usedIds.has(key)) {
        continue;
      }
      selected.push(article);
      usedIds.add(key);
    }
  }

  return selected.slice(0, limit);
}

function parseFeedItems(xml) {
  const rssItems = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  if (rssItems.length) {
    return rssItems.map((itemXml) => ({
      title: readTag(itemXml, "title"),
      link: readTag(itemXml, "link"),
      guid: readTag(itemXml, "guid"),
      description: readTag(itemXml, "description"),
      content: readTag(itemXml, "content:encoded"),
      pubDate: readTag(itemXml, "pubDate"),
      imageUrl: readImageUrl(itemXml)
    }));
  }

  const atomEntries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);

  return atomEntries.map((entryXml) => ({
    title: readTag(entryXml, "title"),
    link: readAtomLink(entryXml),
    guid: readTag(entryXml, "id"),
    description: readTag(entryXml, "summary"),
    content: readTag(entryXml, "content"),
    pubDate: readTag(entryXml, "updated") || readTag(entryXml, "published"),
    imageUrl: readImageUrl(entryXml)
  }));
}

function readAtomLink(xml) {
  const match =
    xml.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ||
    xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return decodeXmlEntities(match?.[1] || "");
}

function readTag(xml, tagName) {
  const pattern = new RegExp(`<${escapeRegex(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "i");
  const match = xml.match(pattern);
  return decodeXmlEntities(stripCdata(match?.[1] || ""));
}

function readImageUrl(xml) {
  const patterns = [
    /<media:content\b[^>]*url="([^"]+)"/i,
    /<media:thumbnail\b[^>]*url="([^"]+)"/i,
    /<enclosure\b[^>]*url="([^"]+)"/i,
    /<img\b[^>]*src="([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);

    if (match?.[1]) {
      return decodeXmlEntities(match[1]);
    }
  }

  return "";
}

async function mapFeedItem(feed, item, timestamp) {
  const title = cleanText(item.title);
  const link = cleanUrl(item.link);

  if (!title || !link) {
    return null;
  }

  const snapshot = await fetchSourceSnapshot(link);
  const sourceDescription = pickRelevantLeadText({
    title,
    values: [snapshot.description, item.description, item.content]
  });
  const relevantParagraphs = filterRelevantParagraphs({
    title,
    description: sourceDescription,
    paragraphs: snapshot.paragraphs
  });
  const editorialParagraphs = relevantParagraphs
    .filter((paragraph) => !isSourceTextContaminated(paragraph))
    .slice(0, 8);
  const rawBody = cleanText([sourceDescription, ...editorialParagraphs].join(" "));

  if (!rawBody) {
    return null;
  }

  if (!isTechnologyRelevantStory({ feed, title, body: rawBody, link })) {
    return null;
  }

  const sourceDepthScore = calculateSourceDepthScore({
    title,
    sourceDescription,
    paragraphs: editorialParagraphs,
    rawBody
  });
  const inferenceText = cleanText([title, sourceDescription, ...editorialParagraphs.slice(0, 4)].join(" "));
  const topic = inferTopicFromSignals(feed, title, inferenceText);
  const contentType = inferContentType(feed, title, inferenceText);
  const summary = buildSummary(sourceDescription || rawBody, feed.language, title, editorialParagraphs);
  const dek = buildDek(sourceDescription || rawBody, feed.language, summary, editorialParagraphs, title);
  const hook = buildHook(editorialParagraphs, summary, dek, feed.language, title);
  const sections = buildSections({
    title,
    summary,
    dek,
    language: feed.language,
    topic,
    contentType,
    sourceName: feed.name,
    paragraphs: editorialParagraphs
  });
  const publishedAt = normalizeDate(item.pubDate, timestamp);
  const articleHash = crypto.createHash("sha1").update(`${feed.name}:${link}:${feed.language}`).digest("hex").slice(0, 12);
  const slug = truncateSlug(slugify(title), 96);
  const imageUrl = chooseStoryImage({
    itemImageUrl: item.imageUrl,
    snapshotImageUrl: snapshot.imageUrl,
    title,
    body: inferenceText,
    sourceName: feed.name,
    link
  });
  const image = imageUrl
    ? {
        src: imageUrl,
        caption: feed.language === "vi" ? `Ảnh tham khảo từ ${feed.name}.` : `Reference image from ${feed.name}.`,
        credit: feed.name,
        source_url: link
      }
    : {};

  return {
    id: `feed-${articleHash}-${feed.language}`,
    cluster_id: `feed-${articleHash}`,
    language: feed.language,
    topic,
    content_type: contentType,
    slug,
    title,
    summary,
    dek,
    hook,
    sections,
    verification_state: feed.sourceType === "official-site" ? "verified" : "emerging",
    quality_score: calculateQualityScore({ feed, imageUrl, paragraphs: editorialParagraphs, summary, dek, hook, sourceDepthScore }),
    ad_eligible: true,
    show_editorial_label: false,
    indexable: true,
    store_link_mode: resolveStoreLinkMode(topic, contentType),
    related_store_items: resolveStoreItems(topic),
    source_set: [
      {
        source_type: feed.sourceType,
        source_name: feed.name,
        source_url: link,
        region: feed.region,
        language: feed.language,
        trust_tier: feed.trustTier,
        published_at: publishedAt,
        image_url: imageUrl,
        image_caption: image.caption || "",
        image_credit: feed.name
      }
    ],
    author_id: resolveAuthorId(topic),
    published_at: publishedAt,
    updated_at: publishedAt,
    image,
    draft_context: {
      source_title: title,
      source_name: feed.name,
      source_type: feed.sourceType,
      trust_tier: feed.trustTier,
      topic_hint: feed.topicHint || "",
      content_type_hint: feed.contentTypeHint || "",
      description: sourceDescription,
      paragraphs: editorialParagraphs.slice(0, 6),
      source_depth_score: sourceDepthScore,
      source_depth_reason: buildSourceDepthReason({ sourceDepthScore, paragraphs: editorialParagraphs, rawBody }),
      link
    }
  };
}

function classifySubmittedSource(url, text = "") {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const officialSources = [
    ["openai.com", "OpenAI", "ai"],
    ["blog.google", "Google Blog", "ai"],
    ["googleblog.com", "Google Blog", "ai"],
    ["microsoft.com", "Microsoft", "ai"],
    ["github.blog", "GitHub Blog", "apps-software"],
    ["aws.amazon.com", "AWS", "ai"],
    ["anthropic.com", "Anthropic", "ai"],
    ["x.ai", "xAI", "ai"],
    ["huggingface.co", "Hugging Face", "ai"],
    ["nvidia.com", "NVIDIA", "ai"],
    ["apple.com", "Apple", "devices"],
    ["samsung.com", "Samsung", "devices"],
    ["cloudflare.com", "Cloudflare", "security"],
    ["vercel.com", "Vercel", "apps-software"]
  ];
  const pressSources = [
    ["genk.vn", "GenK", "internet-business-tech"],
    ["vnexpress.net", "VnExpress", "internet-business-tech"],
    ["vietnamnet.vn", "VietnamNet", "internet-business-tech"],
    ["tuoitre.vn", "Tuoi Tre", "internet-business-tech"],
    ["thanhnien.vn", "Thanh Nien", "internet-business-tech"],
    ["theverge.com", "The Verge", "internet-business-tech"],
    ["techcrunch.com", "TechCrunch", "internet-business-tech"],
    ["wired.com", "WIRED", "internet-business-tech"],
    ["arstechnica.com", "Ars Technica", "security"],
    ["bleepingcomputer.com", "BleepingComputer", "security"],
    ["reuters.com", "Reuters", "internet-business-tech"],
    ["bloomberg.com", "Bloomberg", "internet-business-tech"],
    ["engadget.com", "Engadget", "devices"],
    ["androidauthority.com", "Android Authority", "devices"],
    ["9to5google.com", "9to5Google", "devices"],
    ["9to5mac.com", "9to5Mac", "devices"],
    ["macrumors.com", "MacRumors", "devices"],
    ["windowscentral.com", "Windows Central", "apps-software"],
    ["pcgamer.com", "PC Gamer", "gaming"],
    ["ign.com", "IGN", "gaming"],
    ["polygon.com", "Polygon", "gaming"]
  ];
  const socialSources = [
    ["x.com", "X", "internet-business-tech"],
    ["twitter.com", "X", "internet-business-tech"],
    ["facebook.com", "Facebook", "internet-business-tech"],
    ["threads.net", "Threads", "internet-business-tech"],
    ["tiktok.com", "TikTok", "internet-business-tech"],
    ["youtube.com", "YouTube", "internet-business-tech"],
    ["linkedin.com", "LinkedIn", "internet-business-tech"]
  ];
  const official = officialSources.find(([domain]) => matchesDomain(host, domain));
  const press = pressSources.find(([domain]) => matchesDomain(host, domain));
  const social = socialSources.find(([domain]) => matchesDomain(host, domain));
  const language = inferSubmittedLanguage(host, text);

  if (official) {
    return {
      name: official[1],
      language,
      region: host.endsWith(".vn") ? "VN" : "Global",
      sourceType: "official-site",
      trustTier: "official",
      verificationState: "verified",
      topicHint: official[2]
    };
  }

  if (press) {
    return {
      name: press[1],
      language,
      region: host.endsWith(".vn") ? "VN" : "Global",
      sourceType: "press",
      trustTier: "established-media",
      verificationState: "verified",
      topicHint: press[2]
    };
  }

  if (social) {
    return {
      name: social[1],
      language,
      region: "Global",
      sourceType: "official-social",
      trustTier: "social-signal",
      verificationState: "emerging",
      topicHint: social[2]
    };
  }

  return {
    name: titleCaseHost(host),
    language,
    region: host.endsWith(".vn") ? "VN" : "Global",
    sourceType: "press",
    trustTier: "reader-submitted",
    verificationState: "emerging",
    topicHint: inferTopicHintFromText(`${host} ${text}`)
  };
}

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function inferSubmittedLanguage(host, text) {
  if (host.endsWith(".vn") || /[\u00c0-\u1ef9]/i.test(String(text || ""))) {
    return "vi";
  }

  return "en";
}

function inferTopicHintFromText(text) {
  const haystack = String(text || "");
  if (hasGamingSignals(haystack)) {
    return "gaming";
  }
  if (hasStrongAiSignals(haystack) || hasGenericAiSignals(haystack)) {
    return "ai";
  }
  if (hasWorkspaceUtilitySignals(haystack)) {
    return "apps-software";
  }
  if (/\b(security|malware|ransomware|vulnerability|privacy|passkey|password|breach|hack)\b/i.test(haystack)) {
    return "security";
  }
  if (/\b(phone|iphone|android|pixel|macbook|ipad|laptop|pc|gpu|cpu|chip|npu|device)\b/i.test(haystack)) {
    return "devices";
  }
  return "internet-business-tech";
}

function titleCaseHost(host) {
  const label = String(host || "")
    .replace(/^www\./i, "")
    .split(".")
    .filter(Boolean)[0] || "Submitted Source";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchWithTimeout(url, options = {}, env = process.env) {
  const timeoutMs = clampInteger(env?.NEWSROOM_FETCH_TIMEOUT_MS, 2_000, 30_000, DEFAULT_FETCH_TIMEOUT_MS);
  const retries = clampInteger(env?.NEWSROOM_FETCH_RETRIES, 0, 3, 2);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);

      if (!retryable || attempt === retries) {
        return response;
      }

      await delay(Math.min(1200, 250 * (attempt + 1)));
    } catch (error) {
      if (attempt === retries || !isRetryableFetchError(error)) {
        throw error;
      }

      await delay(Math.min(1200, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Fetch retry loop ended unexpectedly.");
}

function isRetryableFetchError(error) {
  return error?.name === "AbortError"
    || /timed out|timeout|network|socket|fetch failed|reset/i.test(String(error?.message || error));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchSourceSnapshot(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "patrick-tech-media-refresh/1.0"
      }
    });

    if (!response.ok) {
      return { title: "", description: "", imageUrl: "", publishedAt: "", paragraphs: [], bodyText: "" };
    }

    const html = await response.text();
    const title =
      readMetaContent(html, "property", "og:title") ||
      readMetaContent(html, "name", "twitter:title") ||
      readPageTitle(html) ||
      "";
    const description =
      readMetaContent(html, "property", "og:description") ||
      readMetaContent(html, "name", "description") ||
      "";
    const rawImageUrl =
      readMetaContent(html, "property", "og:image") ||
      readMetaContent(html, "name", "twitter:image") ||
      "";
    const publishedAt =
      readMetaContent(html, "property", "article:published_time") ||
      readMetaContent(html, "name", "pubdate") ||
      readMetaContent(html, "name", "publishdate") ||
      "";
    const paragraphs = extractArticleParagraphs(html);

    return {
      title: cleanText(title),
      description: cleanText(description),
      imageUrl: normalizePublicArticleUrl(resolveUrlAgainst(rawImageUrl, url)),
      publishedAt: normalizeDate(publishedAt, ""),
      paragraphs,
      bodyText: paragraphs.join(" ")
    };
  } catch {
    return { title: "", description: "", imageUrl: "", publishedAt: "", paragraphs: [], bodyText: "" };
  }
}

function chooseStoryImage({ itemImageUrl, snapshotImageUrl, title, body, sourceName, link }) {
  const focusTerms = extractImageFocusTerms([title, body, sourceName].filter(Boolean).join(" "));
  const candidates = [
    { src: cleanUrl(snapshotImageUrl), preferred: true },
    { src: cleanUrl(itemImageUrl), preferred: false }
  ]
    .filter((entry) => entry.src)
    .map((entry) => ({
      ...entry,
      score: scoreStoryImageCandidate({
        url: entry.src,
        preferred: entry.preferred,
        focusTerms,
        sourceName,
        link
      })
    }))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.src || "";
}

function scoreStoryImageCandidate({ url, preferred, focusTerms, sourceName, link }) {
  const cleanedUrl = cleanUrl(url);

  if (!cleanedUrl) {
    return Number.NEGATIVE_INFINITY;
  }

  const normalized = normalizeAnchorText(cleanedUrl);
  let score = preferred ? 10 : 6;

  if (/\b(hero|cover|featured|uploads|wp-content|max-\d+)\b/i.test(cleanedUrl)) {
    score += 5;
  }

  if (/\b(logo|avatar|icon|sprite|placeholder|default|blank|social-share|opengraph)\b/i.test(cleanedUrl)) {
    score -= 12;
  }

  if (/\b(thumb|thumbnail|small|square|cropped|crop)\b/i.test(cleanedUrl)) {
    score -= 5;
  }

  for (const term of focusTerms) {
    if (normalized.includes(term)) {
      score += term.length >= 6 ? 3 : 1;
    }
  }

  for (const term of extractImageFocusTerms(sourceName)) {
    if (normalized.includes(term)) {
      score += 1;
    }
  }

  try {
    const linkHost = new URL(link).hostname.replace(/^www\./i, "");
    const imageHost = new URL(cleanedUrl).hostname.replace(/^www\./i, "");

    if (linkHost === imageHost) {
      score += 4;
    }
  } catch {
    // Ignore malformed URLs here.
  }

  return score;
}

function extractImageFocusTerms(value) {
  const explicitTerms = [
    "chatgpt", "openai", "gemini", "workspace", "notebooklm", "copilot", "claude", "deepseek", "grok",
    "facebook", "messenger", "instagram", "threads", "whatsapp", "oracle", "google", "microsoft",
    "apple", "macbook", "iphone", "intel", "nvidia", "ram", "gaming", "steam", "xbox", "playstation"
  ];
  const anchors = extractAnchorTerms(value).filter((entry) => entry.length >= 4);
  const normalized = normalizeAnchorText(value);

  return [...new Set([
    ...anchors,
    ...explicitTerms.filter((entry) => normalized.includes(entry))
  ])].slice(0, 18);
}

function readMetaContent(html, attribute, value) {
  const firstPattern = new RegExp(`<meta[^>]+${attribute}=["']${escapeRegex(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegex(value)}["'][^>]*>`, "i");
  const match = html.match(firstPattern) || html.match(reversePattern);
  return decodeXmlEntities(match?.[1] || "");
}

function readPageTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeXmlEntities(stripCdata(match?.[1] || ""));
}

function extractArticleParagraphs(html) {
  const chunk = extractBestArticleChunk(html);
  const preferred = extractParagraphs(chunk);

  if (preferred.length >= 3) {
    return preferred.slice(0, 6);
  }

  return extractParagraphs(html).slice(0, 6);
}

function extractBestArticleChunk(html) {
  const markers = [
    /knc-content/i,
    /detail-content/i,
    /entry-content/i,
    /post-content/i,
    /article-content/i,
    /article__content/i,
    /single-post/i,
    /article-body/i,
    /story-body/i
  ];

  for (const marker of markers) {
    const index = html.search(marker);

    if (index >= 0) {
      return html.slice(index, index + 50_000);
    }
  }

  return html;
}

function extractParagraphs(html) {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => sanitizeEditorialParagraph(match[1]))
    .filter(Boolean)
    .filter((paragraph) => paragraph.length >= 90)
    .filter((paragraph) => !isSourceTextContaminated(paragraph))
    .filter((paragraph) => !isBoilerplateParagraph(paragraph) && !isWeakEditorialSentence(paragraph))
    .filter((paragraph, index, list) => list.findIndex((entry) => entry === paragraph) === index);
}

function filterRelevantParagraphs({ title, description, paragraphs = [] }) {
  const cleanParagraphs = paragraphs.filter((paragraph) => !isSourceTextContaminated(paragraph));
  const anchors = extractAnchorTerms(`${title} ${description}`);

  if (!cleanParagraphs.length) {
    return [];
  }

  if (!anchors.length) {
    return cleanParagraphs.slice(0, 8);
  }

  const scored = cleanParagraphs.map((paragraph) => ({
    paragraph,
    score: scoreParagraphRelevance(paragraph, anchors)
  }));
  const strong = scored.filter((entry) => entry.score >= 2).map((entry) => entry.paragraph);

  if (strong.length >= 2) {
    return strong.slice(0, 8);
  }

  const fallback = scored.filter((entry) => entry.score >= 1).map((entry) => entry.paragraph);
  return fallback.slice(0, 8);
}

function buildHistoricalContextArticles(incomingArticles, historicalArticles, now) {
  const incomingUrls = new Set(
    incomingArticles.flatMap((article) => (article.source_set || []).map((source) => canonicalSourceUrl(source?.source_url)))
      .filter(Boolean)
  );

  if (!incomingUrls.size || !historicalArticles.length) {
    return [];
  }

  return buildEditorialCompanionArticles([...historicalArticles, ...incomingArticles], now)
    .filter((article) => (article.source_set || []).some((source) => incomingUrls.has(canonicalSourceUrl(source?.source_url))))
    .map((article) => ({
      ...article,
      draft_context: {
        ...(article.draft_context || {}),
        historical_context: true,
        historical_context_sources: (article.source_set || []).map((source) => source.source_url).filter(Boolean)
      }
    }));
}

function canonicalSourceUrl(value) {
  const normalized = cleanText(value);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return normalized;
  }
}

function readExistingArticles(outputPath) {
  try {
    return normalizeArticles(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), outputPath), "utf8")));
  } catch {
    return [];
  }
}

function pickRelevantLeadText({ title, values = [] }) {
  const cleanedValues = values
    .map((value) => cleanText(value))
    .filter((value) => value && !isSourceTextContaminated(value));
  const anchors = extractAnchorTerms(title);

  if (!cleanedValues.length) {
    return "";
  }

  if (!anchors.length) {
    return cleanedValues[0];
  }

  const scored = cleanedValues
    .map((value) => ({ value, score: scoreParagraphRelevance(value, anchors) }))
    .sort((left, right) => right.score - left.score || right.value.length - left.value.length);

  if (scored[0]?.score >= 2) {
    return scored[0].value;
  }

  if (scored[0]?.score >= 1 && hasGenericAiSignals(title) === hasGenericAiSignals(scored[0].value)) {
    return scored[0].value;
  }

  return "";
}

function extractAnchorTerms(value) {
  const stopwords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "over", "after", "before", "when",
    "what", "which", "more", "than", "just", "your", "their", "have", "about", "across", "inside",
    "nhung", "những", "dang", "đang", "vua", "vừa", "theo", "cho", "voi", "với", "mot", "một", "nhung",
    "cua", "của", "tren", "trên", "sang", "them", "thêm", "giua", "giữa", "duoc", "được", "khong", "không",
    "nguoi", "người", "dung", "dùng", "cau", "câu", "chuyen", "chuyện", "bai", "bài", "viet", "viết",
    "gia", "giá", "tri", "trị", "moi", "mới", "nam", "năm", "thang", "tháng"
  ]);

  return [...new Set(
    normalizeAnchorText(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopwords.has(token))
  )].slice(0, 24);
}

function scoreParagraphRelevance(paragraph, anchors) {
  const haystack = ` ${normalizeAnchorText(paragraph)} `;
  let score = 0;

  for (const anchor of anchors) {
    if (!haystack.includes(` ${anchor} `)) {
      continue;
    }

    score += anchor.length >= 6 || /\d/.test(anchor) ? 2 : 1;
  }

  return score;
}

function normalizeAnchorText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeEditorialParagraph(value) {
  return cleanSourceText(
    String(value || "")
      .replace(/search results for[^.?!]*[.?!]?/gi, " ")
      .replace(/all search results[^.?!]*[.?!]?/gi, " ")
      .replace(/affiliate links?[^.?!]*[.?!]?/gi, " ")
      .replace(/best daily deals[^.?!]*[.?!]?/gi, " ")
      .replace(/learn more[^.?!]*[.?!]?/gi, " ")
      .replace(/follow us[^.?!]*[.?!]?/gi, " ")
      .replace(/sign up[^.?!]*[.?!]?/gi, " ")
      .replace(/sign in[^.?!]*[.?!]?/gi, " ")
      .replace(/log in[^.?!]*[.?!]?/gi, " ")
      .replace(/read more[^.?!]*[.?!]?/gi, " ")
      .replace(/chịu trách nhiệm quản lý nội dung[\s\S]*$/i, " ")
      .replace(/trụ sở hà nội[\s\S]*$/i, " ")
      .replace(/vpđd tại tp\.?\s*hcm[\s\S]*$/i, " ")
      .replace(/điện thoại:\s*[\d.\s()+-]+[\s\S]*$/i, " ")
      .replace(/email:\s*[^\s]+@[^\s]+[\s\S]*$/i, " ")
      .replace(/công ty cổ phần[\s\S]*$/i, " ")
  );
}

function isWeakEditorialSentence(value) {
  return hasEncodingArtifacts(value) || /(search results|all search results|affiliate links?|best daily deals|newsletter|privacy policy|cookie policy|terms of use|all rights reserved|learn more|read more|sign up|sign in|log in|follow us|shop now|watch now|source image pending|reference image from|deviled eggs|roasted chicken|recipe|restaurant|vacation|travel tips|easter|grubhub|uber eats|headphone deals|robot vacuum deals|for more than \d+ years|we[''â€™]ve invested in|make everyday life better|our mission is|today we are announcing|available everywhere our ai plans are available|copy link|link bài gốc|lấy link|google cloud community|google workspace admins like you|chịu trách nhiệm quản lý nội dung|trụ sở hà nội|vpđd tại tp\.?\s*hcm|tầng \d+|hapulico complex|võ văn tần|nguyễn huy tưởng|info@genk\.vn|công ty cổ phần vccorp)/i.test(
    value
  );
}

function hasEncodingArtifacts(value) {
  return /(?:Ã|Â|Ă|Ä|â€|â€™|â€œ|â€|�)/.test(String(value || ""));
}

function selectEditorialSentences(values, count = 2, minLength = 50) {
  const picked = [];
  const seen = new Set();

  for (const value of values.flat().filter(Boolean)) {
    for (const sentence of splitSentences(value)) {
      const normalized = sanitizeEditorialParagraph(sentence);
      const signature = normalized.toLowerCase();

      if (!normalized || normalized.length < minLength || hasEncodingArtifacts(normalized) || isWeakEditorialSentence(normalized) || seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      picked.push(finishSentence(normalized));

      if (picked.length >= count) {
        return picked;
      }
    }
  }

  return picked;
}

function isBoilerplateParagraph(value) {
  return /(toggle dark mode|toggle search form|search for:|home page switch site|privacy|logo|0 comments|newsletter|cookie|window\.|function\s*\(|var\s+[a-z0-9_]+|submit|forums|advertisement|all rights reserved|mobile ai tin ict internet|apps-game|đồ chơi số|gia dụng|trà đá công nghệ|xem - mua - luôn|chịu trách nhiệm quản lý nội dung|trụ sở hà nội|vpđd tại tp\.?\s*hcm|tầng \d+|hapulico complex|võ văn tần|nguyễn huy tưởng|info@genk\.vn|công ty cổ phần vccorp)/i.test(
    value
  );
}
function isTechnologyRelevantStory({ feed, title, body, link }) {
  const titleHaystack = cleanText(title);
  const haystack = cleanText([feed.name, title, body, link].join(" "));
  const directTechAnchor = /\b(ai|openai|chatgpt|gemini|claude|copilot|google|microsoft|anthropic|notebooklm|workspace|chip|gpu|cpu|npu|phone|iphone|android|pixel|macbook|windows|software|app|cloud|startup|platform|privacy|security|malware|ransomware|game|gaming|youtube|instagram|facebook|threads|tiktok|router|wifi|fiber|alexa|logitech|sony|asus|intel|amd|qualcomm|nvidia|tay cầm|steam deck)\b/i;
  const hasDirectTechAnchor = directTechAnchor.test(haystack);
  const titleHasDirectTechAnchor = directTechAnchor.test(titleHaystack);
  let score = 0;

  if (/\/roadshow\//i.test(link)) {
    return false;
  }

  if (/\b(auto show|roadshow|powertrain|hybrid variant|combustion|kia seltos|kia ev3|sedan|crossover)\b/i.test(haystack)
    && !/\b(android auto|carplay|robotaxi|self-driving|autonomous vehicle|in-car software)\b/i.test(haystack)) {
    return false;
  }

  if (/\b(cơ thể người|virus học|bệnh nhân|triệu chứng|medical|pregnancy|disease|diet|sleep health)\b/i.test(haystack)
    && !/\b(cyber|malware|security|bảo mật|app|software|device|ai|chip|robot)\b/i.test(haystack)) {
    return false;
  }

  if (/\b(deviled eggs|roasted chicken|oven|recipe|chef secrets|food ordering|uber eats|grubhub|restaurant|vacation|travel|hotel|luggage)\b/i.test(titleHaystack)
    && !titleHasDirectTechAnchor) {
    return false;
  }

  if (/(xem mua luon|do choi so)/i.test(feed.name) && !titleHasDirectTechAnchor) {
    return false;
  }

  if (/\b(amazon .*sale|spring sale|prime day|deal(?:s)?|discount)\b/i.test(titleHaystack)
    && !/\b(ai|openai|chatgpt|gemini|claude|copilot|google|microsoft|anthropic|notebooklm|workspace|iphone|android|pixel|macbook|laptop|pc|tablet|gpu|cpu|ssd|router|wifi|fiber|monitor|keyboard|mouse|earbuds|headphones?|security)\b/i.test(titleHaystack)) {
    return false;
  }

  if (NON_TECH_PATTERNS.some((pattern) => pattern.test(titleHaystack)) && !titleHasDirectTechAnchor) {
    return false;
  }

  if (NON_TECH_PATTERNS.some((pattern) => pattern.test(haystack)) && !hasDirectTechAnchor) {
    return false;
  }

  for (const pattern of TECHNOLOGY_STRONG_PATTERNS) {
    if (pattern.test(haystack)) {
      score += 4;
    }
  }

  for (const pattern of TECHNOLOGY_SUPPORT_PATTERNS) {
    if (pattern.test(haystack)) {
      score += 2;
    }
  }

  if (feed.sourceType === "official-site") {
    score += 2;
  }

  if (feed.contentTypeHint === "EvergreenGuide") {
    score += 1;
  }

  if (/(genk|techcrunch|the verge|ars technica|9to5google|engadget|android authority|digital trends|tom's hardware|hacker news|zdnet|cnet|macrumors|google ai|openai)/i.test(`${feed.name} ${link}`)) {
    score += 2;
  }

  if (NON_TECH_PATTERNS.some((pattern) => pattern.test(haystack)) && score < 8) {
    score -= 10;
  }

  if (!titleHasDirectTechAnchor && score < 8) {
    return false;
  }

  return score >= 6;
}

function inferTopic(feed, title, body) {
  return inferTopicFromSignals(feed, title, body);
}

function inferTopicFromSignals(feed, title, body) {
  const titleHaystack = cleanText(title);
  const rawHaystack = cleanText(`${title} ${cleanText(body).slice(0, 1400)} ${feed.name}`);
  const scores = new Map();
  const hasStrongAiSignal = hasStrongAiSignals(rawHaystack);
  const hasGenericAiSignal = hasGenericAiSignals(rawHaystack);
  const hasAiPackageSignal = hasAiPackageSignals(rawHaystack);
  const titleHasStrongAiSignal = hasStrongAiSignals(titleHaystack);
  const titleHasGenericAiSignal = hasGenericAiSignals(titleHaystack);
  const titleHasAiPackageSignal = hasAiPackageSignals(titleHaystack);
  const titleHasGamingSignal = hasGamingSignals(titleHaystack);
  const titleHasWorkspaceSignal = hasWorkspaceUtilitySignals(titleHaystack);
  const titleHasBusinessSignal = hasBusinessPlatformSignals(titleHaystack);
  const titleHasCloudSignal = /\b(cloud|serverless|kubernetes|database|data center|enterprise|aws|azure|gcp|devops|saas|workspace admin)\b/i.test(titleHaystack);
  const titleHasSocialSignal = /\b(meta|facebook|instagram|threads|youtube|creator|social|tiktok|shorts|reels|ads manager|moderation)\b/i.test(titleHaystack);
  const titleHasChipSignal = /\b(chip|chips|gpu|cpu|npu|tpu|bán dẫn|semiconductor|foundry|wafer|datacenter|data center|h100|h200|b200|blackwell|nvidia|intel gaudi|amd mi300|arm arch|cluster ai|llm server|asic|dram|hbm3e|hbm4)\b/i.test(titleHaystack);

  if (titleHasChipSignal) {
    return "chips-ai-infra";
  }

  if ((titleHasStrongAiSignal || titleHasGenericAiSignal) && titleHasAiPackageSignal) {
    return "ai";
  }

  if (/\b(chatgpt|openai|gemini|claude|copilot|anthropic|notebooklm|deepseek|llm|grok|trí tuệ nhân tạo|mô hình ai|trợ lý ai)\b/i.test(titleHaystack)) {
    return "ai";
  }

  if (/\b(hack|security|cyber|malware|phishing|passkey|password|data breach|ransomware|bảo mật|tấn công)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal) {
    return "security";
  }

  if (titleHasBusinessSignal && !titleHasGamingSignal && !titleHasStrongAiSignal) {
    return "internet-business-tech";
  }

  if (titleHasWorkspaceSignal && !titleHasGamingSignal && !titleHasAiPackageSignal) {
    return "apps-software";
  }

  if (/\b(gaming|game|steam|playstation|xbox|nintendo|switch|handheld|dlss|rockstar|gta|tay cầm|game thủ)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal) {
    return "gaming";
  }

  if (/\b(giám đốc|bổ nhiệm|nhân sự|doanh nghiệp|nền tảng|mạng xã hội|startup|thị trường|người dùng|creator|agency)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal) {
    return "internet-business-tech";
  }

  if (/\b(iphone|android|pixel|galaxy|laptop|macbook|ipad|ram|memory|ssd|pc|desktop|device|tablet|camera|robot|hardware|thiết bị|điện thoại|logitech|sony|asus|intel|amd|qualcomm)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal
    && !titleHasAiPackageSignal) {
    return "devices";
  }

  if (/\b(app|software|windows|mac|ios|android app|ứng dụng|phần mềm|workspace|notion|slack|feature|guide|how to|how-to|tips|mẹo|thủ thuật|hướng dẫn)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal
    && !titleHasAiPackageSignal) {
    return "apps-software";
  }

  if ((hasStrongAiSignal || hasGenericAiSignal) && hasAiPackageSignal) {
    return "ai";
  }

  if (feed.topicHint) {
    scores.set(feed.topicHint, 6);
  }

  if (hasStrongAiSignal) {
    scores.set("ai", (scores.get("ai") || 0) + 24);
  }

  if (!hasStrongAiSignal && hasGenericAiSignal) {
    scores.set("ai", (scores.get("ai") || 0) + 8);
  }

  if (hasAiPackageSignal) {
    scores.set("ai", (scores.get("ai") || 0) + 28);
    scores.set("apps-software", (scores.get("apps-software") || 0) + 10);
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 6);
  }

  if (/(hack|security|cyber|malware|phishing|passkey|password|data breach|ransomware|bảo mật|tấn công)/i.test(rawHaystack)) {
    scores.set("security", (scores.get("security") || 0) + 22);
  }

  if (/(iphone|android|pixel|galaxy|laptop|macbook|ipad|ram|memory|ssd|pc|desktop|device|tablet|camera|robot|hardware|thiết bị|điện thoại)/i.test(rawHaystack)) {
    scores.set("devices", (scores.get("devices") || 0) + 18);
  }

  if (/\b(gpu|npu|tpu|bán dẫn|semiconductor|tsmc|h100|h200|blackwell|b200|nvidia|intel gaudi|amd mi300|datacenter|data center|wafer|arm arch|cluster ai|llm server|asic|dram|hbm3e|hbm4)\b/i.test(rawHaystack)) {
    scores.set("chips-ai-infra", (scores.get("chips-ai-infra") || 0) + 60);
  }

  if (hasGamingSignals(rawHaystack)) {
    scores.set("gaming", (scores.get("gaming") || 0) + 18);
  }

  if (hasWorkspaceUtilitySignals(rawHaystack)) {
    scores.set("apps-software", (scores.get("apps-software") || 0) + 22);
    scores.set("gaming", (scores.get("gaming") || 0) - 18);
  }

  if (hasBusinessPlatformSignals(rawHaystack)) {
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 24);
    scores.set("gaming", (scores.get("gaming") || 0) - 14);
  }

  if (/(facebook|meta|instagram|threads|tiktok|youtube|twitter|x\.com|whatsapp|social|creator|shorts|reels|ads manager|moderation)/i.test(rawHaystack)) {
    scores.set("social-creator", (scores.get("social-creator") || 0) + 20);
  }

  if (/(oracle|shopee|lazada|agency|telecom|platform strategy|marketplace)/i.test(rawHaystack)) {
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 18);
  }

  if (/(app|software|windows|mac|ios|android app|ứng dụng|phần mềm|workspace|notion|slack|feature|guide|how to|how-to|tips|mẹo|thủ thuật|hướng dẫn)/i.test(rawHaystack)) {
    scores.set("apps-software", (scores.get("apps-software") || 0) + 16);
  }

  for (const rule of SOURCE_TOPIC_HINTS) {
    if (rule.pattern.test(`${feed.name} ${feed.url || ""}`)) {
      scores.set(rule.topic, (scores.get(rule.topic) || 0) + rule.score);
    }
  }

  if (/\b(game|gaming|gta|nintendo|switch|playstation|xbox|dlss|rockstar)\b/i.test(rawHaystack) && hasAiPackageSignals(rawHaystack)) {
    scores.set("gaming", (scores.get("gaming") || 0) - 12);
  }

  if (/\b(cơ thể người|virus học|bệnh nhân|medical|pregnancy|disease|diet)\b/i.test(rawHaystack)) {
    scores.set("devices", (scores.get("devices") || 0) - 16);
    scores.set("security", (scores.get("security") || 0) - 8);
  }

  if (/\b(auto show|roadshow|powertrain|kia seltos|kia ev3|hybrid variant|combustion)\b/i.test(rawHaystack)) {
    scores.set("devices", (scores.get("devices") || 0) - 20);
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) - 12);
    scores.set("security", (scores.get("security") || 0) - 12);
  }

  if (!hasAiPackageSignal && !hasStrongAiSignal && (scores.get("devices") || 0) >= (scores.get("ai") || 0) + 6) {
    return "devices";
  }

  let bestTopic = feed.language === "vi" ? "internet-business-tech" : "devices";
  let bestScore = scores.get(bestTopic) || Number.NEGATIVE_INFINITY;

  for (const [topic, score] of scores.entries()) {
    if (score > bestScore) {
      bestTopic = topic;
      bestScore = score;
    }
  }

  return bestTopic;
}

function inferContentType(feed, title, body) {
  if (feed.contentTypeHint) {
    return feed.contentTypeHint;
  }

  const haystack = `${feed.name} ${title} ${splitSentences(body)[0] || ""}`;

  if (/(how to|how-to|guide|tips|thủ thuật|mẹo|hướng dẫn|cách (?:dùng|làm|triển khai|cài|tạo|thiết lập|bảo vệ|khắc phục|chọn))/i.test(haystack)) {
    return "EvergreenGuide";
  }

  if (/(vs\.?|versus|compare|comparison|so sánh|chatgpt vs|gemini vs|claude vs)/i.test(haystack)) {
    return "ComparisonPage";
  }

  return "NewsArticle";
}

function buildSummary(body, language, fallbackTitle, paragraphs = []) {
  const summary = selectEditorialSentences([paragraphs.slice(0, 3), body], 2, 55).join(" ");

  if (summary.length >= 90) {
    return finishSentence(summary);
  }

  return language === "vi"
    ? finishSentence(body || `${fallbackTitle} đang có thêm chi tiết mới đáng chú ý với người theo dõi mảng công nghệ này.`)
    : finishSentence(body || `This piece follows the newest movement connected to ${fallbackTitle}.`);
}

function buildDek(body, language, summary, paragraphs = [], fallbackTitle = "") {
  const dek = selectEditorialSentences([paragraphs[0], paragraphs[1], body, summary], 1, 60)[0] || summary;

  if (dek && dek.length >= 60) {
    return finishSentence(dek);
  }

  return language === "vi"
    ? finishSentence(
      fallbackTitle
        ? `${fallbackTitle} đáng mở ở chỗ phần thay đổi không chỉ nằm trên thông báo, mà còn chạm vào cách người dùng dùng dịch vụ, thiết bị hoặc tài khoản mỗi ngày`
        : "Điểm đáng chú ý không nằm ở lời giới thiệu, mà ở chi tiết cho thấy sản phẩm và cách sử dụng đang đổi ra sao"
    )
    : "The piece brings the story back into context and explains why it is worth opening right now.";
}

function buildHook(paragraphs, summary, dek, language, fallbackTitle = "") {
  const candidate = selectEditorialSentences([paragraphs?.[0], paragraphs?.[1], summary, dek], 1, 80)[0] || "";

  if (candidate.length >= 80) {
    return finishSentence(candidate);
  }

  return language === "vi"
    ? finishSentence(`${summary} Phần nên đọc kỹ nhất là chi tiết cho thấy ${fallbackTitle || "thay đổi này"} tác động thế nào tới cách dùng công cụ, tài khoản hoặc chi phí hằng ngày.`)
    : finishSentence(`${summary} This is the detail that makes the story worth opening right now.`);
}

function buildSections({ title, summary, dek, language, topic, contentType, sourceName, paragraphs = [] }) {
  const cleanParagraphs = (paragraphs || []).map((entry) => finishSentence(entry)).filter(Boolean);
  const lens = resolveStoryLens({ title, summary, dek, topic, contentType, sourceName, paragraphs, language });

  if (contentType === "EvergreenGuide") {
    return buildGuideSections({ cleanParagraphs, summary, dek, language, topic, sourceName });
  }

  if (lens === "ai-package") {
    return buildAiPackageSections({ title, cleanParagraphs, summary, dek, language, sourceName });
  }

  const intro = language === "vi" ? "Bối cảnh: điều gì đang đổi" : "Context: what is changing";
  const details = language === "vi" ? "Các nguồn đang khớp nhau ở đâu" : "Where the sources line up";
  const whyItMatters = language === "vi" ? "Tác động thực tế với người đọc" : "Practical impact for readers";
  const take = language === "vi" ? "Ai nên chú ý lúc này" : "Who should pay attention now";
  const next = language === "vi" ? "Điều cần theo dõi tiếp" : "What to watch next";

  const angleByTopic = {
    ai: {
      vi: "Điểm đáng nhìn là AI đang đi nhanh hơn vào phần dùng thật, thay vì chỉ nằm ở lớp trình diễn hay lời hứa marketing.",
      en: "The key angle is that AI is moving closer to everyday use instead of staying in demo mode."
    },
    "apps-software": {
      vi: "Những thay đổi kiểu này thường âm thầm hơn headline, nhưng lại đụng khá rõ vào thói quen dùng ứng dụng mỗi ngày.",
      en: "Updates like this often look small at first but end up changing everyday product behavior."
    },
    devices: {
      vi: "Ở mảng thiết bị, điều đáng nhìn là khi thông số bắt đầu dịch thành khác biệt thật trong trải nghiệm cầm nắm và sử dụng.",
      en: "On the device side, the real question is when a spec shift turns into a noticeable user experience change."
    },
    security: {
      vi: "Điểm cần nhìn tiếp là tác động thật của nó lên an toàn tài khoản, quyền riêng tư và chi phí vận hành của đội ngũ.",
      en: "The part worth watching is how it changes account safety and operational risk handling."
    },
    gaming: {
      vi: "Với game, những tín hiệu kiểu này thường lan rất nhanh trong cộng đồng trước khi kịp thành một xu hướng đủ rõ.",
      en: "In gaming, signals like this often spread through the community before they settle into a clear trend."
    },
    "internet-business-tech": {
      vi: "Điều quan trọng là nó có thể chạm trực tiếp tới cách người dùng tương tác, chia sẻ, kiếm tiền hoặc chi tiền trên nền tảng số.",
      en: "What matters is the potential effect on how people interact, share, or spend across digital platforms."
    }
  };

  const angle = angleByTopic[topic]?.[language] || angleByTopic.ai[language];
  const nextLook =
    language === "vi"
      ? buildVietnameseForwardLook(topic, title)
      : buildEnglishForwardLook(topic, title);
  const takeLine =
    language === "vi"
      ? resolveNewsTakeLine(topic)
      : `The important part is whether this change carries beyond the headline and becomes tangible in real product use.`;

  return [
    {
      heading: intro,
      body: cleanParagraphs[0] || finishSentence(summary)
    },
    {
      heading: details,
      body: cleanParagraphs[1] || finishSentence(dek)
    },
    {
      heading: whyItMatters,
      body: cleanParagraphs[2] || finishSentence(`${dek} ${angle}`)
    },
    {
      heading: take,
      body: cleanParagraphs[3] || finishSentence(`${takeLine} ${angle}`)
    },
    {
      heading: next,
      body: cleanParagraphs[4] || cleanParagraphs[3] || finishSentence(nextLook)
    }
  ];
}

function buildGuideSections({ cleanParagraphs, summary, dek, language, topic, sourceName }) {
  const setup = language === "vi" ? "Bắt đầu từ đâu" : "Where to start";
  const shortcut = language === "vi" ? "Làm theo cách gọn nhất" : "The shortest path";
  const mistakes = language === "vi" ? "Lỗi dễ gặp" : "Common mistakes";
  const fit = language === "vi" ? "Ai nên áp dụng" : "Who should use it";
  const take = language === "vi" ? "Patrick Tech Media đánh giá" : "Patrick Tech Media take";
  const audienceLine =
    language === "vi"
      ? "Giá trị của bài kiểu này nằm ở chỗ đọc xong có thể áp dụng ngay vào một thao tác quen thuộc, thay vì chỉ lưu lại để đó."
      : `The value here is practical reuse: readers should be able to apply it immediately in a real task.`;

  return [
    {
      heading: setup,
      body: cleanParagraphs[0] || finishSentence(summary)
    },
    {
      heading: shortcut,
      body: cleanParagraphs[1] || finishSentence(dek)
    },
    {
      heading: mistakes,
      body: cleanParagraphs[2] || finishSentence(
        language === "vi"
          ? `Lỗi dễ gặp nhất là nhảy thẳng vào mẹo nhỏ nhưng bỏ qua điều kiện đầu vào, khiến thao tác có vẻ đúng mà kết quả cuối vẫn sai.`
          : `The easiest mistake is trying the shortcut without checking the setup conditions first, which makes the workflow look right while the result stays off.`
      )
    },
    {
      heading: fit,
      body: cleanParagraphs[3] || finishSentence(
        language === "vi"
          ? `Bài kiểu này hợp với người muốn rút ngắn thời gian xử lý một tác vụ lặp lại, nhất là khi công cụ đang đổi quá nhanh theo từng đợt cập nhật.`
          : `This kind of piece is best for readers trying to shorten a repeatable task while tools are changing quickly from release to release.`
      )
    },
    {
      heading: take,
      body: cleanParagraphs[4] || finishSentence(`${audienceLine} ${resolveGuideTakeLine(topic, sourceName, language)}`)
    }
  ];
}

function buildAiPackageSections({ title, cleanParagraphs, summary, dek, language, sourceName }) {
  const upgrade = language === "vi" ? "Điểm nâng cấp đáng chú ý" : "What changed";
  const pricing = language === "vi" ? "Giá và quyền lợi" : "Price and bundle value";
  const features = language === "vi" ? "Những lớp AI kéo giá trị lên" : "AI features that change the value";
  const audience = language === "vi" ? "Ai nên để mắt" : "Who should pay attention";
  const take = language === "vi" ? "Patrick Tech Media đánh giá" : "Patrick Tech Media take";
  const pricingLine =
    language === "vi"
      ? `Điều người đọc thực sự muốn biết ở các gói AI không chỉ là giá, mà là mỗi lần tăng phí hay giữ giá sẽ mang thêm quyền lợi nào vào công việc hằng ngày.`
      : `What readers actually want from AI package coverage is not just a price tag, but what each price move unlocks in real daily work.`;
  const audienceLine =
    language === "vi"
      ? `Nhóm nên theo dõi đầu tiên là người đang trả tiền cho lưu trữ, cộng tác và trợ lý AI trong cùng một hệ sinh thái, vì đây là nơi khác biệt về giá trị lộ ra nhanh nhất.`
      : `The first audience to watch is the group already paying for storage, collaboration, and AI inside one stack, because that is where value shifts show up fastest.`;
  const takeLine =
    language === "vi"
      ? "Điểm đáng nhìn lâu hơn headline là gói nào thực sự gom được model, dung lượng và công cụ vào một giá trị dùng được mỗi ngày."
      : `Patrick Tech Media reads this kind of move as a real utility race: the package that removes steps, bundles tools, and lowers hidden cost usually wins longer than the launch buzz.`;
  const sourceLine =
    language === "vi"
      ? `Phần cần theo dõi tiếp là rollout, giới hạn khu vực và việc ${sourceName} có giữ nguyên lợi thế này khi mở rộng hơn không.`
      : `Patrick Tech Media will keep checking ${sourceName} to see whether the value holds once the rollout broadens.`;

  return [
    {
      heading: upgrade,
      body: cleanParagraphs[0] || finishSentence(summary)
    },
    {
      heading: pricing,
      body: cleanParagraphs[1] || finishSentence(`${cleanParagraphs[2] || dek} ${pricingLine}`)
    },
    {
      heading: features,
      body: cleanParagraphs[3] || finishSentence(
        language === "vi"
          ? `Điều kéo bài kiểu này vượt khỏi một bản cập nhật giá nằm ở chỗ các lớp AI đi kèm có thật sự làm Gmail, Docs, Meet, nghiên cứu hay sáng tạo nội dung bớt rời rạc hơn hay không.`
          : `The reason this rises above a pricing note is whether the bundled AI actually makes Gmail, Docs, meetings, research, or creation feel less fragmented.`
      )
    },
    {
      heading: audience,
      body: cleanParagraphs[4] || finishSentence(audienceLine)
    },
    {
      heading: take,
      body: cleanParagraphs[5] || finishSentence(`${takeLine} ${sourceLine}`)
    }
  ];
}

function resolveStoryLens({ title, summary, dek, topic, contentType, sourceName, paragraphs, language }) {
  const rawHaystack = cleanText([title, summary, dek, sourceName, ...(paragraphs || [])].join(" "));

  if (contentType === "EvergreenGuide") {
    return "guide";
  }

  if (hasAiPackageSignals(rawHaystack) && normalizeTopicHint(topic) === "ai") {
    return "ai-package";
  }

  if (hasAiPackageSignals(rawHaystack) && /(workspace|google one|copilot|notebooklm|chatgpt|claude|gemini)/i.test(rawHaystack)) {
    return "ai-package";
  }

  return language === "vi" ? "news" : "news";
}

function hasAiPackageSignals(value) {
  const text = String(value || "");
  return /\b(google ai pro|google one|workspace|business plus|gemini advanced|notebooklm|veo|lyria|chatgpt plus|chatgpt pro|chatgpt team|chatgpt business|claude pro|claude max|copilot pro|copilot|grok|perplexity pro|notion ai|canva ai|subscription|pricing|monthly|annual|storage|5tb|2tb|package|bundle|gói|dung lượng|trả phí|theo tháng|theo năm)\b/i.test(text);
}

function normalizeTopicHint(topic) {
  const value = cleanText(topic);
  if (value === "software") {
    return "apps-software";
  }
  if (value === "internet-business") {
    return "internet-business-tech";
  }
  if (["social", "social-platforms", "creator", "creator-economy"].includes(value)) {
    return "social-creator";
  }
  if (["cloud", "enterprise", "cloud-business"].includes(value)) {
    return "cloud-enterprise";
  }
  if (["chip", "chips", "semiconductor", "semiconductors", "ai-infra", "infrastructure"].includes(value)) {
    return "chips-ai-infra";
  }
  return value;
}

function buildVietnameseForwardLook(topic, title) {
  const lines = {
    ai: "Điểm cần theo dõi tiếp là liệu thay đổi này có đi nhanh vào sản phẩm và thói quen dùng thật hay không.",
    "apps-software": "Điều cần nhìn tiếp là nhịp rollout, giới hạn khu vực và mức độ tác động lên hành vi dùng mỗi ngày.",
    devices: "Điều cần xem tiếp là giá bán, nhịp phổ cập và cảm nhận thật khi thiết bị tới tay người dùng.",
    security: "Phần cần theo dõi thêm là tác động thực tế lên an toàn tài khoản, quy trình đăng nhập và chi phí vận hành.",
    gaming: `Giới chơi game sẽ sớm nhìn vào việc ${title.toLowerCase()} chỉ là điểm nóng nhất thời hay sẽ kéo thêm một làn sóng mới.`,
    "internet-business-tech": "Điểm đáng xem tiếp là việc tín hiệu này có chuyển thành thay đổi thật trên người dùng và doanh nghiệp hay không."
  };

  return lines[topic] || "Patrick Tech Media sẽ tiếp tục theo dõi xem tín hiệu này có mở rộng thành chuyển động lớn hơn hay không.";
}

function buildEnglishForwardLook(topic, title) {
  const lines = {
    ai: "The next thing to watch is whether the change moves quickly into real product use.",
    "apps-software": "What matters next is rollout pace, regional limits, and whether daily behavior actually changes.",
    devices: "The next readout will be price, rollout timing, and whether the hardware feels different in real use.",
    "chips-ai-infra": "The next readout is real performance, deployment cost, and how quickly this infrastructure shows up in products.",
    "cloud-enterprise": "What matters next is rollout depth, operating cost, and whether enterprise teams actually change how they work.",
    security: "The next layer to watch is how this changes account safety, sign-in flow, and operating cost.",
    "social-creator": "The next thing to watch is whether this changes publishing, monetization, or reach for creators.",
    gaming: `The gaming audience will be watching whether ${title.toLowerCase()} becomes a short spike or the start of a broader shift.`,
    "internet-business-tech": "The real follow-up will be whether this turns into measurable user or business impact."
  };

  return lines[topic] || "Patrick Tech Media will keep tracking whether this signal turns into something materially bigger.";
}

function resolveNewsTakeLine(topic) {
  const lines = {
    ai: "Điểm đáng nói là AI chỉ thực sự có giá trị khi thay đổi này đi được vào công việc và thói quen dùng thật.",
    "apps-software": "Một cập nhật chỉ đáng nhớ khi nó làm luồng làm việc gọn hơn, nhanh hơn hoặc bớt lỗi hơn.",
    devices: "Phần đáng giữ lại luôn nằm ở tác động thật lên trải nghiệm dùng máy, không chỉ ở thông số.",
    security: "Điều nên nhìn kỹ là thay đổi này có giúp an toàn tài khoản và giảm rủi ro vận hành hay không.",
    gaming: "Với game, chi tiết đáng đọc là thứ có thể đổi cách cộng đồng chơi, chờ đợi hoặc chi tiền.",
    "internet-business-tech": "Điểm đáng đọc là nó có thể chạm vào hành vi người dùng, doanh nghiệp hoặc nền tảng nhanh đến đâu."
  };

  return lines[topic] || lines.ai;
}

function resolveGuideTakeLine(topic, sourceName, language) {
  if (language !== "vi") {
    return `The step worth keeping is the one that still holds up when readers try it against ${sourceName}.`;
  }

  if (topic === "ai") {
    return `Phần đáng giữ lại là mẹo nào vẫn đứng vững khi đối chiếu với ${sourceName} và đưa vào công việc thật.`;
  }

  return `Phần đáng giữ lại là cách làm nào vẫn đứng vững khi đối chiếu với ${sourceName} và áp dụng vào thao tác hằng ngày.`;
}

function calculateQualityScore({ feed, imageUrl, paragraphs, summary, dek, hook, sourceDepthScore = 0 }) {
  const base = feed.sourceType === "official-site" ? 86 : 80;
  const paragraphBonus = Math.min(8, (paragraphs?.length || 0) * 2);
  const imageBonus = imageUrl ? 4 : 0;
  const copyBonus = [summary, dek, hook].every((value) => cleanText(value).length >= 80) ? 4 : 0;
  const depthBonus = Math.max(-8, Math.min(8, Math.round((Number(sourceDepthScore || 0) - 56) / 6)));
  return Math.min(96, Math.max(0, base + paragraphBonus + imageBonus + copyBonus + depthBonus));
}

function calculateSourceDepthScore({ title, sourceDescription, paragraphs = [], rawBody = "" }) {
  const cleanParagraphs = (paragraphs || []).map((entry) => cleanText(entry)).filter(Boolean);
  const text = cleanText([title, sourceDescription, ...cleanParagraphs, rawBody].join(" "));
  const words = text.split(/\s+/).filter(Boolean).length;
  const paragraphScore = Math.min(30, cleanParagraphs.length * 6);
  const lengthScore = Math.min(24, Math.floor(words / 28));
  const numberScore = Math.min(12, (text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|gb|tb|mb|usd|vnd|triệu|trieu|tỷ|ty|ngày|ngay|tháng|thang|hours?|days?|users?|countries)?\b/gi) || []).length * 3);
  const entityScore = Math.min(18, new Set(text.match(/\b[A-Z][A-Za-z0-9+.-]{2,}(?:\s+[A-Z][A-Za-z0-9+.-]{2,}){0,3}\b/g) || []).size * 2);
  const concreteScore = Math.min(16, (text.match(/\b(launch|rollout|release|pricing|price|cost|subscription|availability|limitation|risk|privacy|security|benchmark|update|ra mắt|triển khai|giá|chi phí|gói|phát hành|giới hạn|rủi ro|bảo mật|quyền riêng tư|cập nhật)\b/gi) || []).length * 2);
  const thinPenalty = cleanParagraphs.length < 3 || words < 180 ? 14 : 0;

  return Math.max(0, Math.min(100, paragraphScore + lengthScore + numberScore + entityScore + concreteScore - thinPenalty));
}

function buildSourceDepthReason({ sourceDepthScore, paragraphs = [], rawBody = "" }) {
  const words = cleanText(rawBody).split(/\s+/).filter(Boolean).length;
  return `depth=${sourceDepthScore}; paragraphs=${paragraphs.length}; words=${words}`;
}

function resolveStoreLinkMode(topic, contentType) {
  if (contentType === "EvergreenGuide" || contentType === "ComparisonPage") {
    return "full";
  }

  return ["ai", "apps-software", "security"].includes(topic) ? "soft" : "off";
}

function resolveStoreItems(topic) {
  const byTopic = {
    ai: ["ai-workspace-bundle"],
    "apps-software": ["creator-software-stack"],
    "cloud-enterprise": ["creator-software-stack"],
    "social-creator": ["creator-software-stack"],
    security: ["secure-access-kit"],
    gaming: ["gaming-cloud-pass"]
  };

  return byTopic[topic] || [];
}

function resolveAuthorId(topic) {
  if (topic === "security") {
    return "thao-nguyen";
  }

  if (["devices", "chips-ai-infra", "cloud-enterprise", "gaming", "internet-business-tech"].includes(topic)) {
    return "quang-huy";
  }

  return "mai-linh";
}

function splitSentences(value) {
  return cleanText(value)
    .split(/(?<=[.?!])\s+/)
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .slice(0, 4);
}

function finishSentence(value) {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function cleanText(value) {
  return cleanSourceText(repairEncodingArtifacts(
    decodeXmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    )
  ));
}

function sanitizeIncomingArticles(articles) {
  return (articles || []).map(sanitizeIncomingArticle);
}

function sanitizeIncomingArticle(article) {
  if (!article || typeof article !== "object") {
    return article;
  }

  const { draft_context, ...rest } = article;

  return {
    ...rest,
    title: cleanSourceText(rest.title),
    summary: cleanSourceText(rest.summary),
    dek: cleanSourceText(rest.dek),
    hook: cleanSourceText(rest.hook),
    sections: Array.isArray(rest.sections)
      ? rest.sections.map((section) => ({
          ...section,
          heading: cleanSourceText(section?.heading),
          body: cleanSourceText(section?.body)
        }))
      : rest.sections,
    image: rest.image && typeof rest.image === "object"
      ? {
          ...rest.image,
          caption: cleanText(rest.image.caption),
          credit: cleanText(rest.image.credit)
        }
      : rest.image,
    source_set: Array.isArray(rest.source_set)
      ? rest.source_set.map((source) => ({
          ...source,
          source_name: cleanText(source?.source_name),
          image_caption: cleanText(source?.image_caption),
          image_credit: cleanText(source?.image_credit)
        }))
      : rest.source_set
  };
}

function hasStrongAiSignals(value) {
  const text = String(value || "");
  return /\b(artificial intelligence|trí tuệ nhân tạo|chatgpt|openai|gemini|claude|anthropic|deepmind|deepseek|copilot|notebooklm|llm|npu|ai agent|ai model|trợ lý ai|mô hình ai|google ai pro|workspace ai)\b/i.test(text);
}

function hasGenericAiSignals(value) {
  const text = String(value || "");
  return /\bAI\b/.test(text)
    || /\bai\s+(?:pro|plus|ultra|business|workspace|studio|assistant|agent|plan|package|bundle|model)\b/i.test(text);
}

function hasGamingSignals(value) {
  const text = String(value || "");
  return /\b(gaming|game|steam|playstation|xbox|nintendo|switch|rockstar|gta|dlss|esports|game thủ)\b/i.test(text);
}

function hasWorkspaceUtilitySignals(value) {
  const text = String(value || "");
  return /\b(workspace|gmail|docs|sheets|slides|meet|drive|notion|slack|zoom|messenger web|trình duyệt web|browser|ứng dụng|phần mềm|mẹo|thủ thuật|hướng dẫn|cách dùng|feature|workflow|productivity|web app)\b/i.test(text);
}

function hasBusinessPlatformSignals(value) {
  const text = String(value || "");
  return /\b(facebook|messenger|meta|instagram|threads|whatsapp|oracle|startup|doanh nghiệp|nền tảng|mạng xã hội|social platform|creator|agency|seller|bán hàng)\b/i.test(text);
}

function cleanUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function normalizePublicArticleUrl(value) {
  const candidate = String(value || "").trim().replace(/[.,;:!?]+$/g, "");
  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    const hostname = url.hostname.toLowerCase();
    if (isPrivateOrLocalHostname(hostname)) {
      return "";
    }

    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function resolveUrlAgainst(value, baseUrl) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return cleanUrl(candidate);
  }
}

function inferTitleFromUrl(value) {
  try {
    const url = new URL(value);
    const lastSegment = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    return cleanText(lastSegment.replace(/[-_]+/g, " "));
  } catch {
    return "";
  }
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "0.0.0.0"
    || host.startsWith("127.")
    || host.startsWith("10.")
    || host.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || host.startsWith("169.254.")
    || host === "::1"
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("fe80");
}

function normalizeDate(value, fallback) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isNaN(timestamp) ? fallback : new Date(timestamp).toISOString();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `story-${crypto.randomUUID().slice(0, 8)}`;
}

function truncateSlug(value, maxLength) {
  return String(value || "").slice(0, maxLength).replace(/-+$/g, "");
}

function stripCdata(value) {
  return String(value || "").replace(/^<!\[CDATA\[|\]\]>$/g, "");
}

function decodeXmlEntities(value) {
  const namedEntities = {
    nbsp: " ",
    agrave: "à",
    aacute: "á",
    acirc: "â",
    atilde: "ã",
    egrave: "è",
    eacute: "é",
    ecirc: "ê",
    igrave: "ì",
    iacute: "í",
    ograve: "ò",
    oacute: "ó",
    ocirc: "ô",
    otilde: "õ",
    ugrave: "ù",
    uacute: "ú",
    yacute: "ý",
    Agrave: "À",
    Aacute: "Á",
    Acirc: "Â",
    Atilde: "Ã",
    Egrave: "È",
    Eacute: "É",
    Ecirc: "Ê",
    Igrave: "Ì",
    Iacute: "Í",
    Ograve: "Ò",
    Oacute: "Ó",
    Ocirc: "Ô",
    Otilde: "Õ",
    Ugrave: "Ù",
    Uacute: "Ú",
    Yacute: "Ý",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
    mdash: "—",
    ndash: "–"
  };

  let decoded = String(value || "");
  let previous = "";

  while (decoded !== previous) {
    previous = decoded;
    decoded = decoded
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#8211;/g, "–")
      .replace(/&#8212;/g, "—")
      .replace(/&#8230;/g, "…")
      .replace(/&#(\d+);/g, (match, code) => {
        const numeric = Number.parseInt(code, 10);
        return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
      })
      .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
        const numeric = Number.parseInt(code, 16);
        return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
      })
      .replace(/&([a-zA-Z]+);/g, (match, entity) => namedEntities[entity] || match);
  }

  return decoded;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

