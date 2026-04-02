import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { normalizeArticles, publishArticles } from "./newsroom-publish.mjs";
import { aggregateIncomingDrafts, buildEditorialCompanionArticles } from "../src/newsroom-synthesis.mjs";

const outputPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
const sourceUrl = process.env.NEWSROOM_PULL_URL || process.env.OPENCLAW_NEWSROOM_URL || "";
const sourceFile = process.env.NEWSROOM_PULL_FILE || process.env.OPENCLAW_NEWSROOM_FILE || "";
const sourceToken = process.env.NEWSROOM_PULL_TOKEN || process.env.OPENCLAW_NEWSROOM_TOKEN || "";
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
    topicHint: "gaming",
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
    topicHint: "devices",
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
    name: "CNET How To",
    url: "https://www.cnet.com/rss/how-to/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    topicHint: "apps-software",
    contentTypeHint: "EvergreenGuide",
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

if (sourceUrl) {
  try {
    const response = await fetch(sourceUrl, { headers });

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
  incomingArticles = await fetchFallbackArticles(now);
  sourceLabel = "curated-rss";
}

if (incomingArticles.length === 0) {
  console.log("No newsroom articles were collected. Nothing to publish.");
  process.exit(0);
}

const result = await publishArticles({
  incomingArticles,
  outputPath,
  replaceMode: true,
  now,
  databaseUrl: process.env.DATABASE_URL || ""
});

if (!result.changed) {
  console.log(`Newsroom already up to date from ${sourceLabel} at ${path.resolve(process.cwd(), outputPath)}`);
  process.exit(0);
}

console.log(`Refreshed ${result.publishedCount} article(s) from ${sourceLabel} into ${result.outputPath}`);

async function fetchFallbackArticles(timestamp) {
  const allArticles = [];

  for (const feed of fallbackFeeds) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "patrick-tech-media-refresh/1.0"
        }
      });

      if (!response.ok) {
        throw new Error(`Feed ${feed.name} returned ${response.status}`);
      }

      const xml = await response.text();
      const items = parseFeedItems(xml).slice(0, feed.limit);

      for (const item of items) {
        const mapped = await mapFeedItem(feed, item, timestamp);

        if (mapped) {
          allArticles.push(mapped);
        }
      }
    } catch (error) {
      console.warn(`Skipping ${feed.name}: ${error.message || error}`);
    }
  }

  const aggregated = aggregateIncomingDrafts(allArticles, timestamp);
  const companions = buildEditorialCompanionArticles(aggregated, timestamp);
  return [...aggregated, ...companions];
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
  const editorialParagraphs = relevantParagraphs.length ? relevantParagraphs : [];
  const rawBody = cleanText([sourceDescription, ...editorialParagraphs].join(" "));

  if (!rawBody) {
    return null;
  }

  if (!isTechnologyRelevantStory({ feed, title, body: rawBody, link })) {
    return null;
  }

  const inferenceText = cleanText([title, sourceDescription, ...editorialParagraphs.slice(0, 4)].join(" "));
  const topic = inferTopicFromSignals(feed, title, inferenceText);
  const contentType = inferContentType(feed, title, inferenceText);
  const summary = buildSummary(sourceDescription || rawBody, feed.language, title, editorialParagraphs);
  const dek = buildDek(sourceDescription || rawBody, feed.language, summary, editorialParagraphs);
  const hook = buildHook(editorialParagraphs, summary, dek, feed.language);
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
  const slug = slugify(title).slice(0, 96);
  const imageUrl = cleanUrl(item.imageUrl || snapshot.imageUrl);
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
    quality_score: calculateQualityScore({ feed, imageUrl, paragraphs: editorialParagraphs, summary, dek, hook }),
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
      link
    }
  };
}

