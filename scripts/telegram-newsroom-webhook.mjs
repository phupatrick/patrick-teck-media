const token = String(process.env.TELEGRAM_NEWSROOM_BOT_TOKEN || "").trim();
const siteUrl = String(process.env.SITE_URL || "https://patricktechmedia.com").replace(/\/+$/, "");
const path = String(process.env.TELEGRAM_NEWSROOM_WEBHOOK_PATH || "/api/telegram/newsroom/webhook").trim();
const secret = String(process.env.TELEGRAM_NEWSROOM_WEBHOOK_SECRET || "").trim();
const deleteMode = process.argv.includes("--delete");

if (!token) {
  throw new Error("TELEGRAM_NEWSROOM_BOT_TOKEN is required.");
}

if (deleteMode) {
  const result = await telegram("deleteWebhook", { drop_pending_updates: false });
  console.log(`Newsroom webhook deleted: ${JSON.stringify(result)}`);
} else {
  const webhookUrl = `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const payload = {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message"],
    ...(secret ? { secret_token: secret } : {})
  };
  const result = await telegram("setWebhook", payload);
  console.log(`Newsroom webhook set to ${webhookUrl}: ${JSON.stringify(result)}`);
}

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(`Telegram ${method} failed with HTTP ${response.status}.`);
  }

  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || `Telegram ${method} failed.`);
  }

  return body.result;
}
