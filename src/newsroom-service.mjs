import {
  buildArticles,
  getAuthors,
  getContentTypeMeta,
  getPolicyPages,
  getStoreItems,
  getTopics
} from "./newsroom-data.mjs";

const LANGUAGES = ["vi", "en"];
const DATE_FORMATTERS = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Saigon"
  }),
  en: new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Saigon"
  })
};

const VERIFICATION_META = {
  trend: {
    labels: { vi: "Trend Watch", en: "Trend Watch" },
    descriptions: {
      vi: "Tín hiệu nóng đang lan trên social hoặc cộng đồng. Bài vẫn index để khám phá nhưng không chạy quảng cáo.",
      en: "A hot social or community signal. The page can be indexed for discovery, but it does not run ads."
    }
  },
  emerging: {
    labels: { vi: "Emerging", en: "Emerging" },
    descriptions: {
      vi: "Chủ đề đã có corroboration bước đầu nhưng newsroom vẫn theo dõi thêm xác nhận.",
      en: "The topic has initial corroboration, but the newsroom is still waiting on stronger confirmation."
    }
  },
  verified: {
    labels: { vi: "Verified", en: "Verified" },
    descriptions: {
      vi: "Bài có nguồn mạnh hoặc xác nhận chính thức.",
      en: "The story is backed by strong or official sources."
    }
  }
};

const SOURCE_TYPE_META = {
  "official-site": { vi: "Nguồn chính thức", en: "Official sources" },
  press: { vi: "Báo công nghệ", en: "Press" },
  "official-social": { vi: "Tài khoản chính thức", en: "Official social" },
  community: { vi: "Cộng đồng", en: "Community" },
  "social-buzz": { vi: "Social buzz", en: "Social buzz" },
  "editorial-research": { vi: "Nghiên cứu nội bộ", en: "Editorial research" },
  "internal-roundup": { vi: "Roundup nội bộ", en: "Internal roundup" }
};

export function buildNewsroomState(options = {}) {
  const siteUrl = normalizeSiteUrl(options.siteUrl || "https://patrickteck.media");
  const storeUrl = normalizeSiteUrl(options.storeUrl || "https://store.patrickteck.media");
  const articles = buildArticles().map((article) => enrichArticle(article, { siteUrl, storeUrl }));
  const articlesByHref = new Map(articles.map((article) => [article.href, article]));
  const topics = getTopics();
  const contentTypeMeta = getContentTypeMeta();
  const storeItems = getStoreItems().map((item) => ({
    ...item,
    url: `${storeUrl}${item.path}`
  }));
  const authors = getAuthors().map((author) => ({
    ...author,
    href: `/vi/authors#${author.id}`,
    href_en: `/en/authors#${author.id}`
  }));
  const authorMap = new Map(authors.map((author) => [author.id, author]));
  const storeItemMap = new Map(storeItems.map((item) => [item.id, item]));
  const articleMap = new Map();

  for (const article of articles) {
    article.author = authorMap.get(article.author_id);
    article.related_store_cards = article.related_store_items.map((id) => storeItemMap.get(id)).filter(Boolean);
    article.alternates = buildArticleAlternates(articles, article.cluster_id, article.href);
    articleMap.set(makeArticleKey(article.language, article.path_segment, article.slug), article);
  }

  return {
    site: {
      name: "Patrick Teck Media",
      description: {
        vi: "Newsroom song ngữ theo dõi công nghệ, AI, phần mềm và nhịp Internet Việt Nam lẫn thế giới bằng mô hình OpenClaw-first.",
        en: "A bilingual newsroom tracking technology, AI, software, and internet shifts across Vietnam and the wider world with an OpenClaw-first workflow."
      },
      siteUrl,
      storeUrl,
      supportedLanguages: [...LANGUAGES]
    },
    topics,
    contentTypeMeta,
    policies: getPolicyPages(),
    authors,
    articles,
    articlesByHref,
    articleMap,
    storeItems
  };
}

export function getHomeData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const verifiedStories = localized.filter((article) => article.verification_state === "verified" && article.content_type === "NewsArticle");
  const featured = verifiedStories[0] || localized[0];
  const briefing = localized.find((article) => article.content_type === "Roundup") || localized[0];
  const trending = localized
    .filter((article) => article.verification_state !== "verified")
    .slice(0, 4);
  const evergreen = localized
    .filter((article) => article.content_type === "EvergreenGuide" || article.content_type === "ComparisonPage")
    .slice(0, 4);
  const latest = localized.slice(0, 6);
  const topicSections = state.topics.map((topic) => ({
    ...topic,
    label: topic.labels[language],
    slug: topic.slugs[language],
    stories: localized.filter((article) => article.topic === topic.id).slice(0, 3)
  }));

  return {
    featured,
    briefing,
    trending,
    evergreen,
    latest,
    browserStories: localized.slice(0, 10),
    topicSections,
    metrics: getNewsroomMetrics(state, language)
  };
}

