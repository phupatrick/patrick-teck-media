import fs from "node:fs";
import path from "node:path";
import {
  buildArticles,
  getAuthors,
  getContentTypeMeta,
  getPolicyPages,
  getStoreItems,
  getTopics
} from "./newsroom-data.mjs";

const LANGUAGES = ["vi", "en"];
const DEFAULT_CONTENT_PATH = path.join(process.cwd(), "data", "newsroom-content.json");
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

const TIME_ONLY_FORMATTERS = {
  vi: new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Saigon"
  }),
  en: new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
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

const LIVE_REFRESH_MS = 45_000;
const STORY_VISUALS = {
  "viettel-edge-ai-pilot": {
    motif: "assistant",
    palette: ["#0f7f54", "#f6d79f", "#17352b"],
    kicker: { vi: "Triển khai hiện trường", en: "Field deployment" },
    caption: {
      vi: "Ảnh bìa cho tuyến bài về trợ lý AI edge hỗ trợ đội ngũ bán hàng hiện trường.",
      en: "Cover art for the story about an edge AI assistant supporting field sales teams."
    }
  },
  "android-16-battery-intelligence": {
    motif: "battery",
    palette: ["#2f8f83", "#d7f0ea", "#1b403d"],
    kicker: { vi: "Pin và phần mềm", en: "Battery and software" },
    caption: {
      vi: "Ảnh bìa cho câu chuyện về dashboard pin và tín hiệu tối ưu năng lượng trên Android.",
      en: "Cover art for the story about battery dashboards and energy intelligence on Android."
    }
  },
  "handheld-emulator-overlay-rumor": {
    motif: "handheld",
    palette: ["#e6527d", "#f7d3df", "#3f1826"],
    kicker: { vi: "Gaming handheld", en: "Handheld gaming" },
    caption: {
      vi: "Ảnh bìa cho cụm bài theo dõi giao diện overlay mới trên hệ máy chơi game cầm tay.",
      en: "Cover art for the cluster tracking a rumored new overlay on handheld gaming devices."
    }
  },
  "luma-team-spaces-rollout": {
    motif: "workspace",
    palette: ["#2463eb", "#d9e6ff", "#112957"],
    kicker: { vi: "Không gian làm việc", en: "Team workspace" },
    caption: {
      vi: "Ảnh bìa cho bài viết về không gian cộng tác mới dành cho editor và creator team.",
      en: "Cover art for the story on a new collaboration space for editors and creator teams."
    }
  },
  "messaging-app-dark-mode-leak": {
    motif: "phone",
    palette: ["#344154", "#dde3ed", "#18212e"],
    kicker: { vi: "Giao diện di động", en: "Mobile interface" },
    caption: {
      vi: "Ảnh bìa cho tin theo dõi thay đổi giao diện dark mode trên ứng dụng nhắn tin.",
      en: "Cover art for the story tracking a dark mode interface change inside a messaging app."
    }
  },
  "patrick-tech-weekly-roundup": {
    motif: "newsdesk",
    palette: ["#0f7f54", "#f5e4c8", "#14231d"],
    kicker: { vi: "Bản tin cuối tuần", en: "Weekend briefing" },
    caption: {
      vi: "Ảnh bìa cho bản tổng hợp cuối tuần gom những chuyển động công nghệ đáng chú ý nhất.",
      en: "Cover art for the weekend briefing packaging the most useful technology shifts of the week."
    }
  },
  "best-ai-note-taking-tools": {
    motif: "notes",
    palette: ["#ff8a3d", "#fde2cf", "#5c2b0b"],
    kicker: { vi: "Công cụ ghi chú", en: "Note-taking tools" },
    caption: {
      vi: "Ảnh bìa cho bài hướng dẫn chọn công cụ ghi chú, tóm tắt và theo dõi việc cần làm.",
      en: "Cover art for the guide to note-taking, summarization, and meeting follow-up tools."
    }
  },
  "chatgpt-gemini-claude-freelancer-compare": {
    motif: "comparison",
    palette: ["#8a5cf6", "#ebe3ff", "#28124b"],
    kicker: { vi: "So sánh công cụ", en: "Tool comparison" },
    caption: {
      vi: "Ảnh bìa cho bài so sánh các trợ lý viết và nghiên cứu dành cho freelancer.",
      en: "Cover art for the comparison of writing and research assistants for freelancers."
    }
  },
  "asia-npu-laptop-wave": {
    motif: "laptop",
    palette: ["#2463eb", "#d9e6ff", "#1b2d63"],
    kicker: { vi: "Thiết bị AI", en: "AI hardware" },
    caption: {
      vi: "Ảnh bìa cho tuyến bài về làn sóng laptop có NPU tại thị trường châu Á.",
      en: "Cover art for the story on the growing NPU laptop wave across Asia."
    }
  },
  "passkeys-guide-vietnam-teams": {
    motif: "shield",
    palette: ["#9b4dca", "#eedbff", "#351347"],
    kicker: { vi: "Bảo mật đội nhóm", en: "Team security" },
    caption: {
      vi: "Ảnh bìa cho bài hướng dẫn triển khai passkeys và kiểm soát truy cập trong team nhỏ.",
      en: "Cover art for the guide to passkeys and access control in small teams."
    }
  },
  "vietnam-fiber-home-lab-trend": {
    motif: "network",
    palette: ["#0f7f54", "#d7f3e3", "#133227"],
    kicker: { vi: "Hạ tầng số", en: "Digital infrastructure" },
    caption: {
      vi: "Ảnh bìa cho bài viết về home lab mini, fiber ổn định và hạ tầng tự vận hành.",
      en: "Cover art for the story on mini home labs, stable fiber, and self-hosted infrastructure."
    }
  }
};

