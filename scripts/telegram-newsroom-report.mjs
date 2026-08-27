import fs from "node:fs";
import path from "node:path";
import { formatTelegramArticleReference, sendTelegramMessage } from "../src/telegram-newsroom-bot.mjs";

const rootDir = process.cwd();
const token = String(process.env.TELEGRAM_NEWSROOM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatIds = normalizeIdList(process.env.TELEGRAM_NEWSROOM_REPORT_CHAT_IDS || process.env.TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS || "");
const siteUrl = String(process.env.SITE_URL || "https://patricktechmedia.com").replace(/\/+$/, "");
const contentPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
const managerStatePath = process.env.OPENCLAW_MANAGER_STATE_PATH || "data/openclaw-manager-state.json";
const learningStatePath = process.env.OPENCLAW_LEARNING_STATE_PATH || "data/openclaw-learning-state.json";

if (!token || chatIds.length === 0) {
  console.log("Bỏ qua báo cáo Telegram vì chưa cấu hình token hoặc chat nhận báo cáo.");
  process.exit(0);
}

const content = readJson(contentPath);
const manager = readJson(managerStatePath);
const learning = readJson(learningStatePath);
const articles = Array.isArray(content.articles) ? content.articles : [];
const latest = selectLatestNewsArticles(articles, 5);
const learningProfile = learning.profile || {};
const cycle = manager.manager || {};
const refresh = manager.newsroom?.refresh || {};
const newsroom = manager.newsroom || {};
const refreshedCount = extractRefreshedCount(refresh.output);
const heldCount = countHeldCandidates(refresh.warnings);
const publishedLine = refreshedCount === null
  ? "Kết quả đăng: chưa đọc được số lượng từ refresh"
  : refreshedCount === 0
    ? "Kết quả đăng: chu kỳ đã chạy nhưng chưa có bài mới đủ điều kiện"
    : `Kết quả đăng: đã cập nhật ${refreshedCount} bài mới`;
const sourceWarningCount = countSourceWarnings(refresh.warnings);
const message = [
  formatCycleWindow(cycle.startedAt, cycle.finishedAt),
  cycle.trigger?.reason ? `Yêu cầu: ${cycle.trigger.reason}` : "",
  cycle.trigger?.source ? `Kích hoạt: ${cycle.trigger.source}` : "",
  `Thu thập: ${formatRefreshMode(refresh.mode)}${refreshedCount === null ? "" : ` - ${refreshedCount} bài nguồn mới`}`,
  publishedLine,
  `Nguồn lỗi/cần kiểm tra: ${sourceWarningCount}`,
  `Kho bài: ${newsroom.articleCountBefore ?? articles.length} - ${articles.length} (${formatDelta(newsroom.articleCountDelta)})`,
  `Kiểm định: ${heldCount} bài đang giữ lại để viết/xác minh thêm`,
  "",
  "Patrick Tech Media đã cập nhật tòa soạn",
  "",
  `Tổng bài trong file: ${articles.length}`,
  `Nguồn chạy: ${formatRefreshMode(manager.newsroom?.refresh?.mode)}`,
  manager.newsroom?.auditRepair?.skipped
    ? "Sửa audit: không yêu cầu trong chu kỳ này"
    : `Sửa audit: ${manager.newsroom?.auditRepair?.ok ? "đã chạy" : "chưa chạy"}`,
  `Duyệt bài gửi: ${manager.platform?.submissionReview?.approved || 0} đã duyệt, ${manager.platform?.submissionReview?.held || 0} đang giữ lại`,
  `Bot học: ${learningProfile.totalSignals || 0} tín hiệu, độ tin cậy ${Math.round((learningProfile.confidence || 0) * 100)}%`,
  "",
  "Bài mới:",
  ...latest.map((article, index) => formatTelegramArticleReference(siteUrl, article, index + 1)),
  "",
  `Trang web: ${siteUrl}/vi/`
].join("\n");

for (const chatId of chatIds) {
  await sendTelegramMessage({ token, chatId, text: message });
}

console.log(`Đã gửi báo cáo Telegram đến ${chatIds.length} chat.`);

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(rootDir, targetPath), "utf8"));
  } catch {
    return {};
  }
}

function normalizeIdList(values) {
  return String(values || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sortByPublishedDesc(left, right) {
  return Date.parse(right.published_at || right.updated_at || 0) - Date.parse(left.published_at || left.updated_at || 0);
}

function selectLatestNewsArticles(sourceArticles, limit) {
  const news = sourceArticles
    .filter((article) => article?.content_type === "NewsArticle" && article.verification_state !== "trend")
    .sort(sortByPublishedDesc);

  return (news.length ? news : sourceArticles.slice().sort(sortByPublishedDesc)).slice(0, limit);
}

function formatCycleWindow(startedAt, finishedAt) {
  if (!startedAt) {
    return "Thời gian chu kỳ: chưa ghi nhận";
  }

  const started = formatTimestamp(startedAt);
  const finished = finishedAt ? formatTimestamp(finishedAt) : "đang chạy";
  const duration = finishedAt ? formatDuration(startedAt, finishedAt) : "";
  return `Thời gian chu kỳ: ${started} - ${finished}${duration ? ` (${duration})` : ""}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "chưa rõ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh"
  }).format(date);
}

function formatDuration(startedAt, finishedAt) {
  const elapsed = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "";
  }

  return `${Math.floor(elapsed / 60000)} phút ${Math.floor((elapsed % 60000) / 1000)} giây`;
}

function extractRefreshedCount(value) {
  const match = String(value || "").match(/Refreshed\s+(\d+)\s+article/i);
  if (match) {
    return Number(match[1]);
  }

  return /already up to date|no new articles/i.test(String(value || "")) ? 0 : null;
}

function countHeldCandidates(value) {
  return (String(value || "").match(/Holding (?:normalized|synthesized|source-draft) article/gi) || []).length;
}

function countSourceWarnings(value) {
  return (String(value || "").match(/Skipping [^:]+: (?:Feed .+ returned \d+|This operation was aborted)/gi) || []).length;
}

function formatDelta(value) {
  const delta = Number(value || 0);
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatRefreshMode(mode) {
  const labels = {
    "external-feed": "nguồn ngoài",
    "telegram-link": "liên kết gửi từ Telegram",
    "hidden-feed": "nguồn ẩn",
    "default": "nguồn mặc định",
    "unknown": "chưa rõ"
  };

  return labels[String(mode || "unknown").toLowerCase()] || String(mode || "chưa rõ");
}