export function getRadarData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const sourceMixMap = new Map();

  for (const article of localized) {
    for (const source of article.source_set) {
      sourceMixMap.set(source.source_type, (sourceMixMap.get(source.source_type) || 0) + 1);
    }
  }

  const sourceMix = [...sourceMixMap.entries()]
    .map(([type, count]) => ({
      type,
      count,
      label: SOURCE_TYPE_META[type]?.[language] || type
    }))
    .sort((left, right) => right.count - left.count);

  const lanes = ["trend", "emerging", "verified"].map((status) => ({
    status,
    label: VERIFICATION_META[status].labels[language],
    description: VERIFICATION_META[status].descriptions[language],
    stories: localized.filter((article) => article.verification_state === status).slice(0, 4)
  }));

  const queue = localized.slice(0, 8).map((article, index) => ({
    id: article.id,
    title: article.title,
    href: article.href,
    verification_state: article.verification_state,
    verification_label: VERIFICATION_META[article.verification_state].labels[language],
    source_count: article.source_set.length,
    topic_label: article.topic_label,
    ad_eligible: article.ad_eligible,
    rank: index + 1,
    readiness_label: article.ad_eligible
      ? language === "vi"
        ? "Có thể monetization"
        : "Monetization ready"
      : language === "vi"
        ? "Index only"
        : "Index only"
  }));

  return {
    lanes,
    sourceMix,
    queue,
    scorecards: [
      {
        label: language === "vi" ? "Trang bật ads" : "Ad-eligible pages",
        value: localized.filter((article) => article.ad_eligible).length
      },
      {
        label: language === "vi" ? "Trang index-only" : "Index-only pages",
        value: localized.filter((article) => !article.ad_eligible).length
      },
      {
        label: language === "vi" ? "Cluster đã gom" : "Cluster groups",
        value: new Set(localized.map((article) => article.cluster_id)).size
      }
    ]
  };
}

export function getWorkflowData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const copy =
    language === "vi"
      ? {
          steps: [
            {
              title: "1. OpenClaw quét tín hiệu",
              body: "Crawler đi qua web, social, nguồn chính thức và cộng đồng để gom topic, source metadata và tín hiệu tăng nhiệt."
            },
            {
              title: "2. Newsroom cluster và chấm điểm",
              body: "Hệ thống gom bài cùng một câu chuyện, gán trạng thái trend/emerging/verified, đồng thời quyết định khả năng bật ads."
            },
            {
              title: "3. Xuất bản và mở feed",
              body: "Sau khi qua guardrails, bài được xuất lên homepage, RSS, JSON feed và route song ngữ với hreflang."
            }
          ],
          guardrails: [
            "Trend pages vẫn được index nhưng không render ad slot.",
            "Chỉ bài đủ điều kiện mới hiện module quảng cáo.",
            "Store CTA bị tắt ở bài social-only hoặc trend nhạy cảm.",
            "Mỗi bài phải giữ attribution nguồn và trạng thái xác minh."
          ],
          endpointsLabel: "Feed và endpoint demo",
          matrixLabel: "Phân bổ nội dung"
        }
      : {
          steps: [
            {
              title: "1. OpenClaw sweeps signals",
              body: "The crawler moves across web, social, official sources, and communities to collect topics, source metadata, and heat signals."
            },
            {
              title: "2. The newsroom clusters and scores",
              body: "The system groups items into a shared story, assigns trend/emerging/verified state, and decides whether ads are allowed."
            },
            {
              title: "3. Publishing opens feeds",
              body: "Once the story clears guardrails, it is published to the homepage, RSS, JSON feed, and bilingual routes with hreflang."
            }
          ],
          guardrails: [
            "Trend pages stay indexable but do not render ad slots.",
            "Only qualified pages show advertising surfaces.",
            "Store CTAs are disabled on social-only or sensitive trend stories.",
            "Every story keeps source attribution and verification state visible."
          ],
          endpointsLabel: "Demo feeds and endpoints",
          matrixLabel: "Content distribution"
        };

  const contentMatrix = Object.keys(state.contentTypeMeta).map((type) => ({
    type,
    label: state.contentTypeMeta[type].labels[language],
    count: localized.filter((article) => article.content_type === type).length
  }));

  return {
    steps: copy.steps,
    guardrails: copy.guardrails,
    matrixLabel: copy.matrixLabel,
    contentMatrix,
    endpointsLabel: copy.endpointsLabel,
    endpoints: [
      `/${language}/feed.json`,
      `/${language}/feed.xml`,
      `/api/newsroom/overview?lang=${language}`,
      `/api/newsroom/radar?lang=${language}`
    ]
  };
}

