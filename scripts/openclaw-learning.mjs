import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenClawLearningStore, normalizeLearningState } from "../src/openclaw-learning-store.mjs";
import { evaluateArticleAutopublishReadiness, normalizeText } from "../src/newsroom-quality.mjs";

const rootDir = process.cwd();
const envFromFile = loadEnvFile(path.join(rootDir, ".env"));

const config = {
  contentPath: process.env.NEWSROOM_CONTENT_PATH || envFromFile.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
  platformStatePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
  learningStatePath: process.env.OPENCLAW_LEARNING_STATE_PATH || envFromFile.OPENCLAW_LEARNING_STATE_PATH || "data/openclaw-learning-state.json",
  databaseUrl: process.env.DATABASE_URL || envFromFile.DATABASE_URL || ""
};

export async function runOpenClawLearningCycle(options = {}) {
  const now = options.now || new Date().toISOString();
  const store = createOpenClawLearningStore({
    statePath: options.learningStatePath || config.learningStatePath,
    databaseUrl: options.databaseUrl ?? config.databaseUrl
  });
  const currentState = normalizeLearningState(await store.readState());
  const newsroomPayload = readJson(options.contentPath || config.contentPath);
  const platformState = readJson(options.platformStatePath || config.platformStatePath);
  const articles = Array.isArray(newsroomPayload.articles) ? newsroomPayload.articles : [];
  const profile = buildOpenClawLearningProfile({
    articles,
    platformState,
    feedback: currentState.feedback,
    previousProfile: currentState.profile,
    now
  });
  const cycle = {
    generated_at: now,
    totalSignals: profile.totalSignals,
    confidence: profile.confidence,
    summary: profile.lastCycleSummary
  };
  const nextState = {
    ...currentState,
    generated_at: now,
    profile,
    cycles: [cycle, ...currentState.cycles].slice(0, 40)
  };

  await store.writeState(nextState);

  return {
    ok: true,
    statePath: store.statePath,
    storageMode: store.storageMode,
    profile
  };
}

export function buildOpenClawLearningProfile({ articles = [], platformState = {}, feedback = [], previousProfile = {}, now = new Date().toISOString() } = {}) {
  const articleSignals = buildArticleSignals({ articles, platformState, feedback, now });
  const learningSignals = articleSignals.filter((signal) => signal.learningEligible || signal.signalCount > 1);
  const actionableFeedback = feedback.filter(isActionableFeedback);
  const topicWeights = buildWeightMap(learningSignals, "topic", previousProfile.topicWeights);
  const sourceTypeWeights = buildWeightMap(learningSignals, "sourceType", previousProfile.sourceTypeWeights);
  const totalSignals = articleSignals.reduce((sum, signal) => sum + (signal.learningSignalCount || 0), 0) + actionableFeedback.length;
  const confidence = Math.min(0.95, Math.round((1 - Math.exp(-totalSignals / 26)) * 100) / 100);
  const dailyFocus = rankKeys(topicWeights).slice(0, 5);
  const topViewedArticles = buildTopViewedArticles(articleSignals);
  const viewInsights = buildViewInsights(topViewedArticles);
  const styleRules = buildStyleRules({ articleSignals, feedback: actionableFeedback });
  const avoidRules = buildAvoidRules({ articleSignals, feedback: actionableFeedback });
  const lastCycleSummary = [
    `Learned from ${learningSignals.length} eligible article(s)`,
    `${articleSignals.filter((signal) => !signal.learningEligible).length} article(s) excluded from learning`,
    `${actionableFeedback.length} owner feedback item(s)`,
    `${totalSignals} signal(s)`,
    topViewedArticles.length ? `${topViewedArticles[0].views} top view(s): ${topViewedArticles[0].title}` : "no view data yet",
    dailyFocus.length ? `focus: ${dailyFocus.join(", ")}` : "focus: default editorial priorities"
  ].join("; ");

  return {
    version: 1,
    updated_at: now,
    confidence,
    totalSignals,
    eligibleArticleCount: learningSignals.length,
    excludedArticleCount: articleSignals.filter((signal) => !signal.learningEligible).length,
    dailyFocus,
    topicWeights,
    sourceTypeWeights,
    topViewedArticles,
    viewInsights,
    styleRules,
    avoidRules,
    lastCycleSummary
  };
}

