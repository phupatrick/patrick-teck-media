import crypto from "node:crypto";
import path from "node:path";
import { normalizeArticles, publishArticles } from "./newsroom-publish.mjs";

const outputPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
const sourceUrl = process.env.NEWSROOM_PULL_URL || process.env.OPENCLAW_NEWSROOM_URL || "";
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
    limit: 4
  },
  {
    name: "GenK Apps-Games",
    url: "https://genk.vn/rss/apps-games.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    limit: 4
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    limit: 3
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 4
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 3
  },
  {
    name: "9to5Google",
    url: "https://9to5google.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 3
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
    incomingArticles = normalizeArticles(payload);
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

const result = publishArticles({
  incomingArticles,
  outputPath,
  now
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
      const items = parseRssItems(xml).slice(0, feed.limit);
      const mapped = items.map((item) => mapFeedItem(feed, item, timestamp)).filter(Boolean);
      allArticles.push(...mapped);
    } catch (error) {
      console.warn(`Skipping ${feed.name}: ${error.message || error}`);
    }
  }

  return allArticles;
}

function parseRssItems(xml) {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);

  return items.map((itemXml) => ({
    title: readTag(itemXml, "title"),
    link: readTag(itemXml, "link"),
    guid: readTag(itemXml, "guid"),
    description: readTag(itemXml, "description"),
    content: readTag(itemXml, "content:encoded"),
    pubDate: readTag(itemXml, "pubDate"),
    imageUrl: readImageUrl(itemXml)
  }));
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

function mapFeedItem(feed, item, timestamp) {
  const title = cleanText(item.title);
  const link = cleanUrl(item.link);

  if (!title || !link) {
    return null;
  }

  const rawBody = cleanText(item.content || item.description);
  const summary = buildSummary(rawBody, feed.language, title);
  const dek = buildDek(rawBody, feed.language, summary);
  const topic = inferTopic(feed, title, rawBody);
  const contentType = inferContentType(feed, title, rawBody);
  const publishedAt = normalizeDate(item.pubDate, timestamp);
  const articleHash = crypto.createHash("sha1").update(`${feed.name}:${link}:${feed.language}`).digest("hex").slice(0, 12);
  const slug = slugify(title).slice(0, 96);
  const image = item.imageUrl
    ? {
        src: item.imageUrl,
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
    hook: summary,
    sections: buildSections({ title, summary, dek, language: feed.language, topic, contentType, sourceName: feed.name }),
    verification_state: feed.sourceType === "official-site" ? "verified" : "emerging",
    quality_score: feed.sourceType === "official-site" ? 90 : 84,
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
        image_url: item.imageUrl || "",
        image_caption: image.caption || "",
        image_credit: feed.name
      }
    ],
    author_id: resolveAuthorId(topic),
    published_at: publishedAt,
    updated_at: publishedAt,
    image
  };
}

function inferTopic(feed, title, body) {
  const haystack = `${feed.name} ${title} ${body}`.toLowerCase();

  if (/(ai|artificial intelligence|chatgpt|openai|gemini|claude|deepmind|deepseek|copilot|llm|agent)/i.test(haystack)) {
    return "ai";
  }

  if (/(hack|security|cyber|malware|phishing|passkey|password|data breach|ransomware|bảo mật|tấn công)/i.test(haystack)) {
    return "security";
  }

  if (/(iphone|android|pixel|galaxy|laptop|chip|gpu|cpu|npu|device|tablet|camera|robot|hardware|thiết bị|điện thoại)/i.test(haystack)) {
    return "devices";
  }

  if (/(gaming|game|steam|playstation|xbox|nintendo|switch|handheld)/i.test(haystack)) {
    return "gaming";
  }

  if (/(facebook|meta|instagram|threads|tiktok|youtube|x |twitter|whatsapp|social)/i.test(haystack)) {
    return "internet-business-tech";
  }

  if (/(app|software|windows|mac|ios|android app|ứng dụng|phần mềm)/i.test(haystack)) {
    return "apps-software";
  }

  return feed.language === "vi" ? "internet-business-tech" : "apps-software";
}