export function getDashboardData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const headlineCards = [
    {
      label: language === "vi" ? "Stories live" : "Stories live",
      value: localized.length
    },
    {
      label: language === "vi" ? "Ads ready" : "Ads ready",
      value: localized.filter((article) => article.ad_eligible).length
    },
    {
      label: language === "vi" ? "Trend only" : "Trend only",
      value: localized.filter((article) => article.verification_state === "trend").length
    },
    {
      label: language === "vi" ? "Topics active" : "Topics active",
      value: new Set(localized.map((article) => article.topic)).size
    }
  ];

  const signalStream = localized.slice(0, 10).map((article) => ({
    id: article.id,
    title: article.title,
    href: article.href,
    topic: article.topic_label,
    verification_label: VERIFICATION_META[article.verification_state].labels[language],
    source_label: SOURCE_TYPE_META[article.source_set[0]?.source_type]?.[language] || article.source_set[0]?.source_type || "source",
    source_count: article.source_set.length,
    action:
      article.verification_state === "trend"
        ? language === "vi"
          ? "Chờ corroboration"
          : "Wait for corroboration"
        : article.verification_state === "emerging"
          ? language === "vi"
            ? "Theo dõi để nâng hạng"
            : "Track for upgrade"
          : language === "vi"
            ? "Đang xuất bản"
            : "Publishing"
  }));

  const statusBoard = ["verified", "emerging", "trend"].map((status) => ({
    status,
    label: VERIFICATION_META[status].labels[language],
    stories: localized.filter((article) => article.verification_state === status).slice(0, 3)
  }));

  const topicHeat = state.topics
    .map((topic) => ({
      id: topic.id,
      label: topic.labels[language],
      count: localized.filter((article) => article.topic === topic.id).length,
      accent: topic.accent
    }))
    .filter((topic) => topic.count > 0)
    .sort((left, right) => right.count - left.count);

  const repoChecklist =
    language === "vi"
      ? [
          "README đã mô tả route demo chính.",
          ".gitignore chặn file tạm, log và outbox.",
          "Feed JSON/RSS sẵn cho bot hoặc subscriber.",
          "Policy pages và sitemap đã có mặt."
        ]
      : [
          "README documents the main demo routes.",
          ".gitignore blocks temp files, logs, and outbox folders.",
          "JSON and RSS feeds are available for bots or subscribers.",
          "Policy pages and sitemap are in place."
        ];

  return {
    headlineCards,
    signalStream,
    statusBoard,
    topicHeat,
    repoChecklist
  };
}

export function getNewsroomMetrics(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const sourceFamilies = new Set(localized.flatMap((article) => article.source_set.map((source) => source.source_type)));
  const activeClusters = new Set(localized.map((article) => article.cluster_id));
  return {
    sourceFamilies: sourceFamilies.size,
    activeClusters: activeClusters.size,
    verifiedCount: localized.filter((article) => article.verification_state === "verified").length,
    trendCount: localized.filter((article) => article.verification_state === "trend").length,
    emergingCount: localized.filter((article) => article.verification_state === "emerging").length,
    label: language === "vi" ? "Tình trạng OpenClaw" : "OpenClaw Radar"
  };
}

export function getArticlesForLanguage(state, language) {
  return state.articles
    .filter((article) => article.language === language)
    .sort((left, right) => sortByDateDesc(left.published_at, right.published_at));
}

export function getArticleByRoute(state, language, segment, slug) {
  return state.articleMap.get(makeArticleKey(language, segment, slug)) || null;
}

export function getTopicPage(state, language, slug) {
  const topic = state.topics.find((entry) => entry.slugs[language] === slug);

  if (!topic) {
    return null;
  }

  return {
    ...topic,
    label: topic.labels[language],
    slug,
    stories: getArticlesForLanguage(state, language).filter((article) => article.topic === topic.id)
  };
}

export function getPolicyPage(state, key) {
  return state.policies.find((page) => page.key === key) || null;
}

export function getAuthorCollection(state, language) {
  return state.authors.map((author) => ({
    ...author,
    href: language === "vi" ? author.href : author.href_en
  }));
}