export function buildNewsroomState(options = {}) {
  const siteUrl = normalizeSiteUrl(options.siteUrl || "https://patricktech.media");
  const storeUrl = normalizeSiteUrl(options.storeUrl || "https://store.patricktech.media");
  const now = new Date(options.now || new Date().toISOString());
  const topics = getTopics();
  const contentTypeMeta = getContentTypeMeta();
  const contentPath = resolveContentPath(options.contentPath);
  const sourceArticles = loadExternalArticles(contentPath, { topics, contentTypeMeta }) || buildArticles();
  const articles = sourceArticles.map((article) => enrichArticle(article, { siteUrl, storeUrl }));
  const articlesByHref = new Map(articles.map((article) => [article.href, article]));
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
      name: "Patrick Tech Media",
      description: {
        vi: "Toà soạn số song ngữ theo dõi công nghệ, phần mềm, thiết bị và đời sống Internet với nhịp cập nhật liên tục cho độc giả Việt Nam và quốc tế.",
        en: "A bilingual digital newsroom covering technology, software, devices, and internet culture with a continuously updated reading experience for Vietnam and global audiences."
      },
      siteUrl,
      storeUrl,
      supportedLanguages: [...LANGUAGES]
    },
    runtime: buildRuntime(now, authors),
    contentPath,
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
    liveDesk: getLiveDeskData(state, language),
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
              title: "1. Desk gom tín hiệu đầu ngày",
              body: "Hệ thống tổng hợp nguồn từ web, social, blog chính thức và cộng đồng để tạo ra danh sách câu chuyện đáng theo dõi cho bàn tin."
            },
            {
              title: "2. Hàng chờ biên tập nhóm theo câu chuyện",
              body: "Các tín hiệu cùng chủ đề được gom lại, gắn trạng thái trend, emerging hoặc verified và kiểm tra xem có đủ điều kiện hiển thị quảng cáo hay chưa."
            },
            {
              title: "3. Xuất bản và phân phối",
              body: "Sau khi qua guardrails, bài được đưa lên homepage, feed, sitemap và các route song ngữ với cấu trúc điều hướng rõ ràng."
            }
          ],
          guardrails: [
            "Bài trend vẫn được index nhưng không hiển thị slot quảng cáo.",
            "Chỉ những trang đủ điều kiện mới mở module quảng cáo.",
            "Store CTA được làm nhẹ hoặc tắt hẳn ở các bài nhạy cảm.",
            "Mỗi bài đều giữ nguồn tham khảo và trạng thái xác minh rõ ràng."
          ],
          endpointsLabel: "Feed và endpoint newsroom",
          matrixLabel: "Phân bổ tuyến bài"
        }
      : {
          steps: [
            {
              title: "1. The desk gathers the first signal sweep",
              body: "The system collects leads from the web, social platforms, official blogs, and communities to form the newsroom watchlist."
            },
            {
              title: "2. The editorial queue groups story lines",
              body: "Related signals are clustered together, assigned a trend, emerging, or verified state, and checked for ad eligibility."
            },
            {
              title: "3. Publishing distributes the page",
              body: "Once a story clears the guardrails, it flows into the homepage, feeds, sitemap, and bilingual routes with clear navigation."
            }
          ],
          guardrails: [
            "Trend pages stay indexable but do not render ad slots.",
            "Only qualified pages show advertising surfaces.",
            "Store CTAs stay light or switch off entirely on sensitive stories.",
            "Every story keeps source attribution and verification state visible."
          ],
          endpointsLabel: "Newsroom feeds and endpoints",
          matrixLabel: "Desk coverage mix"
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
      `/api/newsroom/radar?lang=${language}`,
      `/api/newsroom/live?lang=${language}`
    ]
  };
}

