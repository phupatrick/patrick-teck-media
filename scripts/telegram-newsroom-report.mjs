import fs from "node:fs";
import path from "node:path";
import { sendTelegramMessage } from "../src/telegram-newsroom-bot.mjs";

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
const message = [
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
  ...latest.map((article, index) => `${index + 1}. ${article.title}\n${siteUrl}${article.href}`),
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
