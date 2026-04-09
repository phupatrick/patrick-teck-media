import fs from "node:fs";
import path from "node:path";
import { evaluateArticleReadiness, isArticlePublishReady } from "./newsroom-quality.mjs";
import { createNewsroomStore, normalizeNewsroomPayload } from "./newsroom-store.mjs";
import { createOpenClawWebStore, normalizeOpenClawWebState } from "./openclaw-web-store.mjs";
import { repairEncodingArtifacts } from "./text-repair.mjs";
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
const DEFAULT_WEB_STATE_PATH = path.join(process.cwd(), "data", "openclaw-web-state.json");
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

const TOPIC_ALIASES = {
  ai: "ai",
  "artificial-intelligence": "ai",
  artificial_intelligence: "ai",
  app: "apps-software",
  apps: "apps-software",
  software: "apps-software",
  "apps-software": "apps-software",
  device: "devices",
  hardware: "devices",
  devices: "devices",
  privacy: "security",
  security: "security",
  game: "gaming",
  games: "gaming",
  gaming: "gaming",
  internet: "internet-business-tech",
  business: "internet-business-tech",
  social: "internet-business-tech",
  "internet-business": "internet-business-tech",
  "internet-business-tech": "internet-business-tech"
};

const TOPIC_TIE_BREAK = ["ai", "security", "internet-business-tech", "apps-software", "devices", "gaming"];

const TOPIC_KEYWORD_RULES = [
  {
    topic: "gaming",
    score: 24,
    pattern: /\b(game|gaming|gta|nintendo|switch ?2|playstation|xbox|pubg|rockstar|the last of us|crimson desert|everness|krafton|dlss)\b/i
  },
  {
    topic: "security",
    score: 22,
    pattern: /\b(passkeys?|security|bảo mật|cryptosystem|cryptography|phishing|malware|breach|privacy|hack(?:ed|ing)?|cảnh báo|warning|ransomware|elliptic curve|quantum)\b/i
  },
  {
    topic: "ai",
    score: 20,
    pattern: /\b(artificial intelligence|chatgpt|openai|gemini|claude|copilot|llm|deepseek|midjourney|cursor|npu|ai agent|ai model|trợ lý ai)\b/i
  },
  {
    topic: "devices",
    score: 22,
    pattern: /\b(device|devices|phone|smartphone|android|iphone|pixel|laptop|macbook|ipad|chip|cpu|gpu|ram|memory|ssd|pc|desktop|headphones|tablet|router|fiber|hardware|wearable|refurbished)\b/i
  },
  {
    topic: "apps-software",
    score: 16,
    pattern: /\b(app|apps|software|windows|macos|chrome|google photos|quick share|truecaller|workspace|notion|slack|editor|feature)\b/i
  },
  {
    topic: "internet-business-tech",
    score: 18,
    pattern: /\b(meta|facebook|instagram|threads|tiktok|youtube|social|creator|cloud|startup|agency|amazon|shopee|lazada|platform|users)\b/i
  }
];