function buildArticleSignals({ articles, platformState, feedback, now }) {
  const reactions = Array.isArray(platformState.articleReactions) ? platformState.articleReactions : [];
  const comments = Array.isArray(platformState.articleComments) ? platformState.articleComments : [];
  const viewStats = Array.isArray(platformState.articleViews) ? platformState.articleViews : [];

  const articleSignals = articles.filter((article) => article && typeof article === "object").map((article) => {
    const readiness = evaluateArticleAutopublishReadiness(article);
    const articleReactions = reactions.filter((entry) => matchesArticle(entry, article));
    const articleComments = comments.filter((entry) => matchesArticle(entry, article));
    const articleViews = viewStats.find((entry) => matchesArticle(entry, article)) || {};
    const ownerFeedback = feedback.filter((entry) => matchesFeedback(entry, article));
    const positiveReactions = articleReactions.filter((entry) => ["useful", "love", "wow"].includes(entry.reaction)).length;
    const ownerScore = ownerFeedback.reduce((sum, entry) => sum + scoreFeedbackKind(entry.kind), 0);
    const qualityScore = Number.isFinite(Number(article.quality_score)) ? Number(article.quality_score) : 78;
    const freshnessScore = computeFreshnessScore(article.updated_at || article.published_at, now);
    const readinessScore = readiness.ready ? 10 : -12 - readiness.missing.length * 2;
    const views = clampInteger(articleViews.views, 0, 1_000_000_000, 0);
    const uniqueViews = clampInteger(articleViews.unique_views, 0, 1_000_000_000, 0);
    const viewScore = computeViewScore(views, uniqueViews);
    const engagementSignalCount = computeEngagementSignalCount({ views, uniqueViews, positiveReactions, comments: articleComments.length, feedback: ownerFeedback.length });
    const score = qualityScore - 78 + readinessScore + freshnessScore + viewScore + positiveReactions * 5 + articleComments.length * 3 + ownerScore;
    const sourceType = normalizeText(article.source_set?.[0]?.source_type || "unknown") || "unknown";
    const learningEligible = readiness.ready;

    return {
      id: normalizeText(article.id || article.href || article.slug),
      href: normalizeText(article.href),
      title: normalizeText(article.title),
      topic: normalizeTopic(article.topic),
      contentType: normalizeText(article.content_type),
      sourceType,
      score,
      views,
      uniqueViews,
      signalCount: 1 + engagementSignalCount,
      learningSignalCount: 1 + engagementSignalCount,
      learningEligible,
      readiness,
      ownerFeedback
    };
  });
  const orphanViewSignals = viewStats
    .filter((entry) => clampInteger(entry?.views, 0, 1_000_000_000, 0) > 0)
    .filter((entry) => !articles.some((article) => matchesArticle(entry, article)))
    .map(buildOrphanViewSignal);

  return [...articleSignals, ...orphanViewSignals];
}

function buildOrphanViewSignal(entry) {
  const views = clampInteger(entry?.views, 0, 1_000_000_000, 0);
  const uniqueViews = clampInteger(entry?.unique_views, 0, 1_000_000_000, 0);
  const viewScore = computeViewScore(views, uniqueViews);

  return {
    id: normalizeText(entry?.article_id || entry?.article_href),
    href: normalizeText(entry?.article_href),
    title: normalizeText(entry?.title || entry?.article_href || "Viewed article"),
    topic: normalizeTopic(entry?.topic),
    contentType: normalizeText(entry?.content_type || "NewsArticle"),
    sourceType: normalizeText(entry?.source_type || "unknown") || "unknown",
    score: viewScore,
    views,
    uniqueViews,
    signalCount: Math.min(20, Math.max(1, Math.ceil(views / 5))),
    learningSignalCount: 0,
    learningEligible: false,
    readiness: { ready: true, missing: [] },
    ownerFeedback: [],
    fromViewSnapshot: true
  };
}

