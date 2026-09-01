import { analyzeAndSelfUpgrade } from "../src/social-optimizer.mjs";

export async function runSocialDailyReport({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const stats = await analyzeAndSelfUpgrade({ env, fetchImpl, now });
  const token = String(env.TELEGRAM_NEWSROOM_BOT_TOKEN || "").trim();
  const chatIds = String(env.TELEGRAM_NEWSROOM_REPORT_CHAT_IDS || env.TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const top = stats.topWinningPosts[0]?.topic || "Chưa có bài nổi bật";
  const text = [`📊 BÁO CÁO SOCIAL AUTOPILOT`, `Bài xuất bản hôm nay: ${stats.totalPostsToday}`, `Reactions: ${stats.totalReactions} | Comments: ${stats.totalComments} | Shares: ${stats.totalShares}`, `Bài hiệu quả nhất: ${top}`, `Trụ cột đang ưu tiên: ${stats.learnedContext.winning_pillars.join(", ")}`].join("\n");
  if (token && chatIds.length) {
    for (const chatId of chatIds) await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
  }
  return { ...stats, delivered: Boolean(token && chatIds.length), recipients: chatIds.length };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  runSocialDailyReport().then((result) => console.log(JSON.stringify({ delivered: result.delivered, recipients: result.recipients }))).catch((error) => { console.error(`[social-daily-report] ${error.message || error}`); process.exitCode = 1; });
}