export function getFooterLinks(language) {
  return [
    { href: `/${language}/dashboard`, label: language === "vi" ? "Dashboard" : "Dashboard" },
    { href: `/${language}/radar`, label: language === "vi" ? "Radar" : "Radar" },
    { href: `/${language}/workflow`, label: language === "vi" ? "Workflow" : "Workflow" },
    { href: `/${language}/about`, label: language === "vi" ? "Về chúng tôi" : "About" },
    { href: `/${language}/contact`, label: language === "vi" ? "Liên hệ" : "Contact" },
    { href: `/${language}/privacy`, label: language === "vi" ? "Quyền riêng tư" : "Privacy" },
    { href: `/${language}/terms`, label: language === "vi" ? "Điều khoản" : "Terms" },
    {
      href: `/${language}/editorial-policy`,
      label: language === "vi" ? "Chính sách biên tập" : "Editorial Policy"
    },
    {
      href: `/${language}/ai-content-policy`,
      label: language === "vi" ? "Chính sách nội dung AI" : "AI Content Policy"
    },
    {
      href: `/${language}/corrections`,
      label: language === "vi" ? "Đính chính" : "Corrections"
    },
    { href: `/${language}/authors`, label: language === "vi" ? "Tác giả" : "Authors" },
    { href: `/${language}/feed.json`, label: "JSON Feed" },
    { href: `/${language}/feed.xml`, label: "RSS Feed" },
    { href: "/sitemap.xml", label: "Sitemap XML" }
  ];
}

export function getPrimaryNav(state, language) {
  return [
    { href: `/${language}/dashboard`, label: language === "vi" ? "Dashboard" : "Dashboard" },
    { href: `/${language}/radar`, label: language === "vi" ? "Radar" : "Radar" },
    { href: `/${language}/workflow`, label: language === "vi" ? "Workflow" : "Workflow" },
    ...state.topics.map((topic) => ({
      href: `/${language}/topics/${topic.slugs[language]}`,
      label: topic.labels[language]
    }))
  ];
}

export function formatPublishDate(language, dateString) {
  return DATE_FORMATTERS[language].format(new Date(dateString));
}

export function getVerificationMeta(verificationState, language) {
  return {
    label: VERIFICATION_META[verificationState].labels[language],
    description: VERIFICATION_META[verificationState].descriptions[language]
  };
}