function buildWeightMap(signals, key, previousWeights = {}) {
  const groups = new Map();

  for (const signal of signals) {
    const groupKey = signal[key] || "unknown";
    const existing = groups.get(groupKey) || { score: 0, count: 0 };
    existing.score += signal.score;
    existing.count += signal.signalCount || 1;
    groups.set(groupKey, existing);
  }

  const nextWeights = {};

  for (const [groupKey, group] of groups.entries()) {
    const average = group.score / Math.max(1, group.count);
    const previous = Number(previousWeights?.[groupKey] || 0);
    nextWeights[groupKey] = Math.round(clamp(previous * 0.65 + average * 0.35, -24, 32));
  }

  for (const [groupKey, value] of Object.entries(previousWeights || {})) {
    if (groupKey in nextWeights) {
      continue;
    }

    const decayed = Math.round(Number(value || 0) * 0.65);
    if (Math.abs(decayed) >= 1) {
      nextWeights[groupKey] = decayed;
    }
  }

  return Object.fromEntries(Object.entries(nextWeights).sort((left, right) => right[1] - left[1]));
}

function buildStyleRules({ articleSignals, feedback }) {
  const goodFeedback = feedback.filter((entry) => ["good", "more-depth", "tone"].includes(entry.kind));
  const highScoring = articleSignals.filter((entry) => entry.learningEligible && entry.score >= 18);
  const topViewed = articleSignals.filter((entry) => entry.learningEligible && entry.views > 0).sort((left, right) => right.views - left.views).slice(0, 5);
  const rules = [
    "Mo bai bang tac dong thuc te, chi phi, workflow va ai nen quan tam.",
    "Moi bai can co boi canh, thong tin lien quan, checklist va dieu can theo doi tiep.",
    "Uu tien nguon official/press co anh nguon dung chu de; khong dung anh chung chung."
  ];

  if (goodFeedback.some((entry) => /gan gui|de hieu|don gian|than thien/i.test(entry.note))) {
    rules.push("Giu giong van gan gui, cau ngan, giai thich nhu noi voi nguoi moi theo doi cong nghe.");
  }

  if (goodFeedback.some((entry) => /sau|chi tiet|nhieu thong tin|gia tri/i.test(entry.note))) {
    rules.push("Tang do sau bang vi du ap dung, rui ro, gioi han va buoc hanh dong tiep theo.");
  }

  if (highScoring.some((entry) => entry.topic === "ai")) {
    rules.push("Voi bai AI, so sanh gia tri su dung that thay vi chi ke tinh nang moi.");
  }

  if (topViewed.some((entry) => entry.contentType === "EvergreenGuide" || entry.contentType === "ComparisonPage")) {
    rules.push("Nhan rong format co gia tri dai han: tieu de ro loi ich, so sanh lua chon, checklist va buoc hanh dong.");
  }

  if (topViewed.some((entry) => entry.topic === "devices")) {
    rules.push("Voi bai thiet bi, noi ro gia, trai nghiem dung that, do ben, nhiet, pin va ly do nen/khong nen mua.");
  }

  if (topViewed.some((entry) => entry.topic === "internet-business-tech")) {
    rules.push("Voi bai nen tang/kinh doanh, noi ro tac dong den nguoi dung, creator, doanh thu hoac chi phi van hanh.");
  }

  return unique(rules).slice(0, 10);
}