async function fetchSourceSnapshot(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "patrick-tech-media-refresh/1.0"
      }
    });

    if (!response.ok) {
      return { description: "", imageUrl: "", paragraphs: [], bodyText: "" };
    }

    const html = await response.text();
    const description =
      readMetaContent(html, "property", "og:description") ||
      readMetaContent(html, "name", "description") ||
      "";
    const imageUrl =
      readMetaContent(html, "property", "og:image") ||
      readMetaContent(html, "name", "twitter:image") ||
      "";
    const paragraphs = extractArticleParagraphs(html);

    return {
      description: cleanText(description),
      imageUrl: cleanUrl(imageUrl),
      paragraphs,
      bodyText: paragraphs.join(" ")
    };
  } catch {
    return { description: "", imageUrl: "", paragraphs: [], bodyText: "" };
  }
}

function readMetaContent(html, attribute, value) {
  const firstPattern = new RegExp(`<meta[^>]+${attribute}=["']${escapeRegex(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegex(value)}["'][^>]*>`, "i");
  const match = html.match(firstPattern) || html.match(reversePattern);
  return decodeXmlEntities(match?.[1] || "");
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
    .filter((paragraph) => !isBoilerplateParagraph(paragraph) && !isWeakEditorialSentence(paragraph))
    .filter((paragraph, index, list) => list.findIndex((entry) => entry === paragraph) === index);
}

function filterRelevantParagraphs({ title, description, paragraphs = [] }) {
  const anchors = extractAnchorTerms(`${title} ${description}`);

  if (!paragraphs.length) {
    return [];
  }

  if (!anchors.length) {
    return paragraphs.slice(0, 4);
  }

  const scored = paragraphs.map((paragraph) => ({
    paragraph,
    score: scoreParagraphRelevance(paragraph, anchors)
  }));
  const strong = scored.filter((entry) => entry.score >= 2).map((entry) => entry.paragraph);

  if (strong.length >= 2) {
    return strong.slice(0, 6);
  }

  const fallback = scored.filter((entry) => entry.score >= 1).map((entry) => entry.paragraph);
  return fallback.slice(0, 4);
}

