import fs from "node:fs";
import path from "node:path";
import { sendTelegramMessage } from "../src/telegram-newsroom-bot.mjs";

const rootDir = process.cwd();
const token = String(process.env.TELEGRAM_NEWSROOM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chatIds = normalizeIdList(process.env.TELEGRAM_NEWSROOM_REPORT_CHAT_IDS || process.env.TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS || "");
const siteUrl = String(process.env.SITE_URL || "https://patricktechmedia.com").replace(/\/+$/, "");
const contentPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
const managerStatePath = process.env.OPENCLAW_MANAGER_STATE_PATH || "data/openclaw-manager-state.json";

if (!token || chatIds.length === 0) {
  console.log("Telegram newsroom report skipped because token or report chat ids are not configured.");
  process.exit(0);
}

const content = readJson(contentPath);
const manager = readJson(managerStatePath);
const articles = Array.isArray(content.articles) ? content.articles : [];
const latest = articles.slice().sort(sortByPublishedDesc).slice(0, 5);
const message = [
  "Patrick Tech Media đã cập nhật newsroom",
  "",
  `Tổng bài trong file: ${articles.length}`,
  `Nguồn: ${manager.newsroom?.refresh?.mode || "unknown"}`,
  `Submission review: ${manager.platform?.submissionReview?.approved || 0} approved, ${manager.platform?.submissionReview?.held || 0} held`,
  "",
  "Bài mới:",
  ...latest.map((article, index) => `${index + 1}. ${article.title}\n${siteUrl}${article.href}`),
  "",
  `Web: ${siteUrl}/vi/`
].join("\n");

for (const chatId of chatIds) {
  await sendTelegramMessage({ token, chatId, text: message });
}

console.log(`Telegram newsroom report sent to ${chatIds.length} chat(s).`);

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
  return Date.parse(right.updated_at || right.published_at || 0) - Date.parse(left.updated_at || left.published_at || 0);
}