function buildTopViewedArticles(articleSignals) {
  return articleSignals
    .filter((entry) => entry.views > 0)
    .sort((left, right) => right.views - left.views)
    .slice(0, 8)
    .map((entry, index) => ({
      rank: index + 1,
      title: entry.title,
      href: entry.href,
      views: entry.views,
      uniqueViews: entry.uniqueViews,
      topic: entry.topic,
      contentType: entry.contentType,
      sourceType: entry.sourceType
    }));
}

function buildViewInsights(topViewedArticles) {
  if (!topViewedArticles.length) {
    return [];
  }

  const topics = countKeys(topViewedArticles.map((entry) => entry.topic));
  const contentTypes = countKeys(topViewedArticles.map((entry) => entry.contentType));
  const sourceTypes = countKeys(topViewedArticles.map((entry) => entry.sourceType));
  const insights = [];
  const topTopic = firstRankedKey(topics);
  const topContentType = firstRankedKey(contentTypes);
  const topSourceType = firstRankedKey(sourceTypes);

  if (topTopic) {
    insights.push(`Bai view cao dang nghieng ve chu de ${topTopic}; tang uu tien neu van con tin moi va nguon tot.`);
  }

  if (topContentType) {
    insights.push(`Dinh dang hut view nhat hien la ${topContentType}; nen tai su dung cach dat tieu de va cau truc cua nhom nay.`);
  }

  if (topSourceType) {
    insights.push(`Nguon tao view tot nhat la ${topSourceType}; uu tien nguon cung loai khi chat luong bai dat chuan.`);
  }

  return insights.slice(0, 6);
}