function inferContentType(feed, title, body) {
  const haystack = `${feed.name} ${title} ${body}`.toLowerCase();

  if (/(how to|how-to|guide|tips|thủ thuật|mẹo|hướng dẫn|cách )/i.test(haystack)) {
    return "EvergreenGuide";
  }

  if (/(vs\.?|versus|compare|comparison|so sánh)/i.test(haystack)) {
    return "ComparisonPage";
  }

  return "NewsArticle";
}

function buildSummary(body, language, fallbackTitle) {
  const sentences = splitSentences(body);
  const summary = [sentences[0], sentences[1]].filter(Boolean).join(" ");

  if (summary.length >= 80) {
    return finishSentence(summary);
  }

  return language === "vi"
    ? finishSentence(body || `Bài viết bám theo chuyển động mới liên quan tới ${fallbackTitle}.`)
    : finishSentence(body || `This piece follows the newest movement connected to ${fallbackTitle}.`);
}

function buildDek(body, language, summary) {
  const sentences = splitSentences(body);
  const dek = sentences[0] || summary;

  if (dek && dek.length >= 48) {
    return finishSentence(dek);
  }

  return language === "vi"
    ? "Bài viết kéo câu chuyện về đúng bối cảnh và chỉ ra vì sao nó đáng để mắt lúc này."
    : "The piece brings the story back into context and explains why it is worth watching now.";
}

function buildSections({ title, summary, dek, language, topic, contentType, sourceName }) {
  const intro = language === "vi" ? "Điều vừa xảy ra" : "What happened";
  const whyItMatters = language === "vi" ? "Vì sao đáng chú ý" : "Why it matters";
  const next = contentType === "EvergreenGuide"
    ? language === "vi" ? "Cách dùng nhanh" : "How to use it"
    : language === "vi" ? "Điều cần theo dõi tiếp" : "What to watch next";

  const angleByTopic = {
    ai: {
      vi: "Điểm đáng chú ý là AI đang đi gần hơn tới ứng dụng thực tế thay vì chỉ dừng ở trình diễn.",
      en: "The important angle is that AI keeps moving closer to practical use, not just polished demos."
    },
    "apps-software": {
      vi: "Kiểu cập nhật này thường đổi khá nhanh cách người dùng tương tác với ứng dụng mỗi ngày.",
      en: "Updates like this tend to change daily product behavior faster than most readers expect."
    },
    devices: {
      vi: "Những thay đổi ở lớp thiết bị thường nhỏ trên thông số nhưng lại chạm mạnh vào trải nghiệm thật.",
      en: "Hardware shifts can look small on paper while changing real-world experience in a bigger way."
    },
    security: {
      vi: "Điều cần nhìn ở đây là tác động tới an toàn vận hành và quyền kiểm soát dữ liệu.",
      en: "The real thing to watch here is operational safety and data control."
    },
    gaming: {
      vi: "Với game và giải trí số, kiểu chuyển động này thường lan nhanh trong cộng đồng trước khi được chốt thành xu hướng rõ ràng.",
      en: "In gaming, moves like this often spread through the community before they settle into a clear trend."
    },
    "internet-business-tech": {
      vi: "Câu chuyện này đáng theo dõi vì nó có thể đổi cách người dùng số phản ứng, chia sẻ hoặc chi tiền.",
      en: "This is worth watching because it can shift how digital users react, share, or spend."
    }
  };

  const angle = angleByTopic[topic]?.[language] || angleByTopic.ai[language];

  return [
    {
      heading: intro,
      body: finishSentence(summary)
    },
    {
      heading: whyItMatters,
      body: finishSentence(`${dek} ${angle}`)
    },
    {
      heading: next,
      body:
        language === "vi"
          ? finishSentence(`Nguồn hiện tại được lấy từ ${sourceName}. Desk sẽ tiếp tục theo dõi những cập nhật tiếp theo quanh ${title}.`)
          : finishSentence(`The current source trail comes from ${sourceName}. The desk will keep tracking what changes next around ${title}.`)
    }
  ];
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
    .slice(0, 3);
}

function finishSentence(value) {
  const normalized = cleanText(value);

  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function cleanText(value) {
  return decodeXmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
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
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
