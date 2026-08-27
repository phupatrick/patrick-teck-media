const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const siteUrl = String(process.env.SITE_URL || "https://patricktechmedia.com").replace(/\/+$/, "");
const path = String(process.env.TELEGRAM_SELLER_WEBHOOK_PATH || "/api/telegram/seller/webhook").trim();
const secret = String(process.env.TELEGRAM_SELLER_WEBHOOK_SECRET || "").trim();
const deleteMode = process.argv.includes("--delete");

if (!token) {
  throw new Error("Thiếu TELEGRAM_BOT_TOKEN.");
}

if (deleteMode) {
  const result = await telegram("deleteWebhook", { drop_pending_updates: false });
  console.log(`Đã xóa webhook Seller: ${JSON.stringify(result)}`);
} else {
  const webhookUrl = `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const result = await telegram("setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    ...(secret ? { secret_token: secret } : {})
  });
  console.log(`Đã đặt webhook Seller tới ${webhookUrl}: ${JSON.stringify(result)}`);
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} bị lỗi HTTP ${response.status}.`);
  }

  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || `Telegram ${method} bị lỗi.`);
  }

  return body.result;
}
