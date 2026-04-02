import fs from "node:fs";
import path from "node:path";
import { createOpenClawWebStore } from "../src/openclaw-web-store.mjs";
import { loadNewsroomState } from "../src/newsroom-service.mjs";

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
  const editorialOrder = ["ai", "internet-business-tech", "security", "apps-software", "devices", "gaming"];
  const scores = new Map(editorialOrder.map((topic, index) => [topic, 220 - index * 28]));

  for (const article of articles) {
    const topic = normalizeTopic(article.topic);
    const freshness = computeFreshnessScore(article.updated_at || article.published_at);
    const verification =
      article.verification_state === "verified" ? 14 : article.verification_state === "emerging" ? 7 : 2;
    const withImage = article.hero_image?.kind === "source" ? 4 : 0;
    const aiBias = topic === "ai" ? 22 : topic === "internet-business-tech" ? 10 : topic === "security" ? 8 : 0;
    const current = scores.get(topic) || 0;
    scores.set(topic, current + freshness + verification + withImage + aiBias);
  }

  return [...scores.entries()]
    .sort((left, right) => {
      const scoreGap = right[1] - left[1];
      if (Math.abs(scoreGap) <= 64) {
        return editorialOrder.indexOf(left[0]) - editorialOrder.indexOf(right[0]);
      }
      return scoreGap;
    })
    .map(([topic]) => topic);
}

function buildTopicWeights(priorityTopics) {
  const base = {
    ai: 78,
    "internet-business-tech": 50,
    security: 42,
    "apps-software": 30,
    devices: 16,
    gaming: 6
  };
  const bonuses = [18, 11, 7, 4, 2, 0];

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
      heroTitle: "Tin AI, Big Tech và những chuyển động công nghệ đáng mở đầu ngày.",
      heroText: "",
      badgeSignals: topTopicLabels[0] || "AI",
      badgeAds: topTopicLabels[1] || "Big Tech",
      badgeBilingual: topTopicLabels[2] || "Công nghệ",
      hotTitle: "Nóng lúc này",
      editorsTitle: "Biên tập chọn",
      ribbonTitle: "Mới trên trang",
      companyBrief: "Patrick Tech Co. VN",
      readerStartTitle: "Nên đọc trước",
      readerWatchTitle: "Đang được chú ý",
      updateTitle: "Tin vừa lên",
      hotLabel: "Nóng",
      editorsLabel: "Biên tập chọn",
      ribbonLabel: "Vừa lên",
      latestTitle: "Tin mới nhất",
      tipsTitle: "Thủ thuật & mẹo hay",
      ecosystemTitle: "Patrick Tech Co. VN",
      ecosystemText: "",
      browserTitle: "Đọc nhiều nhất",
      homeSpotlightTitle: "Tâm điểm"
    };
  }

  return {
    heroTitle: "AI, Big Tech, and the technology shifts worth your first click.",
    heroText: "",
    badgeSignals: topTopicLabels[0] || "AI",
    badgeAds: topTopicLabels[1] || "Big Tech",
    badgeBilingual: topTopicLabels[2] || "Technology",
    hotTitle: "Hot right now",
    editorsTitle: "Editors' picks",
    ribbonTitle: "Fresh on the page",
    companyBrief: "Patrick Tech Co. VN",
    readerStartTitle: "Read first",
    readerWatchTitle: "Getting attention",
    updateTitle: "Just in",
    hotLabel: "Hot",
    editorsLabel: "Editors' picks",
    ribbonLabel: "Just in",
    latestTitle: "Latest stories",
    tipsTitle: "Tips worth saving",
    ecosystemTitle: "Patrick Tech Co. VN",
    ecosystemText: "",
    browserTitle: "Most read",
    homeSpotlightTitle: "Spotlight"
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

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(rootDir, targetPath), "utf8"));
  } catch {
    return {};
  }
}
