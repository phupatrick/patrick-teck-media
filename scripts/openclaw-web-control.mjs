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
      vi: normalizeFrontpageCopy(buildFrontpageCopy(state, "vi", priorityTopics), "vi"),
      en: normalizeFrontpageCopy(buildFrontpageCopy(state, "en", priorityTopics), "en")
    }
  };
}

function rankTopics(articles) {
  const editorialOrder = ["ai", "apps-software", "internet-business-tech", "security", "devices", "gaming"];
  const scores = new Map(editorialOrder.map((topic, index) => [topic, 260 - index * 32]));

  for (const article of articles) {
    const topic = normalizeTopic(article.topic);
    const freshness = computeFreshnessScore(article.updated_at || article.published_at);
    const verification =
      article.verification_state === "verified" ? 14 : article.verification_state === "emerging" ? 7 : 2;
    const withImage = article.hero_image?.kind === "source" ? 4 : 0;
    const aiBias =
      topic === "ai"
        ? 36
        : topic === "apps-software"
          ? 14
          : topic === "internet-business-tech"
            ? 10
            : topic === "security"
              ? 8
              : 0;
    const current = scores.get(topic) || 0;
    scores.set(topic, current + freshness + verification + withImage + aiBias);
  }

  return [...scores.entries()]
    .sort((left, right) => {
      const scoreGap = right[1] - left[1];
      if (Math.abs(scoreGap) <= 180) {
        return editorialOrder.indexOf(left[0]) - editorialOrder.indexOf(right[0]);
      }
      return scoreGap;
    })
    .map(([topic]) => topic);
}

function buildTopicWeights(priorityTopics) {
  const base = {
    ai: 92,
    "apps-software": 54,
    "internet-business-tech": 46,
    security: 34,
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
      heroTitle: "Gói AI nào vừa đáng tiền hơn, và hãng nào đang tăng giá trị thật?",
      heroText: "",
      badgeSignals: topTopicLabels[0] || "AI",
      badgeAds: topTopicLabels[1] || "Big Tech",
      badgeBilingual: topTopicLabels[2] || "Mẹo hay",
      hotTitle: "Tiêu điểm đang kéo lượt đọc",
      editorsTitle: "Nên mở tiếp bài nào",
      ribbonTitle: "Mới cập nhật",
      companyBrief: "Patrick Tech Co. VN",
      readerStartTitle: "Nên đọc trước",
      readerWatchTitle: "Đang được chú ý",
      updateTitle: "Tin vừa lên",
      hotLabel: "Nóng",
      editorsLabel: "Biên tập chọn",
      ribbonLabel: "Vừa lên",
      latestTitle: "Tin mới nhất",
      tipsTitle: "Mẹo, hướng dẫn, nhận xét",
      packageLabel: "Gói AI",
      packageTitle: "Các gói AI có gì mới?",
      ecosystemTitle: "Patrick Tech Store",
      ecosystemText: "",
      browserTitle: "Đọc nhiều",
      homeSpotlightTitle: "Tiêu điểm"
    };
  }

  return {
    heroTitle: "Which AI plans just became more useful, and who is adding real value?",
    heroText: "",
    badgeSignals: topTopicLabels[0] || "AI",
    badgeAds: topTopicLabels[1] || "Big Tech",
    badgeBilingual: topTopicLabels[2] || "Practical reads",
    hotTitle: "The stories pulling readers in",
    editorsTitle: "What to open next",
    ribbonTitle: "Fresh updates",
    companyBrief: "Patrick Tech Co. VN",
    readerStartTitle: "Read first",
    readerWatchTitle: "Getting attention",
    updateTitle: "Just in",
    hotLabel: "Hot",
    editorsLabel: "Editors' picks",
    ribbonLabel: "Just in",
    latestTitle: "Latest stories",
    tipsTitle: "Guides, tips, and takes",
    packageLabel: "AI plans",
    packageTitle: "What changed in AI plans",
    ecosystemTitle: "Patrick Tech Store",
    ecosystemText: "",
    browserTitle: "Most read",
    homeSpotlightTitle: "Spotlight"
  };
}

function normalizeFrontpageCopy(copy, language) {
  const base = { ...(copy || {}) };

  if (language === "vi") {
    return {
      ...base,
      heroTitle: base.heroTitle || "Gói AI nào vừa đáng tiền hơn, và hãng nào đang tăng giá trị thật?",
      badgeBilingual: base.badgeBilingual || "Mẹo hay",
      hotTitle: base.hotTitle || "Những headline đang kéo lượt đọc",
      editorsTitle: base.editorsTitle || "Đáng mở tiếp theo",
      ribbonTitle: base.ribbonTitle || "Tin vừa bật lên",
      readerStartTitle: base.readerStartTitle || "Nên đọc trước",
      readerWatchTitle: base.readerWatchTitle || "Đang được chú ý",
      updateTitle: base.updateTitle || "Tin vừa lên",
      hotLabel: base.hotLabel || "Nóng",
      editorsLabel: base.editorsLabel || "Biên tập chọn",
      ribbonLabel: base.ribbonLabel || "Vừa lên",
      latestTitle: base.latestTitle || "Tin mới đáng mở",
      tipsTitle: base.tipsTitle || "Thủ thuật, nhận xét và bài dùng được ngay",
      packageLabel: base.packageLabel || "Gói AI",
      packageTitle: base.packageTitle || "Các gói AI vừa đổi gì?",
      browserTitle: base.browserTitle || "Đọc nhiều",
      homeSpotlightTitle: base.homeSpotlightTitle || "Tiêu điểm",
      companyBrief: base.companyBrief || "Patrick Tech Co. VN"
    };
  }

  return {
    ...base,
    heroTitle: base.heroTitle || "Which AI plans just became more useful, and who is adding real value?",
    hotTitle: base.hotTitle || "The headlines pulling readers in",
    editorsTitle: base.editorsTitle || "Worth opening next",
    ribbonTitle: base.ribbonTitle || "Stories that just moved",
    latestTitle: base.latestTitle || "Fresh stories worth opening",
    tipsTitle: base.tipsTitle || "Practical guides, takes, and how-tos",
    packageTitle: base.packageTitle || "What just changed in AI plans",
    browserTitle: base.browserTitle || "Most read",
    homeSpotlightTitle: base.homeSpotlightTitle || "Spotlight",
    companyBrief: base.companyBrief || "Patrick Tech Co. VN"
  };
}
function normalizeTopic(topic) {
  const value = String(topic || "").trim();
  if (!value) {
    return "internet-business-tech";
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
