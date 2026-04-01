import fs from "node:fs";
import path from "node:path";
import { createOpenClawWebStore } from "../src/openclaw-web-store.mjs";
import { getArticlesForLanguage, loadNewsroomState } from "../src/newsroom-service.mjs";

const rootDir = process.cwd();
const config = {
  siteUrl: process.env.SITE_URL || "https://patricktechmedia.com",
  storeUrl: process.env.PATRICK_TECH_STORE_URL || "https://patricktechstore.vercel.app",
  databaseUrl: process.env.DATABASE_URL || "",
  contentPath: process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
  webStatePath: process.env.OPENCLAW_WEB_STATE_PATH || "data/openclaw-web-state.json",
  ownerBriefPath: process.env.OPENCLAW_OWNER_BRIEF_PATH || "data/openclaw-owner-brief.json"
};
const ownerBrief = readJson(config.ownerBriefPath);

const state = await loadNewsroomState({
  siteUrl: config.siteUrl,
  storeUrl: config.storeUrl,
  databaseUrl: config.databaseUrl,
  contentPath: config.contentPath,
  webStatePath: config.webStatePath,
  now: new Date().toISOString()
});

const nextState = buildWebControlState(state);
const store = createOpenClawWebStore({
  statePath: config.webStatePath,
  databaseUrl: config.databaseUrl
});

await store.writeState(nextState);

console.log(
  `OpenClaw web control updated ${store.statePath} with frontpage tuning for ${nextState.priorityTopics.join(", ")}.`
);

function buildWebControlState(state) {
  const priorityTopics = rankTopics(state.articles);
  const topicWeights = buildTopicWeights(priorityTopics);
  const sourceTypeWeights = {
    "official-site": 20,
    press: 12,
    "official-social": 9,
    "editorial-research": 8,
    "internal-roundup": 6,
    community: -12,
    "social-buzz": -14
  };

  return {
    generated_at: new Date().toISOString(),
    manager: {
      id: "openclaw",
      autonomy: "owner-delegated-full"
    },
    brief: {
      path: path.resolve(rootDir, config.ownerBriefPath),
      trust_mode: ownerBrief.owner?.trust_mode || "owner-delegated",
      brand_name: ownerBrief.brand?.site_name || "Patrick Tech Media",
      priority_beats: Array.isArray(ownerBrief.editorial_priorities?.beats)
        ? ownerBrief.editorial_priorities.beats
        : []
    },
    permissions: {
      content: true,
      frontpage: true,
      code: true,
      git: true,
      deploy_by_push: true
    },
    priorityTopics,
    ranking: {
      topicWeights,
      sourceTypeWeights
    },
    frontpageCopy: {
      vi: buildFrontpageCopy(state, "vi", priorityTopics),
      en: buildFrontpageCopy(state, "en", priorityTopics)
    }
  };
}

function rankTopics(articles) {
  const scores = new Map([
    ["ai", 34],
    ["security", 24],
    ["internet-business-tech", 22],
    ["apps-software", 20],
    ["devices", 18],
    ["gaming", 8]
  ]);

  for (const article of articles) {
    const topic = normalizeTopic(article.topic);
    const freshness = computeFreshnessScore(article.updated_at || article.published_at);
    const verification =
      article.verification_state === "verified" ? 8 : article.verification_state === "emerging" ? 4 : 1;
    const withImage = article.hero_image?.kind === "source" ? 2 : 0;
    const current = scores.get(topic) || 0;
    scores.set(topic, current + freshness + verification + withImage);
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([topic]) => topic);
}

function buildTopicWeights(priorityTopics) {
  const base = {
    ai: 34,
    security: 24,
    "internet-business-tech": 22,
    "apps-software": 20,
    devices: 18,
    gaming: 8
  };
  const bonuses = [12, 8, 5, 3, 2, 0];

  return priorityTopics.reduce((weights, topic, index) => {
    weights[topic] = (weights[topic] || 0) + (bonuses[index] || 0);
    return weights;
  }, { ...base });
}

function buildFrontpageCopy(state, language, priorityTopics) {
  const topTopicLabels = priorityTopics
    .slice(0, 3)
    .map((topic) => state.topics.find((entry) => entry.id === topic)?.labels?.[language])
    .filter(Boolean);

  if (language === "vi") {
    return {
      heroTitle: "Tin AI, Big Tech và công nghệ cần mở đầu tiên.",
      heroText: "",
      badgeSignals: topTopicLabels[0] || "AI",
      badgeAds: topTopicLabels[1] || "Big Tech",
      badgeBilingual: topTopicLabels[2] || "Công nghệ",
      hotTitle: "Tin nóng lúc này",
      editorsTitle: "Biên tập chọn",
      ribbonTitle: "Tin mới lên theo giờ",
      companyBrief: "Patrick Tech Co. VN",
      readerStartTitle: "3 bài mới để bắt nhịp",
      readerWatchTitle: "2 câu chuyện đang được mở nhiều",
      updateTitle: "3 tin mới để bắt nhịp",
      hotLabel: "Nóng lúc này",
      editorsLabel: "Biên tập chọn",
      ribbonLabel: "Tin vừa lên",
      latestTitle: "Tin mới nhất",
      tipsTitle: "Thủ thuật đáng lưu",
      ecosystemTitle: "Patrick Tech Co. VN",
      browserTitle: "Đang được quan tâm",
      ecosystemText: "",
      homeSpotlightTitle: "Mở bài nổi bật hôm nay"
    };
  }

  return {
    heroTitle: "AI, Big Tech, and the stories worth opening first.",
    heroText: "",
    badgeSignals: topTopicLabels[0] || "AI",
    badgeAds: topTopicLabels[1] || "Big Tech",
    badgeBilingual: topTopicLabels[2] || "Technology",
    hotTitle: "Hot right now",
    editorsTitle: "Editors' picks",
    ribbonTitle: "Just moved",
    companyBrief: "Patrick Tech Co. VN",
    readerStartTitle: "3 fresh stories to start with",
    readerWatchTitle: "2 stories readers keep opening",
    updateTitle: "3 fresh stories to catch the pace",
    hotLabel: "Hot now",
    editorsLabel: "Editors' picks",
    ribbonLabel: "Just moved",
    latestTitle: "Latest stories",
    tipsTitle: "Practical guides worth saving",
    ecosystemTitle: "Patrick Tech Co. VN",
    ecosystemText: "",
    browserTitle: "Rising now",
    homeSpotlightTitle: "Start with the strongest lead today"
  };
}

function normalizeTopic(topic) {
  const value = String(topic || "").trim();
  if (!value) {
    return "ai";
  }

  if (value === "software") {
    return "apps-software";
  }

  if (value === "internet-business") {
    return "internet-business-tech";
  }

  return value;
}

function computeFreshnessScore(dateString) {
  const timestamp = new Date(dateString || 0).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageHours = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));

  if (ageHours <= 6) {
    return 12;
  }

  if (ageHours <= 12) {
    return 9;
  }

  if (ageHours <= 24) {
    return 6;
  }

  if (ageHours <= 48) {
    return 3;
  }

  return 1;
}

function joinLabels(labels, language) {
  if (!labels.length) {
    return language === "vi" ? "AI, Big Tech và mạng xã hội" : "AI, Big Tech, and platform shifts";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} ${language === "vi" ? "và" : "and"} ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} ${language === "vi" ? "và" : "and"} ${labels[labels.length - 1]}`;
}

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(rootDir, targetPath), "utf8"));
  } catch {
    return {};
  }
}