export function getLiveDeskData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const refreshedAt = state.runtime.generatedAt;
  const editor = state.runtime.editor;
  const cards =
    language === "vi"
      ? [
          { id: "refreshed", label: "Làm mới lúc", value: formatTimeOnly(language, refreshedAt) },
          { id: "status", label: "Tình trạng bàn tin", value: state.runtime.statusLabel.vi },
          {
            id: "watch",
            label: "Bài đang theo dõi",
            value: String(localized.filter((article) => article.verification_state !== "verified").length)
          },
          { id: "editor", label: "Biên tập trực", value: editor.name }
        ]
      : [
          { id: "refreshed", label: "Refreshed", value: formatTimeOnly(language, refreshedAt) },
          { id: "status", label: "Desk status", value: state.runtime.statusLabel.en },
          {
            id: "watch",
            label: "Stories under watch",
            value: String(localized.filter((article) => article.verification_state !== "verified").length)
          },
          { id: "editor", label: "Editor on duty", value: editor.name }
        ];

  return {
    refreshedAt,
    nextRefreshAt: state.runtime.nextRefreshAt,
    refreshIntervalMs: state.runtime.refreshIntervalMs,
    refreshedLabel: language === "vi" ? "Cập nhật tự động" : "Auto refresh",
    nextRefreshLabel: language === "vi" ? "Lượt quét tiếp theo" : "Next refresh",
    cards,
    ticker: localized.slice(0, 5).map((article) => ({
      href: article.href,
      title: article.title,
      topic: article.topic_label,
      verification_label: VERIFICATION_META[article.verification_state].labels[language],
      updated_text: formatRelativeFrom(refreshedAt, article.updated_at, language)
    }))
  };
}