function pickRelevantLeadText({ title, values = [] }) {
  const cleanedValues = values.map((value) => cleanText(value)).filter(Boolean);
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
  return cleanText(
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

  if (/\b(gaming|game|steam|playstation|xbox|nintendo|switch|handheld|dlss|rockstar|gta|tay cầm|game thủ)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal) {
    return "gaming";
  }

  if (/\b(giám đốc|bổ nhiệm|nhân sự|doanh nghiệp|nền tảng|mạng xã hội|startup|thị trường|người dùng|creator|agency)\b/i.test(titleHaystack)
    && !titleHasStrongAiSignal) {
    return "internet-business-tech";
  }

  if (/\b(iphone|android|pixel|galaxy|laptop|macbook|ipad|chip|gpu|cpu|npu|ram|memory|ssd|pc|desktop|device|tablet|camera|robot|hardware|thiết bị|điện thoại|logitech|sony|asus|intel|amd|qualcomm|nvidia)\b/i.test(titleHaystack)
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

  if (/(iphone|android|pixel|galaxy|laptop|macbook|ipad|chip|gpu|cpu|npu|ram|memory|ssd|pc|desktop|device|tablet|camera|robot|hardware|thiết bị|điện thoại)/i.test(rawHaystack)) {
    scores.set("devices", (scores.get("devices") || 0) + 18);
  }

  if (/(gaming|game|steam|playstation|xbox|nintendo|switch|handheld|dlss|rockstar|gta)/i.test(rawHaystack)) {
    scores.set("gaming", (scores.get("gaming") || 0) + 18);
  }

  if (/(facebook|meta|instagram|threads|tiktok|youtube|twitter|x\.com|whatsapp|social|oracle|shopee|lazada|agency|creator)/i.test(rawHaystack)) {
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 20);
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
    ? finishSentence(body || `Bài viết bám theo chuyển động mới nhất liên quan tới ${fallbackTitle}.`)
    : finishSentence(body || `This piece follows the newest movement connected to ${fallbackTitle}.`);
}

function buildDek(body, language, summary, paragraphs = []) {
  const dek = selectEditorialSentences([paragraphs[0], paragraphs[1], body, summary], 1, 60)[0] || summary;

  if (dek && dek.length >= 60) {
    return finishSentence(dek);
  }

  return language === "vi"
    ? "Bài viết kéo câu chuyện về đúng bối cảnh, chốt phần mới đáng giữ lại và chỉ ra vì sao người đọc nên mở ngay lúc này."
    : "The piece brings the story back into context and explains why it is worth opening right now.";
}

function buildHook(paragraphs, summary, dek, language) {
  const candidate = selectEditorialSentences([paragraphs?.[0], paragraphs?.[1], summary, dek], 1, 80)[0] || "";

  if (candidate.length >= 80) {
    return finishSentence(candidate);
  }

  return language === "vi"
    ? finishSentence(`${summary} Chi tiết khiến câu chuyện này đáng mở nằm ở chỗ nó tác động trực tiếp tới cách người dùng làm việc, trả tiền hoặc dùng công cụ mỗi ngày.`)
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

  const intro = language === "vi" ? "Điều đang xảy ra" : "What happened";
  const details = language === "vi" ? "Chi tiết đáng giữ lại" : "Details worth keeping";
  const whyItMatters = language === "vi" ? "Vì sao câu chuyện này đáng mở" : "Why this deserves a click";
  const take = language === "vi" ? "Patrick Tech Media đánh giá" : "Patrick Tech Media take";
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
  const sourceLine =
    language === "vi"
      ? `Patrick Tech Media đang đối chiếu thêm với nguồn ${sourceName}.`
      : `Patrick Tech Media is cross-checking the thread against ${sourceName}.`;
  const takeLine =
    language === "vi"
      ? `Điểm đáng giữ lại là câu chuyện này chạm vào đúng lớp người dùng công nghệ đang cần tín hiệu rõ ràng, thay vì chỉ thêm một headline gây sốc.`
      : `The part worth keeping is that this lands on a real layer of technology users instead of stopping at a flashy headline.`;

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
      body: cleanParagraphs[3] || finishSentence(`${takeLine} ${sourceLine}`)
    },
    {
      heading: next,
      body: cleanParagraphs[4] || cleanParagraphs[3] || finishSentence(`${nextLook} ${sourceLine}`)
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
      ? `Giá trị của kiểu bài này nằm ở chỗ người đọc có thể dùng lại ngay trong công việc hoặc khi xử lý một tác vụ công nghệ quen thuộc.`
      : `The value here is practical reuse: readers should be able to apply it immediately in a real task.`;
  const sourceLine =
    language === "vi"
      ? `Patrick Tech Media tiếp tục đối chiếu thêm với nguồn ${sourceName} để phần hướng dẫn không bị mỏng.`
      : `Patrick Tech Media is still cross-checking the workflow against ${sourceName} so the guide stays grounded.`;

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
      body: cleanParagraphs[4] || finishSentence(`${audienceLine} ${sourceLine}`)
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
      ? `Patrick Tech Media nhìn câu chuyện kiểu này như một cuộc đua giá trị sử dụng thật: gói nào giúp người dùng bớt bước, gom công cụ và hạ chi phí phát sinh sẽ thắng bền hơn một đợt truyền thông ngắn.`
      : `Patrick Tech Media reads this kind of move as a real utility race: the package that removes steps, bundles tools, and lowers hidden cost usually wins longer than the launch buzz.`;
  const sourceLine =
    language === "vi"
      ? `Patrick Tech Media sẽ tiếp tục đối chiếu thêm với nguồn ${sourceName} để xem thay đổi này có giữ được lợi thế khi rollout rộng hơn không.`
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
    security: "The next layer to watch is how this changes account safety, sign-in flow, and operating cost.",
    gaming: `The gaming audience will be watching whether ${title.toLowerCase()} becomes a short spike or the start of a broader shift.`,
    "internet-business-tech": "The real follow-up will be whether this turns into measurable user or business impact."
  };

  return lines[topic] || "Patrick Tech Media will keep tracking whether this signal turns into something materially bigger.";
}

function calculateQualityScore({ feed, imageUrl, paragraphs, summary, dek, hook }) {
  const base = feed.sourceType === "official-site" ? 86 : 80;
  const paragraphBonus = Math.min(8, (paragraphs?.length || 0) * 2);
  const imageBonus = imageUrl ? 4 : 0;
  const copyBonus = [summary, dek, hook].every((value) => cleanText(value).length >= 80) ? 4 : 0;
  return Math.min(96, base + paragraphBonus + imageBonus + copyBonus);
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
    security: ["secure-access-kit"],
    gaming: ["gaming-cloud-pass"]
  };

  return byTopic[topic] || [];
}