export function getSitemapEntries(state) {
  const entries = [];

  for (const language of LANGUAGES) {
    entries.push({ href: `/${language}/`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/authors`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/dashboard`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/radar`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/workflow`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/feed.json`, updated_at: latestLanguageTimestamp(state, language) });
    entries.push({ href: `/${language}/feed.xml`, updated_at: latestLanguageTimestamp(state, language) });

    for (const topic of state.topics) {
      entries.push({
        href: `/${language}/topics/${topic.slugs[language]}`,
        updated_at: latestTopicTimestamp(state, language, topic.id)
      });
    }

    for (const page of state.policies) {
      entries.push({
        href: `/${language}/${page.key}`,
        updated_at: latestLanguageTimestamp(state, language)
      });
    }
  }

  for (const article of state.articles) {
    if (article.indexable) {
      entries.push({ href: article.href, updated_at: article.updated_at || article.published_at });
    }
  }

  return dedupeEntries(entries);
}

export function buildSitemapXml(state) {
  const urls = getSitemapEntries(state)
    .map((entry) => {
      const alternates = buildAlternateUrlTags(state, entry.href);
      return [
        "<url>",
        `  <loc>${escapeXml(`${state.site.siteUrl}${entry.href}`)}</loc>`,
        `  <lastmod>${new Date(entry.updated_at).toISOString()}</lastmod>`,
        alternates,
        "</url>"
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(state) {
  return `User-agent: *\nAllow: /\nSitemap: ${state.site.siteUrl}/sitemap.xml\n`;
}

export function buildJsonFeed(state, language) {
  const items = getArticlesForLanguage(state, language).slice(0, 20);
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: `${state.site.name} (${language.toUpperCase()})`,
    home_page_url: `${state.site.siteUrl}/${language}/`,
    feed_url: `${state.site.siteUrl}/${language}/feed.json`,
    description: state.site.description[language],
    items: items.map((article) => ({
      id: article.id,
      url: `${state.site.siteUrl}${article.href}`,
      title: article.title,
      summary: article.summary,
      content_text: [article.summary, ...article.sections.map((section) => `${section.heading}\n${section.body}`)].join("\n\n"),
      date_published: new Date(article.published_at).toISOString(),
      date_modified: new Date(article.updated_at || article.published_at).toISOString(),
      tags: [article.topic_label, article.verification_state, article.content_type_label]
    }))
  };
}

export function buildRssXml(state, language) {
  const items = getArticlesForLanguage(state, language).slice(0, 20);
  const xmlItems = items
    .map(
      (article) => `
  <item>
    <title>${escapeXml(article.title)}</title>
    <link>${escapeXml(`${state.site.siteUrl}${article.href}`)}</link>
    <guid>${escapeXml(article.id)}</guid>
    <pubDate>${new Date(article.published_at).toUTCString()}</pubDate>
    <description>${escapeXml(article.summary)}</description>
  </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(`${state.site.name} (${language.toUpperCase()})`)}</title>
  <link>${escapeXml(`${state.site.siteUrl}/${language}/`)}</link>
  <description>${escapeXml(state.site.description[language])}</description>
  <language>${language}</language>
${xmlItems}
</channel>
</rss>
`;
}

export function buildHumanSitemap(state, language) {
  const groups = [
    {
      label: language === "vi" ? "Điểm vào chính" : "Main entry points",
      links: [
        { href: `/${language}/`, label: language === "vi" ? "Trang chủ" : "Home" },
        { href: `/${language}/dashboard`, label: language === "vi" ? "Dashboard" : "Dashboard" },
        { href: `/${language}/radar`, label: language === "vi" ? "Radar" : "Radar" },
        { href: `/${language}/workflow`, label: language === "vi" ? "Workflow" : "Workflow" },
        { href: `/${language}/authors`, label: language === "vi" ? "Tác giả" : "Authors" }
      ]
    },
    {
      label: language === "vi" ? "Chuyên mục" : "Topics",
      links: state.topics.map((topic) => ({
        href: `/${language}/topics/${topic.slugs[language]}`,
        label: topic.labels[language]
      }))
    },
    {
      label: language === "vi" ? "Chính sách" : "Policies",
      links: state.policies.map((page) => ({
        href: `/${language}/${page.key}`,
        label: page.titles[language]
      }))
    },
    {
      label: language === "vi" ? "Bài viết" : "Stories",
      links: getArticlesForLanguage(state, language).map((article) => ({
        href: article.href,
        label: article.title
      }))
    }
  ];

  return groups;
}

function enrichArticle(article, { siteUrl, storeUrl }) {
  return {
    ...article,
    canonicalUrl: `${siteUrl}${article.href}`,
    storeUrl,
    editorial_label: article.show_editorial_label
      ? VERIFICATION_META[article.verification_state].labels[article.language]
      : null
  };
}

function buildArticleAlternates(articles, clusterId, currentHref) {
  return articles
    .filter((article) => article.cluster_id === clusterId && article.href !== currentHref)
    .map((article) => ({ language: article.language, href: article.href }));
}

function buildAlternateUrlTags(state, href) {
  const article = state.articlesByHref.get(href);

  if (article) {
    const alternates = [{ language: article.language, href }, ...article.alternates];
    return alternates
      .map(
        (alternate) =>
          `  <xhtml:link rel="alternate" hreflang="${alternate.language}" href="${escapeXml(`${state.site.siteUrl}${alternate.href}`)}" />`
      )
      .join("\n");
  }

  const segments = href.split("/").filter(Boolean);
  const language = segments[0];

  if (!language || !LANGUAGES.includes(language)) {
    return "";
  }

  const alternates = LANGUAGES.map((entry) => ({
    language: entry,
    href: href.replace(`/${language}/`, `/${entry}/`)
  }));

  return alternates
    .map(
      (alternate) =>
        `  <xhtml:link rel="alternate" hreflang="${alternate.language}" href="${escapeXml(`${state.site.siteUrl}${alternate.href}`)}" />`
    )
    .join("\n");
}

function latestLanguageTimestamp(state, language) {
  return getArticlesForLanguage(state, language)[0]?.updated_at || new Date().toISOString();
}

function latestTopicTimestamp(state, language, topicId) {
  return (
    getArticlesForLanguage(state, language).find((article) => article.topic === topicId)?.updated_at ||
    latestLanguageTimestamp(state, language)
  );
}

function dedupeEntries(entries) {
  const map = new Map();

  for (const entry of entries) {
    if (!map.has(entry.href) || new Date(entry.updated_at) > new Date(map.get(entry.href).updated_at)) {
      map.set(entry.href, entry);
    }
  }

  return [...map.values()].sort((left, right) => left.href.localeCompare(right.href));
}

function sortByDateDesc(left, right) {
  return new Date(right).getTime() - new Date(left).getTime();
}

function normalizeSiteUrl(siteUrl) {
  return String(siteUrl).replace(/\/+$/, "");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeArticleKey(language, segment, slug) {
  return `${language}:${segment}:${slug}`;
}
