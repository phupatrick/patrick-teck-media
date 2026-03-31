import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { normalizeArticles, publishArticles } from "./newsroom-publish.mjs";

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
    limit: 5
  },
  {
    name: "GenK Apps-Games",
    url: "https://genk.vn/rss/apps-games.rss",
    language: "vi",
    region: "VN",
    sourceType: "press",
    trustTier: "established-media",
    limit: 5
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    language: "en",
    region: "Global",
    sourceType: "official-site",
    trustTier: "official",
    limit: 4
  },
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 5
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 4
  },
  {
    name: "9to5Google",
    url: "https://9to5google.com/feed/",
    language: "en",
    region: "Global",
    sourceType: "press",
    trustTier: "established-media",
    limit: 4
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

if (!incomingArticles.length && sourceFile) {
  try {
    const sourcePath = path.resolve(process.cwd(), sourceFile);
    const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
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

async function mapFeedItem(feed, item, timestamp) {
  const title = cleanText(item.title);
  const link = cleanUrl(item.link);

  if (!title || !link) {
    return null;
  }

  const snapshot = await fetchSourceSnapshot(link);
  const rawBody = cleanText(snapshot.bodyText || item.content || item.description);

  if (!rawBody) {
    return null;
  }

  const topic = inferTopic(feed, title, rawBody);
  const contentType = inferContentType(feed, title, rawBody);
  const summary = buildSummary(snapshot.description || rawBody, feed.language, title, snapshot.paragraphs);
  const dek = buildDek(snapshot.description || rawBody, feed.language, summary, snapshot.paragraphs);
  const hook = buildHook(snapshot.paragraphs, summary, dek, feed.language);
  const sections = buildSections({
    title,
    summary,
    dek,
    language: feed.language,
    topic,
    contentType,
    sourceName: feed.name,
    paragraphs: snapshot.paragraphs
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
    quality_score: calculateQualityScore({ feed, imageUrl, paragraphs: snapshot.paragraphs, summary, dek, hook }),
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
    image
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
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .filter((paragraph) => paragraph.length >= 80)
    .filter((paragraph) => !isBoilerplateParagraph(paragraph))
    .filter((paragraph, index, list) => list.findIndex((entry) => entry === paragraph) === index);
}

function isBoilerplateParagraph(value) {
  return /(toggle dark mode|toggle search form|search for:|home page switch site|privacy|logo|0 comments|newsletter|cookie|window\.|function\s*\(|var\s+[a-z0-9_]+|submit|forums|advertisement|all rights reserved|mobile ai tin ict internet|apps-game|đồ chơi số|gia dụng|trà đá công nghệ|xem - mua - luôn)/i.test(
    value
  );
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

  if (/(facebook|meta|instagram|threads|tiktok|youtube|twitter|x\.com|whatsapp|social)/i.test(haystack)) {
    return "internet-business-tech";
  }

  if (/(app|software|windows|mac|ios|android app|ứng dụng|phần mềm)/i.test(haystack)) {
    return "apps-software";
  }

  return feed.language === "vi" ? "internet-business-tech" : "apps-software";
}

function inferContentType(feed, title, body) {
  const haystack = `${feed.name} ${title} ${splitSentences(body)[0] || ""}`.toLowerCase();

  if (/(how to|how-to|guide|tips|thủ thuật|mẹo|hướng dẫn|cách (?:dùng|làm|triển khai|cài|tạo|thiết lập|bảo vệ|khắc phục|chọn))/i.test(haystack)) {
    return "EvergreenGuide";
  }

  if (/(vs\.?|versus|compare|comparison|so sánh)/i.test(haystack)) {
    return "ComparisonPage";
  }

  return "NewsArticle";
}

function buildSummary(body, language, fallbackTitle, paragraphs = []) {
  const paragraphLead = cleanText((paragraphs || []).slice(0, 2).join(" "));
  const sentences = splitSentences(paragraphLead || body);
  const summary = [sentences[0], sentences[1]].filter(Boolean).join(" ");

  if (summary.length >= 90) {
    return finishSentence(summary);
  }

  return language === "vi"
    ? finishSentence(body || `Bài viết bám theo chuyển động mới liên quan tới ${fallbackTitle}.`)
    : finishSentence(body || `This piece follows the newest movement connected to ${fallbackTitle}.`);
}

function buildDek(body, language, summary, paragraphs = []) {
  const sentences = splitSentences(cleanText(paragraphs[0] || body));
  const dek = sentences[0] || summary;

  if (dek && dek.length >= 60) {
    return finishSentence(dek);
  }

  return language === "vi"
    ? "Bài viết kéo câu chuyện về đúng bối cảnh và chỉ ra vì sao nó đáng để mở ngay lúc này."
    : "The piece brings the story back into context and explains why it is worth opening right now.";
}

function buildHook(paragraphs, summary, dek, language) {
  const candidate = cleanText(paragraphs?.[0] || paragraphs?.[1] || summary || dek);

  if (candidate.length >= 80) {
    return finishSentence(candidate);
  }

  return language === "vi"
    ? finishSentence(`${summary} Đây là chi tiết khiến câu chuyện này đáng để mở ngay.`)
    : finishSentence(`${summary} This is the detail that makes the story worth opening right now.`);
}

function buildSections({ title, summary, dek, language, topic, contentType, sourceName, paragraphs = [] }) {
  const cleanParagraphs = (paragraphs || []).map((entry) => finishSentence(entry)).filter(Boolean);
  const intro = language === "vi" ? "Điều vừa xảy ra" : "What happened";
  const whyItMatters = language === "vi" ? "Vì sao đáng chú ý" : "Why it matters";
  const next = contentType === "EvergreenGuide"
    ? language === "vi"
      ? "Đọc xong dùng được gì"
      : "What readers can use right away"
    : language === "vi"
      ? "Điều cần theo dõi tiếp"
      : "What to watch next";

  const angleByTopic = {
    ai: {
      vi: "Chi tiết đáng chú ý là tín hiệu AI đang đi nhanh hơn vào lúc dùng thật, thay vì chỉ nằm ở phần trình diễn.",
      en: "The key angle is that AI is moving closer to everyday use instead of staying in demo mode."
    },
    "apps-software": {
      vi: "Những thay đổi kiểu này thường âm thầm nhưng tác động khá rõ vào thói quen dùng ứng dụng mỗi ngày.",
      en: "Updates like this often look small at first but end up changing everyday product behavior."
    },
    devices: {
      vi: "Ở mảng thiết bị, điều đáng nhìn là khi thông số bắt đầu dịch chuyển thành khác biệt thật trong trải nghiệm.",
      en: "On the device side, the real question is when a spec shift turns into a noticeable user experience change."
    },
    security: {
      vi: "Điểm đáng theo dõi là tác động của nó lên an toàn tài khoản và cách đội vận hành xử lý rủi ro.",
      en: "The part worth watching is how it changes account safety and operational risk handling."
    },
    gaming: {
      vi: "Với game, những tín hiệu như vậy thường lan nhanh trong cộng đồng trước khi trở thành xu hướng rõ ràng.",
      en: "In gaming, signals like this often spread through the community before they settle into a clear trend."
    },
    "internet-business-tech": {
      vi: "Điều quan trọng là nó có thể ảnh hưởng trực tiếp tới cách người dùng tương tác, chia sẻ hoặc chi tiền trên nền tảng số.",
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

  return [
    {
      heading: intro,
      body: cleanParagraphs[0] || finishSentence(summary)
    },
    {
      heading: whyItMatters,
      body: cleanParagraphs[1] || finishSentence(`${dek} ${angle}`)
    },
    {
      heading: next,
      body: cleanParagraphs[2] || finishSentence(`${nextLook} ${sourceLine}`)
    }
  ];
}

function buildVietnameseForwardLook(topic, title) {
  const lines = {
    ai: "Điểm cần theo dõi tiếp là liệu thay đổi này có được đưa nhanh vào sản phẩm và thói quen dùng thật hay không.",
    "apps-software": "Điều cần nhìn tiếp là nhịp rollout, giới hạn khu vực và mức độ ảnh hưởng lên hành vi dùng hằng ngày.",
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