function resolveAuthorId(topic) {
  if (topic === "security") {
    return "thao-nguyen";
  }

  if (["devices", "gaming", "internet-business-tech"].includes(topic)) {
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
  return repairEncodingArtifacts(
    decodeXmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    )
  );
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
    title: cleanText(rest.title),
    summary: cleanText(rest.summary),
    dek: cleanText(rest.dek),
    hook: cleanText(rest.hook),
    sections: Array.isArray(rest.sections)
      ? rest.sections.map((section) => ({
          ...section,
          heading: cleanText(section?.heading),
          body: cleanText(section?.body)
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

function cleanUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
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

function repairEncodingArtifacts(value) {
  const input = String(value || "");
  const suspiciousPattern = /(?:\u00e2(?:\u20ac|[\u0080-\u00bf]))|(?:[\u00c2-\u00c6][\u0080-\u00ff])|(?:\u00e1[\u00ba\u00bb])/;

  if (!input || !suspiciousPattern.test(input)) {
    return input;
  }

  const repaired = decodeWindows1252Mojibake(input);
  return scoreEncodingQuality(repaired) < scoreEncodingQuality(input) ? repaired : input;
}

function scoreEncodingQuality(value) {
  return [
    /(?:\u00e2(?:\u20ac|[\u0080-\u00bf]))/g,
    /(?:[\u00c2-\u00c6][\u0080-\u00ff])/g,
    /(?:\u00e1[\u00ba\u00bb])/g,
    /Ă¯Â¿Â½/g
  ].reduce((sum, pattern) => sum + ((String(value || "").match(pattern) || []).length * 2), 0);
}

function decodeWindows1252Mojibake(value) {
  const cp1252 = new Map([
    ["\u20ac", 0x80],
    ["\u201a", 0x82],
    ["\u0192", 0x83],
    ["\u201e", 0x84],
    ["\u2026", 0x85],
    ["\u2020", 0x86],
    ["\u2021", 0x87],
    ["\u02c6", 0x88],
    ["\u2030", 0x89],
    ["\u0160", 0x8a],
    ["\u2039", 0x8b],
    ["\u0152", 0x8c],
    ["\u017d", 0x8e],
    ["\u2018", 0x91],
    ["\u2019", 0x92],
    ["\u201c", 0x93],
    ["\u201d", 0x94],
    ["\u2022", 0x95],
    ["\u2013", 0x96],
    ["\u2014", 0x97],
    ["\u02dc", 0x98],
    ["\u2122", 0x99],
    ["\u0161", 0x9a],
    ["\u203a", 0x9b],
    ["\u0153", 0x9c],
    ["\u017e", 0x9e],
    ["\u0178", 0x9f]
  ]);

  const bytes = [];

  for (const char of String(value || "")) {
    const code = char.codePointAt(0);

    if (typeof code !== "number") {
      continue;
    }

    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    if (cp1252.has(char)) {
      bytes.push(cp1252.get(char));
      continue;
    }

    return String(value || "");
  }

  return Buffer.from(bytes).toString("utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