function buildAvoidRules({ articleSignals, feedback }) {
  const badFeedback = feedback.filter((entry) => ["bad", "less-noise", "source", "image"].includes(entry.kind));
  const lowReadiness = articleSignals.filter((entry) => !entry.readiness.ready);
  const rules = [
    "Khong lap ten nguon qua nhieu lan trong than bai.",
    "Khong dua menu, footer, navigation hoac noi dung quang cao cua nguon vao bai.",
    "Khong publish neu anh nguon khong lien quan ro voi bai."
  ];

  if (badFeedback.some((entry) => /ngan|mong|it|thieu/i.test(entry.note))) {
    rules.push("Khong len bai mong: can du section va tong do sau truoc khi publish.");
  }

  if (badFeedback.some((entry) => /bua|du thua|roi|lan man|noise/i.test(entry.note))) {
    rules.push("Cat noi dung du thua: uu tien thong tin bao chinh va phan lien quan truc tiep.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("sourceBreadth"))) {
    rules.push("Neu bai do nhay cam hoac AI/comparison, can them nguon ho tro truoc khi day len.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("narrativeFlow"))) {
    rules.push("Khong publish bai chi ghep y roi rac; can co mach dien bien, tac dong, hanh dong va dieu can theo doi tiep.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("dek") || entry.readiness.missing.includes("hook"))) {
    rules.push("Moi bai can co dek va hook rieng: dek tom boi canh, hook noi ro ai bi anh huong va nen lam gi.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("noRepeatedSentences") || entry.readiness.missing.includes("noRepeatedPhrases"))) {
    rules.push("Khong publish bai lap cau hoac lap cum tu; can viet lai section bi trung truoc khi len trang.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("noGenericPadding"))) {
    rules.push("Khong dung cau dem chung chung de do dai bai; neu nguon mong thi giu lai cho den khi co them thong tin that.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("specificInformation") || entry.readiness.missing.includes("valueDensity"))) {
    rules.push("Moi bai can co thong tin cu the: ten san pham/cong ty, con so, rollout/gia/han che/rui ro va nguon xac nhan.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("paragraphShape") || entry.readiness.missing.includes("sectionHeadings"))) {
    rules.push("Trinh bay moi section nhu mot y rieng: heading ro, than doan du y, tranh mot cau dai keo het ca section.");
  }

  if (lowReadiness.some((entry) => entry.readiness.missing.includes("distinctSections") || entry.readiness.missing.includes("sectionBodies"))) {
    rules.push("Khong dung cac section giong nhau; moi section phai tra loi mot cau hoi rieng va them thong tin moi.");
  }

  return unique(rules).slice(0, 10);
}

function matchesArticle(entry, article) {
  if (!entry || !article) {
    return false;
  }

  if (entry.article_id && article.id && entry.article_id === article.id) {
    return true;
  }

  return Boolean(entry.article_href && article.href && entry.article_href === article.href);
}

function matchesFeedback(entry, article) {
  if (!entry || !article) {
    return false;
  }

  if (entry.article_id && article.id && entry.article_id === article.id) {
    return true;
  }

  if (entry.target_url && article.href && entry.target_url.endsWith(article.href)) {
    return true;
  }

  return Boolean(entry.target_url && article.source_set?.some((source) => source.source_url === entry.target_url));
}

function scoreFeedbackKind(kind) {
  const scores = {
    good: 18,
    "more-depth": 10,
    tone: 8,
    source: -4,
    image: -5,
    "less-noise": -8,
    bad: -18
  };

  return scores[kind] || 0;
}

function isActionableFeedback(entry) {
  return ["good", "more-depth", "tone", "source", "image", "less-noise", "bad"].includes(String(entry?.kind || "").trim());
}

function computeEngagementSignalCount({ views, uniqueViews, positiveReactions, comments, feedback }) {
  const trustedReaders = Math.max(0, Math.min(50_000, Number(uniqueViews) || 0));
  const viewEvidence = trustedReaders >= 3 ? Math.min(4, 1 + Math.floor(Math.log2(trustedReaders))) : 0;
  const interactionEvidence = Math.min(4, Math.max(0, Number(positiveReactions) || 0) + Math.max(0, Number(comments) || 0) + Math.max(0, Number(feedback) || 0));

  return viewEvidence + interactionEvidence;
}

function rankKeys(weights) {
  return Object.entries(weights || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);
}

function normalizeTopic(value) {
  const topic = normalizeText(value);
  if (topic === "software") {
    return "apps-software";
  }
  if (topic === "internet-business") {
    return "internet-business-tech";
  }
  return topic || "internet-business-tech";
}

function computeFreshnessScore(dateString, now) {
  const timestamp = Date.parse(String(dateString || ""));
  const nowTimestamp = Date.parse(String(now || ""));
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowTimestamp)) {
    return 0;
  }

  const ageHours = Math.max(0, (nowTimestamp - timestamp) / (1000 * 60 * 60));
  if (ageHours <= 12) {
    return 8;
  }
  if (ageHours <= 48) {
    return 4;
  }
  if (ageHours <= 168) {
    return 1;
  }
  return -2;
}

function computeViewScore(views, uniqueViews) {
  if (!views) {
    return 0;
  }

  const rawViews = Math.log2(views + 1) * 4;
  const uniqueBonus = Math.log2(uniqueViews + 1) * 3;
  return Math.round(clamp(rawViews + uniqueBonus, 0, 34));
}

function countKeys(values) {
  const counts = new Map();
  for (const value of values) {
    const key = normalizeText(value || "unknown") || "unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function firstRankedKey(counts) {
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function unique(values) {
  return values.filter((value, index, list) => value && list.indexOf(value) === index);
}

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(rootDir, targetPath), "utf8"));
  } catch {
    return {};
  }
}

function loadEnvFile(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .reduce((env, line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
        env[key] = value;
        return env;
      }, {});
  } catch {
    return {};
  }
}

function isDirectExecution() {
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "");
}

if (isDirectExecution()) {
  runOpenClawLearningCycle()
    .then((result) => {
      console.log(
        `OpenClaw learning updated ${result.statePath} via ${result.storageMode}: ` +
          `${result.profile.totalSignals} signal(s), confidence ${result.profile.confidence}.`
      );
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || error);
      process.exit(1);
    });
}