export function getDashboardData(state, language) {
  const localized = getArticlesForLanguage(state, language);
  const headlineCards = [
    {
      label: language === "vi" ? "Bài đang live" : "Stories live",
      value: localized.length
    },
    {
      label: language === "vi" ? "Trang đủ ads" : "Ads ready",
      value: localized.filter((article) => article.ad_eligible).length
    },
    {
      label: language === "vi" ? "Trend only" : "Trend only",
      value: localized.filter((article) => article.verification_state === "trend").length
    },
    {
      label: language === "vi" ? "Chuyên mục active" : "Topics active",
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
          ? "Chờ xác nhận thêm"
          : "Waiting for stronger confirmation"
        : article.verification_state === "emerging"
          ? language === "vi"
            ? "Theo dõi để nâng hạng"
            : "Track for upgrade"
          : language === "vi"
            ? "Đang phân phối"
            : "Distributing"
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
          "README đã mô tả các route newsroom chính.",
          ".gitignore chặn file tạm, log và outbox.",
          "Feed JSON/RSS sẵn cho bot hoặc subscriber.",
          "Policy pages và sitemap đã có mặt."
        ]
      : [
          "README documents the main newsroom routes.",
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
    label: language === "vi" ? "Tình trạng bàn tin" : "Desk status"
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
      href: `/${language}/publishing-standards`,
      label: language === "vi" ? "Nguyên tắc xuất bản" : "Publishing Standards"
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
      ...(article.hero_image?.kind === "source" ? { image: article.hero_image.url } : {}),
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

export function buildStoryArtSvg(state, clusterId, language = "vi") {
  const article =
    state.articles.find((entry) => entry.cluster_id === clusterId && entry.language === language) ||
    state.articles.find((entry) => entry.cluster_id === clusterId) ||
    state.articles[0];

  return buildFallbackArtSvg(article, language);
}

function enrichArticle(article, { siteUrl, storeUrl }) {
  return {
    ...article,
    canonicalUrl: `${siteUrl}${article.href}`,
    storeUrl,
    hero_image: buildStoryVisual(article, siteUrl),
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

function buildRuntime(now, authors) {
  const statusIndex = now.getMinutes() % 3;
  const statusLabel =
    statusIndex === 0
      ? { vi: "Đang quét nguồn", en: "Scanning sources" }
      : statusIndex === 1
        ? { vi: "Đang làm mới headline", en: "Refreshing headlines" }
        : { vi: "Đang đẩy feed", en: "Refreshing feeds" };

  return {
    generatedAt: now.toISOString(),
    nextRefreshAt: new Date(now.getTime() + LIVE_REFRESH_MS).toISOString(),
    refreshIntervalMs: LIVE_REFRESH_MS,
    editor: authors[now.getMinutes() % authors.length] || authors[0],
    statusLabel
  };
}

function resolveContentPath(contentPath) {
  const raw = contentPath || process.env.NEWSROOM_CONTENT_PATH || DEFAULT_CONTENT_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function loadExternalArticles(contentPath, { topics, contentTypeMeta }) {
  try {
    if (!fs.existsSync(contentPath)) {
      return null;
    }

    const payload = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    const items = Array.isArray(payload) ? payload : Array.isArray(payload?.articles) ? payload.articles : null;

    if (!items || items.length === 0) {
      return null;
    }

    const normalized = items
      .map((article) => normalizeExternalArticle(article, { topics, contentTypeMeta }))
      .filter(Boolean);

    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeExternalArticle(article, { topics, contentTypeMeta }) {
  if (!article || typeof article !== "object") {
    return null;
  }

  const language = article.language === "en" ? "en" : "vi";
  const topic = topics.find((entry) => entry.id === article.topic);
  const typeMeta = contentTypeMeta[article.content_type];

  if (!topic || !typeMeta || !article.slug || !article.title) {
    return null;
  }

  return {
    id: article.id || `${article.cluster_id || article.slug}-${language}`,
    cluster_id: article.cluster_id || article.slug,
    language,
    topic: topic.id,
    topic_label: article.topic_label || topic.labels[language],
    topic_slug: article.topic_slug || topic.slugs[language],
    topic_accent: article.topic_accent || topic.accent,
    content_type: article.content_type,
    content_type_label: article.content_type_label || typeMeta.labels[language],
    path_segment: article.path_segment || typeMeta.segments[language],
    slug: article.slug,
    title: article.title,
    summary: article.summary || "",
    dek: article.dek || article.summary || "",
    sections: Array.isArray(article.sections) ? article.sections : [],
    image: normalizeExternalImage(article.image),
    verification_state: article.verification_state || "trend",
    quality_score: Number.isFinite(article.quality_score) ? article.quality_score : 80,
    ad_eligible: Boolean(article.ad_eligible),
    show_editorial_label: Boolean(article.show_editorial_label),
    indexable: article.indexable !== false,
    store_link_mode: article.store_link_mode || "off",
    related_store_items: Array.isArray(article.related_store_items) ? article.related_store_items : [],
    source_set: Array.isArray(article.source_set) ? article.source_set : [],
    author_id: article.author_id || "mai-linh",
    published_at: article.published_at || new Date().toISOString(),
    updated_at: article.updated_at || article.published_at || new Date().toISOString(),
    href: article.href || `/${language}/${typeMeta.segments[language]}/${article.slug}`
  };
}

function buildStoryVisual(article, siteUrl) {
  const directImage = normalizeSourceImage(article.image, article, siteUrl);

  if (directImage) {
    return directImage;
  }

  for (const source of article.source_set) {
    const sourceImage = normalizeSourceImage(source, article, siteUrl, source);

    if (sourceImage) {
      return sourceImage;
    }
  }

  return buildPlaceholderVisual(article);
}

function legacyStoryVisualBlock() {
  const { primary, secondary, deep } = colors;
  /*
    caption: {
      vi: "Ảnh bìa theo chuyên mục bài viết.",
      en: "Cover art aligned with the story topic."
    }
  */
  /*
  return {
    src,
    url: `${siteUrl}${src}`,
    alt:
      article.language === "vi"
        ? `Ảnh bìa cho bài: ${article.title}`
        : `Cover image for: ${article.title}`,
    caption: meta.caption[article.language] || article.summary,
    credit: "Patrick Tech Media",
    meta
  */
}

function getMotifMarkup(motif, colors) {
  const { primary, secondary, deep } = colors;

  if (motif === "assistant") {
    return `
      <circle cx="266" cy="118" r="54" fill="${secondary}" />
      <rect x="180" y="206" width="176" height="182" rx="34" fill="${primary}" />
      <rect x="208" y="236" width="120" height="104" rx="22" fill="#fffdf8" />
      <circle cx="244" cy="288" r="12" fill="${deep}" />
      <circle cx="292" cy="288" r="12" fill="${deep}" />
      <path d="M224 330 C246 350, 290 350, 312 330" fill="none" stroke="${deep}" stroke-width="10" stroke-linecap="round" />
      <path d="M164 440 C244 392, 288 392, 370 440" fill="none" stroke="${primary}" stroke-width="30" stroke-linecap="round" />
    `;
  }

  if (motif === "battery") {
    return `
      <rect x="156" y="204" width="224" height="330" rx="42" fill="${deep}" />
      <rect x="226" y="160" width="84" height="34" rx="16" fill="${deep}" />
      <rect x="182" y="232" width="172" height="274" rx="28" fill="#fffdf8" />
      <rect x="210" y="400" width="116" height="78" rx="22" fill="${primary}" />
      <path d="M278 270 L228 362 H278 L248 440" fill="none" stroke="${primary}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }

  if (motif === "handheld") {
    return `
      <rect x="102" y="252" width="332" height="200" rx="52" fill="${deep}" />
      <rect x="166" y="286" width="204" height="132" rx="28" fill="#fffdf8" />
      <circle cx="156" cy="354" r="26" fill="${primary}" />
      <circle cx="382" cy="354" r="26" fill="${primary}" />
      <circle cx="410" cy="322" r="10" fill="${secondary}" />
      <circle cx="438" cy="354" r="10" fill="${secondary}" />
      <circle cx="410" cy="386" r="10" fill="${secondary}" />
    `;
  }

  if (motif === "workspace") {
    return `
      <rect x="122" y="180" width="292" height="210" rx="28" fill="${primary}" />
      <rect x="154" y="212" width="228" height="146" rx="20" fill="#fffdf8" />
      <rect x="176" y="242" width="184" height="16" rx="8" fill="${secondary}" />
      <rect x="176" y="274" width="126" height="16" rx="8" fill="${secondary}" />
      <rect x="186" y="426" width="164" height="24" rx="12" fill="${deep}" />
      <rect x="148" y="450" width="238" height="24" rx="12" fill="${deep}" opacity="0.6" />
    `;
  }

  if (motif === "phone") {
    return `
      <rect x="186" y="142" width="164" height="376" rx="38" fill="${deep}" />
      <rect x="206" y="170" width="124" height="320" rx="26" fill="#fffdf8" />
      <circle cx="268" cy="454" r="10" fill="${primary}" />
      <rect x="232" y="212" width="72" height="14" rx="7" fill="${secondary}" />
      <rect x="232" y="246" width="86" height="86" rx="24" fill="${primary}" />
      <rect x="232" y="352" width="62" height="12" rx="6" fill="${secondary}" />
      <rect x="232" y="378" width="96" height="12" rx="6" fill="${secondary}" />
    `;
  }

  if (motif === "newsdesk") {
    return `
      <rect x="118" y="148" width="314" height="390" rx="34" fill="#fffdf8" stroke="${primary}" stroke-width="12" />
      <rect x="160" y="206" width="230" height="18" rx="9" fill="${secondary}" />
      <rect x="160" y="242" width="168" height="18" rx="9" fill="${secondary}" />
      <rect x="160" y="306" width="230" height="16" rx="8" fill="${primary}" opacity="0.8" />
      <rect x="160" y="338" width="230" height="16" rx="8" fill="${primary}" opacity="0.55" />
      <rect x="160" y="370" width="198" height="16" rx="8" fill="${primary}" opacity="0.32" />
      <circle cx="376" cy="456" r="46" fill="${primary}" />
      <rect x="160" y="444" width="174" height="18" rx="9" fill="${secondary}" />
    `;
  }

  if (motif === "notes") {
    return `
      <rect x="152" y="142" width="232" height="388" rx="30" fill="#fffdf8" stroke="${primary}" stroke-width="12" />
      <rect x="186" y="198" width="164" height="18" rx="9" fill="${secondary}" />
      <rect x="186" y="236" width="128" height="18" rx="9" fill="${secondary}" />
      <path d="M188 314 L224 350 L350 224" fill="none" stroke="${primary}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="186" y="404" width="164" height="16" rx="8" fill="${primary}" opacity="0.42" />
      <rect x="186" y="436" width="120" height="16" rx="8" fill="${primary}" opacity="0.24" />
    `;
  }

  if (motif === "comparison") {
    return `
      <rect x="110" y="186" width="132" height="308" rx="28" fill="${primary}" />
      <rect x="258" y="142" width="132" height="352" rx="28" fill="${secondary}" />
      <rect x="406" y="228" width="72" height="266" rx="22" fill="${deep}" />
      <circle cx="176" cy="450" r="18" fill="#fffdf8" />
      <circle cx="324" cy="450" r="18" fill="${deep}" />
      <circle cx="442" cy="450" r="14" fill="#fffdf8" />
    `;
  }

  if (motif === "laptop") {
    return `
      <rect x="132" y="162" width="304" height="220" rx="28" fill="${deep}" />
      <rect x="162" y="192" width="244" height="160" rx="18" fill="#fffdf8" />
      <rect x="104" y="392" width="360" height="34" rx="17" fill="${primary}" />
      <rect x="180" y="232" width="210" height="18" rx="9" fill="${secondary}" />
      <rect x="180" y="270" width="148" height="18" rx="9" fill="${secondary}" />
      <circle cx="370" cy="288" r="28" fill="${primary}" opacity="0.28" />
    `;
  }

  if (motif === "shield") {
    return `
      <path d="M270 132 L392 176 V310 C392 398, 338 470, 270 514 C202 470, 148 398, 148 310 V176 Z" fill="${primary}" />
      <path d="M270 184 L342 210 V304 C342 360, 310 412, 270 444 C230 412, 198 360, 198 304 V210 Z" fill="#fffdf8" />
      <path d="M228 320 L256 348 L316 276" fill="none" stroke="${deep}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }

  if (motif === "network") {
    return `
      <circle cx="170" cy="214" r="34" fill="${primary}" />
      <circle cx="382" cy="214" r="34" fill="${primary}" />
      <circle cx="276" cy="406" r="38" fill="${deep}" />
      <path d="M204 234 L348 234" fill="none" stroke="${secondary}" stroke-width="18" stroke-linecap="round" />
      <path d="M196 244 L258 372" fill="none" stroke="${secondary}" stroke-width="18" stroke-linecap="round" />
      <path d="M356 244 L294 372" fill="none" stroke="${secondary}" stroke-width="18" stroke-linecap="round" />
      <circle cx="276" cy="298" r="22" fill="#fffdf8" />
    `;
  }

  return `
    <circle cx="276" cy="276" r="148" fill="${secondary}" />
    <circle cx="276" cy="276" r="92" fill="${primary}" opacity="0.4" />
    <circle cx="276" cy="276" r="38" fill="${deep}" />
  `;
}

function buildFallbackArtSvg(article, language = "vi") {
  const title = article?.title || "Patrick Tech Media";
  const subtitle = language === "vi" ? "Ảnh nguồn đang được cập nhật" : "Source image pending";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(subtitle)}</desc>
  <rect width="1600" height="1000" fill="#f5efe5" />
  <rect x="60" y="60" width="1480" height="880" rx="40" fill="#fffdf8" />
  <text x="120" y="180" fill="#0f7f54" font-family="Arial, sans-serif" font-size="34" font-weight="700">PATRICK TECH MEDIA</text>
  <text x="120" y="320" fill="#14231d" font-family="Georgia, serif" font-size="78" font-weight="700">${escapeXml(subtitle)}</text>
</svg>`;
}

function normalizeExternalImage(image) {
  if (!image || typeof image !== "object") {
    return null;
  }

  return {
    src: image.src || image.url || "",
    alt: image.alt || "",
    caption: image.caption || "",
    credit: image.credit || "",
    source_url: image.source_url || ""
  };
}

function normalizeSourceImage(candidate, article, siteUrl, source = null) {
  const rawSrc =
    typeof candidate === "string"
      ? candidate
      : candidate?.src || candidate?.url || candidate?.image_url || candidate?.image || "";

  if (!isValidImageSource(rawSrc) || rawSrc.includes("/media/story/")) {
    return null;
  }

  return {
    kind: "source",
    src: rawSrc,
    url: toAbsoluteAssetUrl(rawSrc, siteUrl),
    alt:
      candidate?.alt ||
      candidate?.image_alt ||
      (article.language === "vi" ? `Ảnh tham khảo cho bài: ${article.title}` : `Reference image for: ${article.title}`),
    caption:
      candidate?.caption ||
      candidate?.image_caption ||
      (source?.source_name
        ? article.language === "vi"
          ? `Ảnh tham khảo từ ${source.source_name}.`
          : `Reference image from ${source.source_name}.`
        : article.summary),
    credit: candidate?.credit || candidate?.image_credit || source?.source_name || "Source",
    source_url: candidate?.source_url || source?.source_url || ""
  };
}

function buildPlaceholderVisual(article) {
  return {
    kind: "placeholder",
    src: "",
    url: "",
    alt:
      article.language === "vi"
        ? `Ảnh nguồn đang cập nhật cho bài: ${article.title}`
        : `Source image pending for: ${article.title}`,
    label: article.language === "vi" ? "Ảnh nguồn đang cập nhật" : "Source image pending",
    caption:
      article.language === "vi"
        ? "Bài viết sẽ hiển thị ảnh gốc khi pipeline thu thập được ảnh hợp lệ từ nguồn tham khảo."
        : "This story will show a reference image once the pipeline collects a valid source image.",
    credit: ""
  };
}

function isValidImageSource(value) {
  return typeof value === "string" && /^(https?:\/\/|\/)/i.test(value);
}

function toAbsoluteAssetUrl(value, siteUrl) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${normalizeSiteUrl(siteUrl)}${value.startsWith("/") ? value : `/${value}`}`;
}

function wrapText(value, maxLength, maxLines) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  let consumed = 0;

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength || !current) {
      current = next;
      consumed += word.length + 1;
      continue;
    }

    lines.push(current);
    current = word;
    consumed += word.length + 1;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (consumed < String(value).length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]+$/, "")}…`;
  }

  return lines;
}

function formatTimeOnly(language, dateString) {
  return TIME_ONLY_FORMATTERS[language].format(new Date(dateString));
}

function formatRelativeFrom(baseDate, targetDate, language) {
  const deltaMs = Math.max(0, new Date(baseDate).getTime() - new Date(targetDate).getTime());
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));

  if (minutes <= 1) {
    return language === "vi" ? "vừa cập nhật" : "just updated";
  }

  return language === "vi" ? `${minutes} phút trước` : `${minutes} minutes ago`;
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