const SOURCE_TOPIC_HINTS = [
  {
    topic: "gaming",
    score: 28,
    pattern: /\b(apps-games|gamek|ign|gamesradar|pc gamer|kotaku|polygon)\b/i
  },
  {
    topic: "devices",
    score: 10,
    pattern: /\b(9to5google|android authority|tom's hardware|anandtech)\b/i
  },
  {
    topic: "internet-business-tech",
    score: 10,
    pattern: /\b(techcrunch|social media today|the information|reuters|bloomberg)\b/i
  },
  {
    topic: "security",
    score: 10,
    pattern: /\b(ars technica|bleepingcomputer|the hacker news)\b/i
  }
];

const FRONT_PAGE_TOPIC_WEIGHTS = {
  ai: 78,
  "internet-business-tech": 50,
  security: 42,
  "apps-software": 30,
  devices: 16,
  gaming: 6
};

const FRONT_PAGE_SOURCE_WEIGHTS = {
  "official-site": 16,
  press: 10,
  "official-social": 8,
  "editorial-research": 8,
  "internal-roundup": 6,
  community: -8,
  "social-buzz": -10
};

export function buildNewsroomState(options = {}) {
  const siteUrl = normalizeSiteUrl(options.siteUrl || "https://patricktechmedia.com");
  const storeUrl = normalizeSiteUrl(options.storeUrl || "https://patricktechstore.vercel.app");
  const now = new Date(options.now || new Date().toISOString());
  const topics = getTopics();
  const contentTypeMeta = getContentTypeMeta();
  const contentPath = resolveContentPath(options.contentPath);
  const webStatePath = resolveWebStatePath(options.webStatePath);
  const webControl = normalizeOpenClawWebState(options.webControl || loadLocalOpenClawWebState(webStatePath));
  const baseArticles = Array.isArray(options.externalArticles)
    ? normalizeInjectedArticles(options.externalArticles, { topics, contentTypeMeta })
    : loadExternalArticles(contentPath, { topics, contentTypeMeta }) || buildArticles();
  const sourceArticles = mergeArticleSets(baseArticles, normalizeInjectedArticles(options.injectedArticles, { topics, contentTypeMeta })).filter(
    isArticlePublishReady
  );
  const assetVersion = resolveAssetVersion(options.assetVersion, sourceArticles, now);
  const frontPageTopicWeights = {
    ...FRONT_PAGE_TOPIC_WEIGHTS,
    ...webControl.ranking.topicWeights
  };
  const frontPageSourceWeights = {
    ...FRONT_PAGE_SOURCE_WEIGHTS,
    ...webControl.ranking.sourceTypeWeights
  };
  const articles = sourceArticles.map((article) => enrichArticle(article, { siteUrl, storeUrl }));
  const articlesByHref = new Map(articles.map((article) => [article.href, article]));
  const storeItems = getStoreItems().map((item) => ({
    ...item,
    url: `${storeUrl}${item.path}`
  }));
  const authors = [...getAuthors(), ...collectExternalAuthors(sourceArticles)].map((author) => ({
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
        vi: "Patrick Tech Media là toà soạn công nghệ của Patrick Tech Co. VN, theo dõi AI, Big Tech, mạng xã hội, thiết bị và thủ thuật đáng lưu.",
        en: "Patrick Tech Media is the technology newsroom of Patrick Tech Co. VN, covering AI, Big Tech, social platforms, devices, and useful how-tos."
      },
      shortDescription: {
        vi: "Tin công nghệ, AI, Big Tech, mạng xã hội và thủ thuật đáng lưu.",
        en: "Technology, AI, Big Tech, social platforms, and useful how-tos."
      },
      siteUrl,
      storeUrl,
      webStatePath,
      assetVersion,
      frontpageCopy: webControl.frontpageCopy,
      frontPageTopicWeights,
      frontPageSourceWeights,
      openclaw: {
        generatedAt: webControl.generated_at,
        manager: webControl.manager,
        permissions: webControl.permissions
      },
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
  const prioritized = sortStoriesForFrontPage(
    localized,
    state.runtime.generatedAt,
    state.site.frontPageTopicWeights,
    state.site.frontPageSourceWeights
  );
  const readyPrioritized = prioritizeFrontPageStories(prioritized);
  const packageCandidates = prioritizeFrontPageStories(sortStoriesForFrontPage(
    localized.filter((article) => isAiPackageFrontpageCandidate(article)),
    state.runtime.generatedAt,
    state.site.frontPageTopicWeights,
    state.site.frontPageSourceWeights
  ));
  const verifiedStories = prioritizeFrontPageStories(prioritized.filter(
    (article) => article.verification_state === "verified" && article.content_type === "NewsArticle"
  ));
  const leadStories = prioritizeFrontPageStories(prioritized.filter(
    (article) => article.content_type === "NewsArticle" && article.verification_state !== "trend"
  ));
  const packageLeadStories = packageCandidates.filter((article) => article.content_type !== "EvergreenGuide");
  const sameDayLeadStories = leadStories.filter((article) => isStoryPublishedOnAnchorDay(article, state.runtime.generatedAt));
  const sameDayVerifiedStories = verifiedStories.filter((article) => isStoryPublishedOnAnchorDay(article, state.runtime.generatedAt));
  const sameDayReadyStories = prioritizeFrontPageStories(
    readyPrioritized.filter((article) => isStoryPublishedOnAnchorDay(article, state.runtime.generatedAt))
  );
  const featured =
    sameDayLeadStories.find((article) => isFrontPageReady(article)) ||
    sameDayLeadStories.find((article) => article.hero_image?.kind === "source") ||
    sameDayVerifiedStories.find((article) => isFrontPageReady(article)) ||
    packageLeadStories.find((article) => article.hero_image?.kind === "source") ||
    leadStories.find((article) => article.topic === "ai" && article.hero_image?.kind === "source") ||
    leadStories.find((article) => article.hero_image?.kind === "source") ||
    packageLeadStories[0] ||
    leadStories[0] ||
    verifiedStories.find((article) => article.hero_image?.kind === "source") ||
    verifiedStories[0] ||
    prioritized[0] ||
    localized[0];
  const freshnessAnchor = featured?.updated_at || featured?.published_at || readyPrioritized[0]?.updated_at || readyPrioritized[0]?.published_at;
  const sameDayBriefingStories = readyPrioritized.filter(
    (article) =>
      article?.href !== featured?.href &&
      !isSameStoryFamily(article, featured) &&
      isStoryPublishedOnAnchorDay(article, freshnessAnchor)
  );
  const briefing =
    sameDayBriefingStories.find(
      (article) => article.content_type === "Roundup" && isContrastingLeadStory(article, featured)
    ) ||
    sameDayBriefingStories.find((article) => isContrastingLeadStory(article, featured)) ||
    sameDayBriefingStories.find((article) => getStoryTopicKey(article) !== getStoryTopicKey(featured)) ||
    readyPrioritized.find(
      (article) =>
        article.content_type === "Roundup" &&
        isContrastingLeadStory(article, featured) &&
        isStoryFreshRelativeToAnchor(article, freshnessAnchor, 5)
    ) ||
    readyPrioritized.find((article) => isContrastingLeadStory(article, featured)) ||
    readyPrioritized.find(
      (article) =>
        article.content_type === "Roundup" &&
        !isSameStoryFamily(article, featured) &&
        isStoryFreshRelativeToAnchor(article, freshnessAnchor, 5)
    ) ||
    readyPrioritized.find((article) => !isSameStoryFamily(article, featured)) ||
    readyPrioritized[0] ||
    localized[0];
  const latest = selectDiverseFrontPageStories([...sameDayReadyStories, ...readyPrioritized], 10, {
    excludeStories: [featured, briefing],
    maxPerTopic: { ai: 2, devices: 3, default: 2 },
    maxPerSource: 2
  });
  const packageWatch = selectDiverseFrontPageStories(packageCandidates, 8, {
    excludeStories: [featured, briefing],
    maxPerSource: 2
  });
  const trending = selectDiverseFrontPageStories(
    prioritizeFrontPageStories(prioritized.filter((article) => article.verification_state !== "verified")),
    6,
    {
      excludeStories: [featured, briefing],
      maxPerTopic: { ai: 2, devices: 2, default: 2 },
      maxPerSource: 2
    }
  );
  const evergreen = selectDiverseFrontPageStories(prioritizeFrontPageStories(sortStoriesForFrontPage(
    localized.filter((article) => article.content_type === "EvergreenGuide" || article.content_type === "ComparisonPage"),
    state.runtime.generatedAt,
    state.site.frontPageTopicWeights,
    state.site.frontPageSourceWeights
  )), 8, {
    excludeStories: [featured, briefing, ...packageWatch],
    maxPerTopic: { ai: 2, devices: 2, default: 2 },
    maxPerSource: 2
  });
  const tips = selectDiverseFrontPageStories(prioritizeFrontPageStories(sortStoriesForFrontPage(
    localized.filter((article) => isPracticalTipsCandidate(article) && isGuideLedTipsCandidate(article)),
    state.runtime.generatedAt,
    state.site.frontPageTopicWeights,
    state.site.frontPageSourceWeights
  )), 8, {
    excludeStories: [featured, briefing, ...packageWatch, ...evergreen],
    maxPerTopic: { ai: 2, "apps-software": 3, default: 2 },
    maxPerSource: 1
  });
  const browserStories = selectDiverseFrontPageStories(readyPrioritized, 10, {
    excludeStories: [featured, briefing, ...latest, ...packageWatch],
    maxPerTopic: { ai: 2, devices: 3, default: 2 },
    maxPerSource: 2
  });
  const topicSectionSeeds = [featured, briefing, ...latest, ...browserStories];
  const topicSections = state.topics
    .map((topic) => {
      const stories = buildHomeTopicSectionStories(
        localized.filter((article) => article.topic === topic.id),
        state.runtime.generatedAt,
        state.site.frontPageTopicWeights,
        state.site.frontPageSourceWeights,
        {
          excludeStories: topicSectionSeeds,
          maxPerSource: 2
        }
      );

      if (!stories.length) {
        return null;
      }

      return {
        ...topic,
        label: topic.labels[language],
        slug: topic.slugs[language],
        stories
      };
    })
    .filter(Boolean);

  return {
    featured,
    briefing,
    trending,
    evergreen,
    packageWatch,
    tips,
    latest,
    liveDesk: getLiveDeskData(state, language),
    browserStories,
    topicSections,
    metrics: getNewsroomMetrics(state, language)
  };
}

export async function loadNewsroomState(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || "";

  if (!databaseUrl) {
    return buildNewsroomState(options);
  }

  const store = createNewsroomStore({
    contentPath: options.contentPath || DEFAULT_CONTENT_PATH,
    databaseUrl
  });
  const webStore = createOpenClawWebStore({
    statePath: options.webStatePath || DEFAULT_WEB_STATE_PATH,
    databaseUrl
  });
  const [payload, webControl] = await Promise.all([
    store.readPayload(),
    webStore.readState()
  ]);
  return buildNewsroomState({
    ...options,
    externalArticles: normalizeNewsroomPayload(payload).articles,
    webControl
  });
}

function sortStoriesForFrontPage(stories, anchorDate, topicWeights = FRONT_PAGE_TOPIC_WEIGHTS, sourceWeights = FRONT_PAGE_SOURCE_WEIGHTS) {
  return [...stories].sort((left, right) => {
    const scoreGap =
      computeFrontPagePriority(right, anchorDate, topicWeights, sourceWeights) -
      computeFrontPagePriority(left, anchorDate, topicWeights, sourceWeights);

    if (scoreGap !== 0) {
      return scoreGap;
    }

    return sortByDateDesc(left.updated_at || left.published_at, right.updated_at || right.published_at);
  });
}

function prioritizeFrontPageStories(stories) {
  const ready = stories.filter(isFrontPageReady);

  if (!ready.length) {
    return [...stories];
  }

  return dedupeStoriesByHref([...ready, ...stories]);
}

function selectDiverseFrontPageStories(stories, limit, options = {}) {
  const selected = [];
  const overflow = [];
  const seenHrefs = new Set();
  const seenClusters = new Set();
  const seenTitles = new Set();
  const topicCounts = new Map();
  const sourceCounts = new Map();
  const normalizedStories = dedupeStoriesByHref(stories);
  const excludeStories = Array.isArray(options.excludeStories) ? options.excludeStories : [];

  for (const article of excludeStories) {
    const href = article?.href;
    const clusterKey = getStoryClusterKey(article);
    const titleKey = getStoryTitleFingerprint(article);

    if (href) {
      seenHrefs.add(href);
    }

    if (clusterKey) {
      seenClusters.add(clusterKey);
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }
  }

  const trySelect = (article, enforceCaps) => {
    if (!article || selected.length >= limit) {
      return true;
    }

    const href = article.href;
    const clusterKey = getStoryClusterKey(article);
    const titleKey = getStoryTitleFingerprint(article);
    const topicKey = getStoryTopicKey(article);
    const sourceKey = getStorySourceKey(article);

    if (!href || seenHrefs.has(href) || (clusterKey && seenClusters.has(clusterKey)) || (titleKey && seenTitles.has(titleKey))) {
      return false;
    }

    if (enforceCaps) {
      const topicLimit = resolveDiversityLimit(options.maxPerTopic, topicKey);
      const sourceLimit = resolveDiversityLimit(options.maxPerSource, sourceKey);

      if (
        ((topicLimit < Number.POSITIVE_INFINITY) && (topicCounts.get(topicKey) || 0) >= topicLimit) ||
        ((sourceLimit < Number.POSITIVE_INFINITY) && sourceKey && (sourceCounts.get(sourceKey) || 0) >= sourceLimit)
      ) {
        overflow.push(article);
        return false;
      }
    }

    selected.push(article);
    seenHrefs.add(href);

    if (clusterKey) {
      seenClusters.add(clusterKey);
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }

    topicCounts.set(topicKey, (topicCounts.get(topicKey) || 0) + 1);

    if (sourceKey) {
      sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    }

    return selected.length >= limit;
  };

  for (const article of normalizedStories) {
    if (trySelect(article, true)) {
      break;
    }
  }

  if (selected.length < limit) {
    for (const article of overflow) {
      if (trySelect(article, false)) {
        break;
      }
    }
  }

  return selected;
}

function computeFrontPagePriority(article, anchorDate, topicWeights = FRONT_PAGE_TOPIC_WEIGHTS, sourceWeights = FRONT_PAGE_SOURCE_WEIGHTS) {
  const topic = normalizeTopicId(article.topic);
  const sourceTypes = [...new Set((article.source_set || []).map((source) => source.source_type))];
  const sourceNames = [article.source_name, ...(article.source_set || []).map((source) => source.source_name)].filter(Boolean).join(" ");
  const textBlob = [
    article.title,
    article.summary,
    article.dek,
    article.hook,
    ...(article.sections || []).flatMap((section) => [section.heading, section.body])
  ]
    .filter(Boolean)
    .join(" ");

  let score = topicWeights[topic] || 12;
  score += article.content_type === "NewsArticle" ? 18 : article.content_type === "Roundup" ? 8 : 10;
  score += article.verification_state === "verified" ? 26 : article.verification_state === "emerging" ? 14 : -16;
  score += article.ad_eligible ? 6 : 0;
  score += article.hero_image?.kind === "source" ? 10 : article.hero_image ? 4 : -12;
  score += Math.max(-10, Math.min(12, (article.quality_score || 80) - 82));
  score += computeFreshnessPriority(article, anchorDate);

  for (const sourceType of sourceTypes) {
    score += sourceWeights[sourceType] || 0;
  }

  if (sourceTypes.length > 1) {
    score += 4;
  }

  if (/\b(openai|google|meta|microsoft|apple|nvidia|tiktok|youtube|android|iphone|chip|cloud|startup)\b/i.test(textBlob)) {
    score += 8;
  }

  if (hasStrongAiSignals(textBlob)) {
    score += 8;
  }

  if (isAiPackageFrontpageCandidate(article)) {
    score += 20;
  }

  if (topic === "ai" && article.content_type === "ComparisonPage") {
    score += 12;
  }

  if (topic === "ai" && article.content_type === "EvergreenGuide") {
    score += 10;
  }

  if (isPracticalTipsCandidate(article) && /(?:chatgpt|gemini|claude|copilot|notebooklm|workspace|google ai pro|google one)/i.test(textBlob)) {
    score += 8;
  }

  if (/\b(game|gaming|gta|nintendo|switch ?2|playstation|xbox|pubg|rockstar|the last of us|crimson desert|everness|krafton|dlss)\b/i.test(textBlob)) {
    score -= topic === "gaming" ? 2 : 18;
  }

  if (/\b(techcrunch|ars technica|9to5google|android authority|the verge|reuters|bloomberg)\b/i.test(sourceNames)) {
    score += 6;
  }

  return score;
}

function isFrontPageReady(article) {
  const heroAlt = String(article?.hero_image?.alt || "").trim();
  const heroCaption = String(article?.hero_image?.caption || "").trim();

  return Boolean(
    article &&
    article.readiness?.ready !== false &&
    article.hero_image?.kind === "source" &&
    heroAlt.length >= 20 &&
    heroCaption.length >= 20 &&
    article.readiness?.checks?.sourceAttribution !== false
  );
}

function buildHomeTopicSectionStories(stories, anchorDate, topicWeights, sourceWeights, options = {}) {
  const sorted = prioritizeFrontPageStories(sortStoriesForFrontPage(
    stories,
    anchorDate,
    topicWeights,
    sourceWeights
  ));
  const ready = sorted.filter(isFrontPageReady);
  const illustrated = sorted.filter((article) => article?.hero_image?.kind === "source");

  if (ready.length >= 2) {
    const primary = selectDiverseFrontPageStories(ready, 4, options);

    if (primary.length >= 3) {
      return primary;
    }

    return selectDiverseFrontPageStories(ready, 4, {
      ...options,
      excludeStories: []
    });
  }

  if (illustrated.length >= 2) {
    const candidates = [...ready, ...illustrated, ...sorted];
    const primary = selectDiverseFrontPageStories(candidates, 3, options);

    if (primary.length >= 2) {
      return primary;
    }

    return selectDiverseFrontPageStories(candidates, 3, {
      ...options,
      excludeStories: []
    });
  }

  return [];
}

function dedupeStoriesByHref(stories) {
  const seen = new Set();

  return stories.filter((article) => {
    const href = article?.href;

    if (!href || seen.has(href)) {
      return false;
    }

    seen.add(href);
    return true;
  });
}

function isSameStoryFamily(left, right) {
  if (!left || !right) {
    return false;
  }

  if (left.href && right.href && left.href === right.href) {
    return true;
  }

  const leftCluster = getStoryClusterKey(left);
  const rightCluster = getStoryClusterKey(right);

  if (leftCluster && rightCluster && leftCluster === rightCluster) {
    return true;
  }

  const leftTitle = getStoryTitleFingerprint(left);
  const rightTitle = getStoryTitleFingerprint(right);

  return Boolean(leftTitle && rightTitle && leftTitle === rightTitle);
}

function isContrastingLeadStory(candidate, featured) {
  if (!candidate || !featured || isSameStoryFamily(candidate, featured)) {
    return false;
  }

  const candidateTopic = getStoryTopicKey(candidate);
  const featuredTopic = getStoryTopicKey(featured);
  const candidateSource = getStorySourceKey(candidate);
  const featuredSource = getStorySourceKey(featured);

  if (candidateTopic !== featuredTopic && candidateSource && featuredSource && candidateSource !== featuredSource) {
    return true;
  }

  return candidateTopic !== featuredTopic;
}

function getStoryTopicKey(article) {
  return normalizeTopicId(article?.topic) || String(article?.topic || "misc");
}

function getStorySourceKey(article) {
  return normalizeStoryKey(
    article?.source_name ||
      article?.source_set?.[0]?.source_name ||
      article?.source_set?.map((source) => source?.source_name).find(Boolean) ||
      ""
  );
}

function getStoryClusterKey(article) {
  return normalizeStoryKey(article?.cluster_id || "");
}

function getStoryTitleFingerprint(article) {
  return normalizeStoryKey(
    String(article?.title || article?.slug || "")
      .replace(/\|\s*c(?:a|ậ|ậ)p nh(?:a|ậ|ậ)t nhanh.*$/i, " ")
      .replace(/\bcap nhat nhanh\b.*$/i, " ")
      .replace(/\bpatrick tech media\b/gi, " ")
  );
}

function normalizeStoryKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(va|voi|cho|the|and|for|news|story|update|live|editorial|patrick|tech|media)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDiversityLimit(limitConfig, key) {
  if (typeof limitConfig === "number" && Number.isFinite(limitConfig)) {
    return limitConfig;
  }

  if (!limitConfig || typeof limitConfig !== "object") {
    return Number.POSITIVE_INFINITY;
  }

  if (key && Object.hasOwn(limitConfig, key) && Number.isFinite(limitConfig[key])) {
    return limitConfig[key];
  }

  if (Object.hasOwn(limitConfig, "default") && Number.isFinite(limitConfig.default)) {
    return limitConfig.default;
  }

  return Number.POSITIVE_INFINITY;
}

function computeFreshnessPriority(article, anchorDate) {
  const anchorTimestamp = new Date(anchorDate || Date.now()).getTime();
  const articleTimestamp = new Date(article.updated_at || article.published_at || 0).getTime();

  if (!Number.isFinite(anchorTimestamp) || !Number.isFinite(articleTimestamp)) {
    return 0;
  }

  const hours = Math.abs(anchorTimestamp - articleTimestamp) / (1000 * 60 * 60);

  if (hours <= 6) {
    return 18;
  }

  if (hours <= 12) {
    return 14;
  }

  if (hours <= 24) {
    return 10;
  }

  if (hours <= 48) {
    return 6;
  }

  if (hours <= 72) {
    return 3;
  }

  return 0;
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
      ...(process.env.PUBLIC_FEED_ENABLED === "true" && process.env.PUBLIC_FEED_TOKEN
        ? [`/${language}/feed.json`, `/${language}/feed.xml`]
        : []),
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
  const links = [
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
    
  ];

  return links;
}

export function getPrimaryNav(state, language) {
  return [
    ...state.topics.map((topic) => ({
      href: `/${language}/topics/${topic.slugs[language]}`,
      label: topic.labels[language]
    })),
    { href: `/${language}/authors`, label: language === "vi" ? "Tác giả" : "Authors" }
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
    if (process.env.PUBLIC_FEED_ENABLED === "true" && process.env.PUBLIC_FEED_TOKEN) {
      entries.push({ href: `/${language}/feed.json`, updated_at: latestLanguageTimestamp(state, language) });
      entries.push({ href: `/${language}/feed.xml`, updated_at: latestLanguageTimestamp(state, language) });
    }

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

export function buildNewsSitemapXml(state) {
  const items = state.articles
    .filter((article) => article.indexable && article.content_type === "NewsArticle")
    .sort((left, right) => new Date(right.updated_at || right.published_at) - new Date(left.updated_at || left.published_at))
    .slice(0, 1000)
    .map((article) => {
      const publicationDate = new Date(article.published_at).toISOString();
      return [
        "<url>",
        `  <loc>${escapeXml(`${state.site.siteUrl}${article.href}`)}</loc>`,
        "  <news:news>",
        "    <news:publication>",
        `      <news:name>${escapeXml(state.site.name)}</news:name>`,
        `      <news:language>${article.language}</news:language>`,
        "    </news:publication>",
        `    <news:publication_date>${publicationDate}</news:publication_date>`,
        `    <news:title>${escapeXml(article.title)}</news:title>`,
        "  </news:news>",
        "</url>"
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${items}\n</urlset>\n`;
}

export function buildRobotsTxt(state) {
  return `User-agent: *\nAllow: /\nSitemap: ${state.site.siteUrl}/sitemap.xml\nSitemap: ${state.site.siteUrl}/sitemap-news.xml\n`;
}

export function buildJsonFeed(state, language) {
  const items = getArticlesForLanguage(state, language);
  const feedEnabled = process.env.PUBLIC_FEED_ENABLED === "true" && Boolean(process.env.PUBLIC_FEED_TOKEN);
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: `${state.site.name} (${language.toUpperCase()})`,
    home_page_url: `${state.site.siteUrl}/${language}/`,
    ...(feedEnabled ? { feed_url: `${state.site.siteUrl}/${language}/feed.json` } : {}),
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

function resolveWebStatePath(webStatePath) {
  const raw = webStatePath || process.env.OPENCLAW_WEB_STATE_PATH || DEFAULT_WEB_STATE_PATH;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function loadLocalOpenClawWebState(webStatePath) {
  try {
    if (!fs.existsSync(webStatePath)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(webStatePath, "utf8"));
  } catch {
    return {};
  }
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

function normalizeInjectedArticles(articles, { topics, contentTypeMeta }) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  return articles
    .map((article) => normalizeExternalArticle(article, { topics, contentTypeMeta }))
    .filter(Boolean);
}

function mergeArticleSets(primaryArticles, injectedArticles) {
  const articleMap = new Map();

  for (const article of [...(primaryArticles || []), ...(injectedArticles || [])]) {
    const key = article.id || article.href || `${article.language}:${article.content_type}:${article.slug}`;
    const previous = articleMap.get(key);

    if (!previous || new Date(article.updated_at || article.published_at || 0) >= new Date(previous.updated_at || previous.published_at || 0)) {
      articleMap.set(key, article);
    }
  }

  return [...articleMap.values()].sort(sortArticlesByDateDesc);
}

function isStoryFreshRelativeToAnchor(article, anchorDateString, maxAgeInDays) {
  if (!anchorDateString) {
    return true;
  }

  const articleTimestamp = new Date(article.updated_at || article.published_at || 0).getTime();
  const anchorTimestamp = new Date(anchorDateString).getTime();

  if (!Number.isFinite(articleTimestamp) || !Number.isFinite(anchorTimestamp)) {
    return true;
  }

  return Math.abs(anchorTimestamp - articleTimestamp) <= maxAgeInDays * 24 * 60 * 60 * 1000;
}

function isStoryPublishedOnAnchorDay(article, anchorDateString) {
  const articleDate = article?.updated_at || article?.published_at;

  if (!articleDate || !anchorDateString) {
    return false;
  }

  return buildSaigonDateKey(articleDate) === buildSaigonDateKey(anchorDateString);
}

function buildSaigonDateKey(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = DATE_FORMATTERS.en.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

function normalizeExternalArticle(article, { topics, contentTypeMeta }) {
  if (!article || typeof article !== "object") {
    return null;
  }

  const language = article.language === "en" ? "en" : "vi";
  const topic = resolveExternalArticleTopic(article, topics);
  const typeMeta = contentTypeMeta[article.content_type];

  if (!topic || !typeMeta || !article.slug || !article.title) {
    return null;
  }

  const verificationState = article.verification_state || "trend";
  const sections = Array.isArray(article.sections) ? article.sections : [];
  const summary = polishExternalSummary({
    value: article.summary || "",
    dek: article.dek || "",
    sections,
    language
  });
  const dek = polishExternalDek({
    value: article.dek || "",
    summary,
    sections,
    language
  });
  const title = strengthenEditorialTitle(article.title, {
    language,
    topic: topic.id,
    verificationState,
    contentType: article.content_type,
    summary,
    dek,
    sections
  });
  const hook = normalizeArticleHook(article, {
    language,
    topic: topic.id,
    verificationState,
    contentType: article.content_type,
    title,
    summary,
    dek,
    sections
  });
  const sourceSet = sanitizePublicSourceSet(article.source_set);
  const expandedSections = buildEditorialSections({
    language,
    topic: topic.id,
    verificationState,
    contentType: article.content_type,
    title,
    summary,
    dek,
    hook,
    sections,
    sourceSet
  });
  const image = sanitizePublicImage(normalizeExternalImage(article.image));

  if (containsBlockedPublicBranding([title, summary, dek, hook, ...expandedSections.flatMap((section) => [section.heading, section.body])].join(" "))) {
    return null;
  }

  const normalizedArticle = {
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
    title,
    hook,
    author_name: article.author_name || "",
    author_role_vi: article.author_role_vi || "",
    author_role_en: article.author_role_en || "",
    summary,
    dek,
    sections: expandedSections,
    image,
    verification_state: verificationState,
    quality_score: Number.isFinite(article.quality_score) ? article.quality_score : 80,
    ad_eligible: Boolean(article.ad_eligible),
    show_editorial_label: Boolean(article.show_editorial_label),
    indexable: article.indexable !== false,
    store_link_mode: article.store_link_mode || "off",
    related_store_items: Array.isArray(article.related_store_items) ? article.related_store_items : [],
    editorial_focus: Array.isArray(article.editorial_focus) ? article.editorial_focus : [],
    source_set: sourceSet,
    author_id: article.author_id || "mai-linh",
    published_at: article.published_at || new Date().toISOString(),
    updated_at: article.updated_at || article.published_at || new Date().toISOString(),
    href: article.href || `/${language}/${typeMeta.segments[language]}/${article.slug}`
  };

  normalizedArticle.readiness = evaluateArticleReadiness(normalizedArticle);
  return normalizedArticle;
}

function resolveExternalArticleTopic(article, topics) {
  const explicitTopicId = normalizeTopicId(article.topic);
  const topicId = explicitTopicId || inferArticleTopicId(article);
  return topics.find((entry) => entry.id === topicId) || null;
}

function inferArticleTopicId(article) {
  const fallbackTopic = normalizeTopicId(article.topic) || "ai";
  const scores = new Map(TOPIC_TIE_BREAK.map((topic) => [topic, 0]));
  const textBlob = [
    article.title,
    article.summary,
    article.dek,
    article.hook,
    ...(Array.isArray(article.sections) ? article.sections.flatMap((section) => [section.heading, section.body]) : [])
  ]
    .filter(Boolean)
    .join(" ");
  const sourceBlob = [
    article.source_name,
    article.source_type,
    ...(Array.isArray(article.source_set)
      ? article.source_set.flatMap((source) => [source.source_name, source.source_type, source.region, source.language])
      : [])
  ]
    .filter(Boolean)
    .join(" ");

  scores.set(fallbackTopic, (scores.get(fallbackTopic) || 0) + 8);

  for (const rule of TOPIC_KEYWORD_RULES) {
    if (rule.pattern.test(textBlob)) {
      scores.set(rule.topic, (scores.get(rule.topic) || 0) + rule.score);
    }
  }

  if (!hasStrongAiSignals(textBlob)) {
    scores.set("ai", Math.max(0, (scores.get("ai") || 0) - 18));
  }

  for (const hint of SOURCE_TOPIC_HINTS) {
    if (hint.pattern.test(sourceBlob)) {
      scores.set(hint.topic, (scores.get(hint.topic) || 0) + hint.score);
    }
  }

  if ((article.source_set || []).some((source) => source.source_type === "official-social")) {
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 6);
  }

  if ((article.source_set || []).some((source) => source.source_type === "community" || source.source_type === "social-buzz")) {
    scores.set("gaming", (scores.get("gaming") || 0) + 4);
  }

  return TOPIC_TIE_BREAK.reduce((bestTopic, topic) => {
    const bestScore = scores.get(bestTopic) || Number.NEGATIVE_INFINITY;
    const currentScore = scores.get(topic) || Number.NEGATIVE_INFINITY;
    return currentScore > bestScore ? topic : bestTopic;
  }, fallbackTopic);
}

function normalizeTopicId(value) {
  return TOPIC_ALIASES[String(value || "").trim().toLowerCase()] || null;
}

function isAiPackageFrontpageCandidate(article) {
  const focus = Array.isArray(article.editorial_focus) ? article.editorial_focus : [];

  if (focus.includes("ai-package")) {
    return true;
  }

  const textBlob = [
    article.title,
    article.summary,
    article.dek,
    article.hook,
    ...(Array.isArray(article.sections) ? article.sections.flatMap((section) => [section.heading, section.body]) : [])
  ]
    .filter(Boolean)
    .join(" ");

  const hasProviderSignal =
    /\b(google ai pro|google one|workspace|gemini advanced|notebooklm|veo|lyria|openai|chatgpt plus|chatgpt pro|chatgpt team|chatgpt business|anthropic|claude pro|claude max|microsoft|copilot pro|microsoft 365 copilot|xai|grok|perplexity pro|notion ai|figma ai|canva ai)\b/i.test(
      textBlob
    );
  const hasPlanSignal =
    /\b(subscription|pricing|bundle|package|plan|tier|5tb|2tb|storage|monthly|annual|price|gói ai|dung lượng|trả phí|theo tháng|theo năm)\b/i.test(
      textBlob
    );

  return hasProviderSignal && hasPlanSignal;
}

function isPracticalTipsCandidate(article) {
  const focus = Array.isArray(article.editorial_focus) ? article.editorial_focus : [];

  if (focus.includes("tips") || focus.includes("guide")) {
    return true;
  }

  const textBlob = `${article.title} ${article.summary} ${article.dek} ${article.hook}`;
  if (article.content_type !== "EvergreenGuide" && !/\b(mẹo|thủ thuật|hướng dẫn|cách |how to|how-to|guide|tips)\b/i.test(textBlob)) {
    return false;
  }
  return article.content_type === "EvergreenGuide"
    || /\b(mẹo|thủ thuật|hướng dẫn|cách |how to|how-to|guide|tips|workspace|notebooklm|copilot|chatgpt|gemini|claude)\b/i.test(textBlob);
}

function isGuideLedTipsCandidate(article) {
  const focus = Array.isArray(article.editorial_focus) ? article.editorial_focus : [];

  if (focus.includes("tips") || focus.includes("guide")) {
    return true;
  }

  if (article.content_type === "EvergreenGuide") {
    return true;
  }

  const titleText = `${article.title || ""} ${article.dek || ""}`.toLowerCase();
  return [
    "m\u1eb9o",
    "th\u1ee7 thu\u1eadt",
    "h\u01b0\u1edbng d\u1eabn",
    "how to",
    "how-to",
    "guide",
    "tips"
  ].some((keyword) => titleText.includes(keyword));
}

function strengthenEditorialTitle(title, { language, topic, verificationState, contentType, summary, dek, sections }) {
  const normalized = stripEditorialTrailingPunctuation(title);

  if (!normalized) {
    return "";
  }

  if (isEditorialTitleCompelling(normalized, language)) {
    return normalized;
  }

  const suffix = buildEditorialTitleSuffix({ language, topic, verificationState, contentType, summary, dek, sections });

  if (!suffix || normalized.toLowerCase().includes(suffix.toLowerCase())) {
    return normalized;
  }

  const candidate = `${normalized}: ${suffix}`;
  return candidate.length <= 120 ? candidate : normalized;
}

function buildEditorialTitleSuffix({ language, topic, verificationState, contentType }) {
  const editorialTopic = getEditorialTopicKey(topic);

  if (contentType === "Roundup") {
    return language === "vi" ? "những chuyển động đáng giữ trong tầm mắt" : "the shifts worth keeping in view";
  }

  if (contentType === "ComparisonPage") {
    return language === "vi" ? "đâu là khác biệt đáng nhìn kỹ" : "where the real differences show";
  }

  if (contentType === "EvergreenGuide") {
    return language === "vi" ? "đọc xong là dùng được ngay" : "built to be useful right away";
  }

  const fallback = {
    verified: {
      ai: {
        vi: "vì sao team vận hành nên đọc kỹ",
        en: "why teams are taking a closer look"
      },
      software: {
        vi: "vì sao người dùng nên để mắt tới",
        en: "why users should pay attention"
      },
      devices: {
        vi: "điểm thay đổi đáng để ý",
        en: "the device shift worth noticing"
      },
      security: {
        vi: "điều team vận hành không nên lướt qua",
        en: "the risk teams should not shrug off"
      },
      gaming: {
        vi: "vì sao cộng đồng đang nói nhiều về nó",
        en: "why the community keeps talking about it"
      },
      "internet-business": {
        vi: "điều có thể đổi với người dùng số",
        en: "what could change for digital users"
      }
    },
    emerging: {
      default: {
        vi: "vì sao tín hiệu này đang đậm dần",
        en: "why this signal is getting harder to ignore"
      }
    },
    trend: {
      default: {
        vi: "cộng đồng đang nhìn thấy gì",
        en: "what people are seeing so far"
      }
    }
  };

  return (
    fallback[verificationState]?.[editorialTopic]?.[language] ||
    fallback[verificationState]?.default?.[language] ||
    fallback.verified.ai[language]
  );
}

function polishExternalDek({ value, summary, sections, language }) {
  const provided = finalizeEditorialSentence(value);

  if (provided && provided.length >= 68) {
    return provided;
  }

  const source = finalizeEditorialSentence(summary) || firstEditorialSentence(sections[0]?.body || "");

  if (source) {
    return source;
  }

  return language === "vi"
    ? "Bài viết kéo thay đổi chính về đúng bối cảnh, chỉ ra phần đáng chú ý và giúp người đọc nắm nhanh điều gì đang thực sự dịch chuyển."
    : "This story pulls the key shift into context, surfaces the meaningful angle, and explains why it matters without losing reading momentum.";
}

function polishExternalSummary({ value, dek, sections, language }) {
  const provided = finalizeEditorialSentence(value);

  if (provided && provided.length >= 100) {
    return provided;
  }

  const source = [finalizeEditorialSentence(dek), firstEditorialSentence(sections[0]?.body || ""), firstEditorialSentence(sections[1]?.body || "")]
    .filter(Boolean)
    .join(" ");

  if (source.length >= 100) {
    return source;
  }

  return language === "vi"
    ? "Bài viết đi thẳng vào điều vừa xảy ra, vì sao người đọc nên dừng lại lâu hơn một headline, và tác động thực tế của nó với người dùng hoặc đội vận hành."
    : "The piece moves quickly through what changed, why it deserves more than a passing glance, and what readers should watch next.";
}

function normalizeArticleHook(article, { language, topic, verificationState, contentType, summary, dek, sections }) {
  const explicit = finalizeEditorialSentence(article.hook);

  if (explicit.length >= 80) {
    return explicit;
  }

  const openingCandidates =
    verificationState === "trend"
      ? [summary, sections[0]?.body || "", dek]
      : [dek, summary, sections[0]?.body || ""];
  const opening = openingCandidates.map((entry) => firstEditorialSentence(entry)).find(Boolean) || "";
  const angle = buildEditorialAngle({ language, topic, verificationState, contentType });

  if (!opening) {
    return angle;
  }

  if (!angle || opening.toLowerCase().includes(angle.toLowerCase())) {
    return opening;
  }

  const combined = `${opening} ${angle}`.trim();
  return combined.length <= 240 ? combined : opening.length >= 90 ? opening : angle;
}

function buildEditorialAngle({ language, topic, verificationState, contentType }) {
  const editorialTopic = getEditorialTopicKey(topic);

  if (contentType === "Roundup") {
    return language === "vi"
      ? "Điều khiến bản tổng hợp này đáng đọc là nó chỉ ra câu chuyện nào thật sự nên đào sâu và câu chuyện nào chỉ cần tiếp tục theo dõi."
      : "What makes this roundup useful is that it tells readers which stories deserve a deeper read and which ones belong on the watch list.";
  }

  if (contentType === "ComparisonPage") {
    return language === "vi"
      ? "Phần đáng đọc nằm ở chỗ mọi lựa chọn được kéo về cùng một bàn cân để khác biệt thật sự lộ ra rõ hơn."
      : "The useful part is that every option is placed on the same table before any conclusion is drawn.";
  }

  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? "Giá trị của bài nằm ở chỗ đọc xong là có thể đem đi dùng ngay, thay vì chỉ lướt qua thêm một headline."
      : "The value here is that readers can finish the piece and use something from it right away.";
  }

  const statusMap = {
    trend: {
      vi: "Điểm nên giữ trong tầm mắt lúc này là liệu tiếng bàn tán có đi tiếp thành xác nhận hay không.",
      en: "The key thing to watch now is whether the chatter hardens into something official."
    },
    emerging: {
      vi: "Điều khiến câu chuyện này đáng theo dõi là tín hiệu đã bắt đầu dày lên, nhưng vẫn chưa đến mức có thể chốt hạ.",
      en: "What makes this worth following is that the signal is getting stronger without being fully settled yet."
    },
    verified: {
      ai: {
        vi: "Điểm đáng nói là AI đang đi gần hơn tới việc dùng thật, không còn chỉ đứng ở phần trình diễn.",
        en: "The interesting part is that AI is edging closer to practical work, not just polished demos."
      },
      software: {
        vi: "Phần đáng đọc nằm ở chỗ thói quen dùng ứng dụng có thể đổi khá nhanh sau kiểu cập nhật này.",
        en: "The part worth reading is how quickly everyday product behavior can shift after an update like this."
      },
      devices: {
        vi: "Những thay đổi kiểu này thường nhỏ trên giấy tờ nhưng lại chạm mạnh vào cảm giác dùng máy mỗi ngày.",
        en: "Shifts like this can look minor on paper while changing how a device feels in daily use."
      },
      security: {
        vi: "Giá trị thật của câu chuyện nằm ở an toàn vận hành, chứ không chỉ thêm một lớp cài đặt mới.",
        en: "The real value of this story is that it touches operational safety, not just another settings layer."
      },
      gaming: {
        vi: "Với cộng đồng game, kiểu thay đổi này thường lan nhanh hơn bất kỳ thông báo chính thức nào.",
        en: "In gaming communities, shifts like this usually travel faster than any formal announcement."
      },
      "internet-business": {
        vi: "Điều đáng đọc là nó có thể đổi cách người dùng số phản ứng, làm việc hoặc chi tiền.",
        en: "What makes it worth reading is how it could change how digital users react, work, or spend."
      }
    }
  };

  return (
    statusMap[verificationState]?.[editorialTopic]?.[language] ||
    statusMap[verificationState]?.[language] ||
    statusMap.verified.ai[language]
  );
}

function buildEditorialSections({ language, topic, verificationState, contentType, title, summary, dek, hook, sections, sourceSet }) {
  const context = { language, topic, verificationState, contentType, title, summary, dek, hook, sourceSet };
  const normalizedProvided = (Array.isArray(sections) ? sections : [])
    .map((section, index) => normalizeEditorialSection(section, index, context))
    .filter(Boolean);
  const generated = buildGeneratedEditorialSections(context);
  const merged = [];
  const seen = new Set();

  for (const section of [...normalizedProvided, ...generated]) {
    if (!section) {
      continue;
    }

    const signature = `${makeEditorialSignature(section.heading)}::${makeEditorialSignature(section.body)}`;

    if (!section.heading || !section.body || seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    merged.push(section);

    if (merged.length >= 6 && totalEditorialSectionLength(merged) >= 780) {
      break;
    }
  }

  return merged;
}

function normalizeEditorialSection(section, index, context) {
  const heading = safeEditorialTrim(section?.heading || "");
  const baseBody = safeEditorialTrim(section?.body || "");

  if (!heading || !baseBody) {
    return null;
  }

  return {
    heading,
    body: expandEditorialSectionBody(baseBody, index, context)
  };
}

function expandEditorialSectionBody(body, index, context) {
  const supportMap = [
    buildSourceConfidenceSentence(context),
    buildTopicImpactSentence(context),
    buildAudienceSentence(context),
    buildVerificationWatchSentence(context),
    buildReaderActionSentence(context)
  ];
  const base = joinEditorialSentences(body);
  const additions = [supportMap[index], supportMap[index + 1]].filter(Boolean);

  if (base.length >= 260) {
    return base;
  }

  const enriched = joinEditorialSentences(base, ...additions);
  return enriched.length >= 220 ? enriched : joinEditorialSentences(enriched, buildContextSentence(context));
}

function buildGeneratedEditorialSections(context) {
  const copy = getGeneratedSectionCopy(context.language);

  return [
    {
      heading: copy.contextHeading,
      body: joinEditorialSentences(context.summary, buildContextSentence(context), buildSourceConfidenceSentence(context))
    },
    {
      heading: copy.impactHeading,
      body: joinEditorialSentences(context.dek || context.summary, buildTopicImpactSentence(context), buildReaderActionSentence(context))
    },
    {
      heading: copy.audienceHeading,
      body: joinEditorialSentences(buildAudienceSentence(context), buildTopicWorkflowSentence(context), buildReaderActionSentence(context))
    },
    {
      heading: copy.watchHeading,
      body: joinEditorialSentences(context.hook || context.dek, buildVerificationWatchSentence(context), buildSourceFollowUpSentence(context))
    }
  ];
}

function getGeneratedSectionCopy(language) {
  if (language === "en") {
    return {
      contextHeading: "Context Worth Keeping",
      impactHeading: "What Changes In Practice",
      audienceHeading: "Who Should Pay Attention",
      watchHeading: "What To Watch Next"
    };
  }

  return {
    contextHeading: "Bối cảnh cần giữ",
    impactHeading: "Tác động thực tế",
    audienceHeading: "Ai nên để ý",
    watchHeading: "Điều cần theo dõi tiếp"
  };
}

function buildContextSentence({ language, summary, topic }) {
  const topicKey = getEditorialTopicKey(topic);
  const topicMap = {
    ai: {
      vi: "Điểm đáng giữ ở câu chuyện này là cuộc đua AI giờ không còn dừng ở model mạnh hơn, mà đã đi thẳng vào giá trị dùng thật trong công việc mỗi ngày.",
      en: "The important thing to keep in view is that the AI race is no longer only about model bragging rights; it is about practical value in daily work."
    },
    software: {
      vi: "Phần đáng đọc nằm ở chỗ một thay đổi trong app có thể kéo theo cách làm việc, chia sẻ và theo dõi việc của cả một nhóm nhỏ.",
      en: "The part worth holding onto is how a product change can ripple through the way a small team works, shares, and follows up."
    },
    devices: {
      vi: "Với thiết bị, khác biệt thật thường không nằm ở thông số đẹp trên bảng, mà ở cảm giác dùng máy mỗi ngày có bớt khó chịu hay không.",
      en: "With devices, the real difference rarely lives on the spec sheet; it lives in whether daily use becomes better or more annoying."
    },
    security: {
      vi: "Ở nhóm bảo mật, điều đáng đọc không chỉ là lỗi hay bản vá, mà là chi phí vận hành và mức an toàn đổi ra được sau mỗi thay đổi.",
      en: "In security coverage, the meaningful part is not just the flaw or the patch itself, but the operational risk and protection it changes."
    },
    gaming: {
      vi: "Ngay cả với gaming, phần có giá trị vẫn là xem thay đổi đó chạm tới trải nghiệm chơi thật, cộng đồng và quyết định xuống tiền ra sao.",
      en: "Even in gaming, the useful angle is how the change touches actual play, community sentiment, and spending decisions."
    },
    "internet-business": {
      vi: "Ở tuyến Internet và doanh nghiệp số, câu chuyện đáng đọc thường nằm ở chỗ hành vi người dùng, doanh thu hoặc vận hành bị kéo lệch theo hướng nào.",
      en: "On the internet and business tech beat, the story usually matters because it shifts user behavior, revenue, or operations in a real way."
    }
  };

  return topicMap[topicKey]?.[language] || topicMap.ai[language];
}

function buildSourceConfidenceSentence({ language, sourceSet, verificationState }) {
  const sources = Array.isArray(sourceSet) ? sourceSet : [];
  const sourceCount = sources.length;
  const sourceNames = sources.map((source) => safeEditorialTrim(source?.source_name || "")).filter(Boolean);
  const hasOfficial = sources.some((source) => String(source?.source_type || "").trim() === "official-site");

  if (language === "en") {
    if (sourceCount >= 2) {
      return `The signal holds up better here because ${sourceNames.slice(0, 2).join(" and ")} are pushing the story in the same direction.`;
    }

    if (hasOfficial) {
      return "The floor is firmer here because the story is anchored by an official source, not only by second-hand reaction.";
    }

    return verificationState === "verified"
      ? "What keeps this readable is that the current source trail is strong enough to support a clear conclusion, not just a loose rumor."
      : "This is still a developing thread, so the useful part is knowing which source signals are hardening and which ones still need caution.";
  }

  if (sourceCount >= 2) {
    return `Độ chắc của bài tăng lên vì ${sourceNames.slice(0, 2).join(" và ")} đang đẩy câu chuyện về cùng một hướng, thay vì mỗi nơi nói một kiểu.`;
  }

  if (hasOfficial) {
    return "Phần nền của bài chắc hơn vì câu chuyện đang được neo bởi nguồn chính thức, chứ không chỉ trôi bằng phản ứng vòng ngoài.";
  }

  return verificationState === "verified"
    ? "Điều giúp bài đứng được là lớp nguồn hiện tại đủ chắc để chốt ý rõ ràng, thay vì chỉ dừng ở mức nghe nói rồi suy đoán."
    : "Với dạng tín hiệu còn đang dày lên, điều quan trọng là biết phần nào đã có nền và phần nào vẫn cần chờ xác nhận thêm.";
}

function buildTopicImpactSentence({ language, topic }) {
  const topicKey = getEditorialTopicKey(topic);
  const impactMap = {
    ai: {
      vi: "Với người đang trả tiền cho công cụ AI, khác biệt chỉ thật sự có giá trị khi nó rút bớt bước viết, nghiên cứu, họp, code hoặc vận hành thay vì chỉ thêm tên tính năng mới.",
      en: "For people paying for AI tools, the difference only matters when it removes real steps from writing, research, meetings, coding, or operations rather than adding another feature label."
    },
    software: {
      vi: "Ở nhóm phần mềm, một cập nhật đáng tiền là cập nhật khiến quy trình gọn hơn, ít nhầm hơn và bớt phải mở thêm công cụ ngoài.",
      en: "In software, the upgrades worth caring about are the ones that make workflows cleaner, reduce mistakes, and remove the need for extra tools."
    },
    devices: {
      vi: "Với thiết bị, tác động thực tế thường đi thẳng vào pin, nhiệt, độ ổn định và cảm giác sử dụng lâu dài hơn là vài con số đẹp lúc mới nhìn.",
      en: "With devices, practical impact usually shows up in battery life, heat, stability, and long-term usability rather than in a few flashy headline numbers."
    },
    security: {
      vi: "Ở lớp bảo mật, giá trị thật nằm ở việc đội vận hành có đỡ rủi ro hơn hay không, chứ không nằm ở việc thêm một màn hình cài đặt mới.",
      en: "In security, the real value is whether the team becomes measurably safer, not whether another settings screen has been added."
    },
    gaming: {
      vi: "Với game, tác động đáng kể là khi thay đổi đó chạm đến fps, độ trễ, tiến độ phát hành hoặc thứ cộng đồng thật sự sẽ bàn tán trong nhiều ngày.",
      en: "In gaming, the meaningful changes are the ones that touch frame rate, latency, release timing, or the things players will keep talking about for days."
    },
    "internet-business": {
      vi: "Ở nhịp Internet và doanh nghiệp số, điều đáng soi là thay đổi này kéo theo hành vi người dùng, chi phí vận hành hoặc áp lực cạnh tranh mạnh đến đâu.",
      en: "On the internet and business side, the useful question is how much this change shifts user behavior, operating cost, or competitive pressure."
    }
  };

  return impactMap[topicKey]?.[language] || impactMap.ai[language];
}

function buildAudienceSentence({ language, topic }) {
  const topicKey = getEditorialTopicKey(topic);
  const audienceMap = {
    ai: {
      vi: "Nhóm nên đọc kỹ nhất thường là freelancer, team nội dung, nhóm sản phẩm và các doanh nghiệp nhỏ đang cân nhắc xem nên trả tiền cho gói nào để đổi lấy hiệu suất thật.",
      en: "The readers who should look most closely are usually freelancers, content teams, product teams, and smaller businesses deciding which paid AI layer is actually worth it."
    },
    software: {
      vi: "Người thấy giá trị sớm nhất thường là team vận hành, editor, creator và các nhóm đang ghép nhiều app lại thành một workflow hằng ngày.",
      en: "The people who feel the value first are often operators, editors, creators, and teams stitching multiple apps into one daily workflow."
    },
    devices: {
      vi: "Người nên để ý nhất là nhóm đang cân nhắc đổi máy, mua phụ kiện hoặc nâng cấp dàn làm việc trong vài tháng tới.",
      en: "The readers who should care most are the ones planning to replace a device, buy an accessory, or upgrade a work setup in the next few months."
    },
    security: {
      vi: "Nhóm cần đọc kỹ thường là admin hệ thống, chủ shop, đội nội dung và bất kỳ ai đang giữ dữ liệu khách hàng hoặc tài khoản vận hành quan trọng.",
      en: "The people who should read carefully are system admins, shop owners, content teams, and anyone holding customer data or operational accounts."
    },
    gaming: {
      vi: "Với gaming, người sẽ phản ứng đầu tiên thường là nhóm chơi thường xuyên, người theo dõi leak và những ai đang chờ quyết định mua máy hoặc game.",
      en: "In gaming, the first readers to react are usually regular players, leak-watchers, and anyone waiting to decide on a console or a game purchase."
    },
    "internet-business": {
      vi: "Nhóm nên theo sát nhất là người làm kênh số, bán hàng online, marketing, vận hành cộng đồng và các team đang sống bằng traffic hoặc chuyển đổi.",
      en: "The people who should stay closest to this beat are digital channel managers, online sellers, marketers, community operators, and teams living on traffic or conversion."
    }
  };

  return audienceMap[topicKey]?.[language] || audienceMap.ai[language];
}

function buildTopicWorkflowSentence({ language, topic }) {
  const topicKey = getEditorialTopicKey(topic);
  const workflowMap = {
    ai: {
      vi: "Khi nhìn ở góc công việc, điều cần hỏi luôn là nó cắt được bước nào, rút ngắn được khâu nào và có giữ được độ ổn định khi dùng mỗi ngày hay không.",
      en: "From a workflow angle, the right question is always which step it cuts, which stage it shortens, and whether that advantage survives everyday use."
    },
    software: {
      vi: "Một thay đổi phần mềm chỉ đáng nhớ khi nó đi vào thao tác thật: soạn thảo, duyệt file, chia sẻ, họp hoặc theo dõi việc mà không kéo thêm ma sát.",
      en: "A software change only stays useful when it lands in real actions: drafting, reviewing files, sharing, meeting, or follow-up without adding friction."
    },
    devices: {
      vi: "Bài toán ở đây không chỉ là máy mạnh hơn, mà là người dùng có thấy workflow trơn hơn khi học, làm việc, dựng nội dung hay di chuyển hay không.",
      en: "The question here is not only whether the hardware is stronger, but whether study, work, creative, or mobile workflows actually feel smoother."
    },
    security: {
      vi: "Nếu phải thêm nhiều thao tác mới để an toàn hơn, đội vận hành thường sẽ bỏ dở giữa chừng, nên tính khả dụng luôn quan trọng như chính lớp bảo vệ.",
      en: "If safety requires too many extra steps, teams usually drop it halfway through, which makes usability almost as important as protection itself."
    },
    gaming: {
      vi: "Người đọc loại bài này thường không chỉ cần biết có gì mới, mà cần biết thay đổi đó có đáng để quay lại chơi hoặc xuống tiền ngay không.",
      en: "Readers of this kind of story rarely want novelty alone; they want to know whether the change is enough to return, keep playing, or spend now."
    },
    "internet-business": {
      vi: "Một thay đổi ở nền tảng số chỉ thật sự đáng sợ hoặc đáng mừng khi nó chạm tới cách kéo traffic, giữ người dùng và chuyển đổi ra tiền.",
      en: "A platform change only becomes genuinely important when it touches acquisition, retention, and conversion in a measurable way."
    }
  };

  return workflowMap[topicKey]?.[language] || workflowMap.ai[language];
}

function buildVerificationWatchSentence({ language, verificationState, topic }) {
  const topicKey = getEditorialTopicKey(topic);

  if (verificationState === "trend") {
    return language === "vi"
      ? "Phần cần theo dõi tiếp là liệu tiếng bàn tán này có được đẩy lên bằng thêm nguồn mạnh, thêm bằng chứng và một timeline rõ hơn hay không."
      : "The next thing to watch is whether the chatter picks up stronger sourcing, harder evidence, and a clearer timeline.";
  }

  if (verificationState === "emerging") {
    return language === "vi"
      ? "Bước kế tiếp là xem các tín hiệu hiện tại có khóa lại thành thay đổi ổn định hay chỉ là một nhịp thử nghiệm rồi hạ nhiệt nhanh."
      : "The next step is to see whether the current signals harden into a durable change or fade as a short-lived experiment.";
  }

  const verifiedMap = {
    ai: {
      vi: "Ngay cả khi câu chuyện đã được xác nhận, điều đáng xem tiếp vẫn là hãng nào giữ được giá trị dùng thật lâu hơn sau lớp thông báo đầu tiên.",
      en: "Even once the story is verified, the useful follow-up is which company keeps practical value alive after the launch-day noise fades."
    },
    software: {
      vi: "Sau lớp update đầu tiên, người đọc nên nhìn tiếp tốc độ rollout, mức ổn định và việc tính năng mới có bị khóa ở tầng trả phí hay không.",
      en: "After the first update lands, the follow-up worth watching is rollout speed, stability, and whether the useful parts stay locked behind paid tiers."
    },
    devices: {
      vi: "Với thiết bị, bài toán tiếp theo luôn là hàng thực tế, độ ổn định lâu dài và chênh lệch giữa hứa hẹn trên sân khấu với trải nghiệm ngoài đời.",
      en: "For devices, the next question is always real hardware, long-term stability, and the gap between stage promises and daily use."
    },
    security: {
      vi: "Ở lớp bảo mật, điều cần nhìn tiếp là tốc độ vá, mức độ áp dụng thật và việc đội vận hành có duy trì được thói quen an toàn mới hay không.",
      en: "In security, the next follow-up is patch speed, real adoption, and whether teams actually keep the safer behavior in place."
    },
    gaming: {
      vi: "Với gaming, điều cần theo dõi tiếp là phản ứng cộng đồng sau vài ngày, vì đó mới là lúc hype tách khỏi trải nghiệm thật.",
      en: "In gaming, the next thing to watch is community reaction after a few days, because that is when hype finally separates from real experience."
    },
    "internet-business": {
      vi: "Ở tuyến Internet và doanh nghiệp số, dấu hiệu quan trọng tiếp theo thường là nền tảng có đổi chính sách sâu hơn hay các bên còn lại bắt đầu phản ứng dây chuyền.",
      en: "On the internet and business beat, the next meaningful signal is whether policy changes deepen or the rest of the market starts reacting in sequence."
    }
  };

  return verifiedMap[topicKey]?.[language] || verifiedMap.ai[language];
}

function buildReaderActionSentence({ language, topic }) {
  if (language === "en") {
    return "That is why the useful reading move is not to stop at the headline, but to compare the promise, the workflow change, and the likely cost before deciding anything.";
  }

  return "Vì vậy phần đáng đọc của bài không nằm ở headline, mà ở việc đặt lời hứa, thay đổi workflow và chi phí vào cùng một mặt bàn trước khi kết luận.";
}

function buildSourceFollowUpSentence({ language, sourceSet }) {
  const sources = Array.isArray(sourceSet) ? sourceSet : [];
  const names = sources.map((source) => safeEditorialTrim(source?.source_name || "")).filter(Boolean);

  if (language === "en") {
    return names.length >= 2
      ? `A sensible follow-up is to keep tracking whether ${names.slice(0, 2).join(" and ")} stay aligned as more details land.`
      : "A sensible follow-up is to keep watching whether the current source line stays consistent as more details land.";
  }

  return names.length >= 2
    ? `Một điểm nên theo dõi tiếp là ${names.slice(0, 2).join(" và ")} có còn giữ cùng một hướng đọc khi thêm chi tiết mới hay không.`
    : "Điểm nên theo dõi tiếp là lớp nguồn hiện tại có giữ được cùng một hướng đọc khi chi tiết mới xuất hiện hay không.";
}

function joinEditorialSentences(...values) {
  const seen = new Set();
  const sentences = [];

  for (const value of values.flat()) {
    const normalized = safeEditorialTrim(value);

    if (!normalized) {
      continue;
    }

    const parts = normalized.match(/[^.?!]+[.?!]?/g) || [normalized];

    for (const part of parts) {
      const sentence = finalizeEditorialSentence(part);
      const signature = makeEditorialSignature(sentence);

      if (!signature || seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      sentences.push(sentence);
    }
  }

  return sentences.join(" ").trim();
}

function totalEditorialSectionLength(sections) {
  return sections.reduce((sum, section) => sum + safeEditorialTrim(section?.body || "").length, 0);
}

function makeEditorialSignature(value) {
  return safeEditorialTrim(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .trim();
}

function getEditorialTopicKey(topic) {
  const normalized = normalizeTopicId(topic) || "ai";

  if (normalized === "apps-software") {
    return "software";
  }

  if (normalized === "internet-business-tech") {
    return "internet-business";
  }

  return normalized;
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

function collectExternalAuthors(articles) {
  const authors = new Map();

  for (const article of articles) {
    if (!article.author_id || !article.author_name) {
      continue;
    }

    if (!authors.has(article.author_id)) {
      authors.set(article.author_id, {
        id: article.author_id,
        name: article.author_name,
        role: {
          vi: article.author_role_vi || "Cộng tác viên",
          en: article.author_role_en || "Contributor"
        }
      });
    }
  }

  return [...authors.values()];
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

function containsBlockedPublicBranding(value) {
  return /\bopenclaw\b/i.test(String(value || ""));
}

function sanitizePublicImage(image) {
  if (!image) {
    return null;
  }

  const textBlob = [image.src, image.alt, image.caption, image.credit, image.source_url].join(" ");
  return containsBlockedPublicBranding(textBlob) ? null : image;
}

function sanitizePublicSourceSet(sourceSet) {
  if (!Array.isArray(sourceSet)) {
    return [];
  }

  return sourceSet.filter((source) => !containsBlockedPublicBranding([
    source?.source_name,
    source?.source_url,
    source?.image_url,
    source?.image_caption,
    source?.image_credit
  ].join(" ")));
}

function normalizeSourceImage(candidate, article, siteUrl, source = null) {
  const rawSrc =
    typeof candidate === "string"
      ? candidate
      : candidate?.src || candidate?.url || candidate?.image_url || candidate?.image || "";

  if (!isValidImageSource(rawSrc) || rawSrc.includes("/media/story/")) {
    return null;
  }

  if (containsBlockedPublicBranding([
    rawSrc,
    candidate?.alt,
    candidate?.image_alt,
    candidate?.caption,
    candidate?.image_caption,
    candidate?.credit,
    candidate?.image_credit,
    candidate?.source_url,
    source?.source_name,
    source?.source_url
  ].join(" "))) {
    return null;
  }

  return {
    kind: "source",
    src: rawSrc,
    raw_src: rawSrc,
    display_src: toRenderableImageUrl(rawSrc, siteUrl),
    url: toRenderableImageUrl(rawSrc, siteUrl),
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

function toRenderableImageUrl(value, siteUrl) {
  if (/^https?:\/\//i.test(value)) {
    return `${normalizeSiteUrl(siteUrl)}/media/source?src=${encodeURIComponent(value)}`;
  }

  return toAbsoluteAssetUrl(value, siteUrl);
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

function sortArticlesByDateDesc(left, right) {
  return new Date(right.published_at || right.updated_at || 0).getTime() - new Date(left.published_at || left.updated_at || 0).getTime();
}

function normalizeSiteUrl(siteUrl) {
  return String(siteUrl).replace(/\/+$/, "");
}

function resolveAssetVersion(optionVersion, sourceArticles, now) {
  const envVersion =
    optionVersion ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    latestArticleTimestamp(sourceArticles) ||
    now.toISOString();

  return String(envVersion).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "patrick-tech-media";
}

function latestArticleTimestamp(sourceArticles) {
  const latest = [...sourceArticles]
    .map((article) => article.updated_at || article.published_at)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  return latest || "";
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeEditorialTrim(value) {
  return repairEncodingArtifacts(String(value || "")).trim();
}

function stripEditorialTrailingPunctuation(value) {
  return safeEditorialTrim(value).replace(/[.?!:;,]+$/g, "");
}

function finalizeEditorialSentence(value) {
  const normalized = safeEditorialTrim(value).replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function firstEditorialSentence(value) {
  const normalized = safeEditorialTrim(value).replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  const match = normalized.match(/[^.?!]+[.?!]?/);
  return finalizeEditorialSentence(match?.[0] || normalized);
}

function extractEditorialPhrases(value) {
  return safeEditorialTrim(value)
    .split(/[.?!,;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 26 && entry.length <= 72)
    .map((entry) =>
      entry.replace(
        /^(đây là|điều này là|bài viết này là|bài này là|this is|this story is|the story is|that is)\s+/i,
        ""
      )
    )
    .filter((entry) => !/^(hiện|currently|bài này|this story)/i.test(entry))
    .slice(0, 3);
}

function isEditorialTitleCompelling(title, language) {
  const normalized = title.toLowerCase();
  const hasShape = /[:?!]/.test(title) || title.length >= 72 || /nhưng|vì sao|what|why|but|how/i.test(normalized);
  const banned =
    language === "vi"
      ? ["mua ngay", "giam gia", "khuyen mai", "hot nhat hom nay"]
      : ["buy now", "limited offer", "best deal", "cheap"];

  return hasShape && !banned.some((term) => normalized.includes(term));
}

function normalizeHookText(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function hasStrongAiSignals(value) {
  const text = String(value || "");
  return /\b(artificial intelligence|trí tuệ nhân tạo|chatgpt|openai|gemini|claude|anthropic|deepmind|copilot|deepseek|notebooklm|llm|npu|ai agent|ai model|trợ lý ai|mô hình ai|google ai pro|gemini advanced|workspace ai)\b/i.test(text);
}

function makeArticleKey(language, segment, slug) {
  return `${language}:${segment}:${slug}`;
}
