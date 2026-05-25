const DEFAULT_COMMANDS = [
  { command: "status", description: "View web and newsroom status" },
  { command: "latest", description: "Show latest published stories" },
  { command: "refresh", description: "Request a newsroom refresh" },
  { command: "jobs", description: "View OpenClaw jobs" },
  { command: "help", description: "View commands" }
];

const HELP_TEXT = [
  "Patrick Tech Media newsroom bot",
  "",
  "/status - xem tình hình web, số bài, OpenClaw",
  "/latest - xem bài mới nhất",
  "/refresh - yêu cầu quét/cập nhật bài mới",
  "/jobs - xem hàng đợi OpenClaw",
  "/help - xem hướng dẫn",
  "",
  "Bot này chạy bằng webhook trên Vercel. Tác vụ nặng sẽ được chuyển sang GitHub Actions/OpenClaw worker để không cần máy cá nhân mở 24/24."
].join("\n");

export function createTelegramNewsroomBot(options = {}) {
  const token = String(options.token || "").trim();
  const allowedChatIds = new Set(normalizeIdList(options.allowedChatIds || []));
  const adminUserIds = new Set(normalizeIdList(options.adminUserIds || []));
  const siteUrl = normalizeSiteUrl(options.siteUrl || "https://patricktechmedia.com");
  const getState = options.getState;
  const getControlSummary = options.getControlSummary;
  const createControlJob = options.createControlJob;
  const dispatchWorkflow = options.dispatchWorkflow;
  let botProfile = null;

  return {
    async initialize() {
      if (!token || botProfile) {
        return Boolean(token);
      }

      botProfile = await apiCall(token, "getMe", {});

      try {
        await apiCall(token, "setMyCommands", { commands: DEFAULT_COMMANDS });
      } catch {
        // Command registration is convenient but not required for webhook handling.
      }

      return true;
    },
    async handleUpdate(update) {
      await this.initialize();

      const message = update?.message || update?.edited_message;
      if (!message) {
        return;
      }

      if (!isAllowedChat(message.chat)) {
        await sendMessage(message.chat.id, "Chat này chưa được phép điều khiển newsroom bot.");
        return;
      }

      const text = String(message.text || "").trim();
      if (!text || !text.startsWith("/")) {
        return;
      }

      try {
        const response = await executeNewsroomCommand(text, {
          userId: String(message.from?.id || ""),
          botUsername: botProfile?.username || "",
          isAdmin: isAdminUser(message.from),
          siteUrl,
          getState,
          getControlSummary,
          createControlJob,
          dispatchWorkflow
        });

        if (response?.text) {
          await sendMessage(message.chat.id, response.text, {
            reply_to_message_id: message.message_id
          });
        }
      } catch (error) {
        await sendMessage(message.chat.id, error.message || "Newsroom command failed.", {
          reply_to_message_id: message.message_id
        });
      }
    }
  };

  async function sendMessage(chatId, text, extra = {}) {
    return sendTelegramMessage({ token, chatId, text, extra });
  }

  function isAllowedChat(chat) {
    const chatId = String(chat?.id || "");
    return allowedChatIds.size === 0 || allowedChatIds.has(chatId);
  }

  function isAdminUser(user) {
    const userId = String(user?.id || "");
    return adminUserIds.has(userId);
  }
}

export async function executeNewsroomCommand(rawText, context = {}) {
  const commandText = stripBotMention(String(rawText || "").trim(), context.botUsername);
  const [firstToken] = commandText.split(/\s+/);
  const command = String(firstToken || "").toLowerCase();

  if (["/start", "/help"].includes(command)) {
    return { text: HELP_TEXT };
  }

  if (command === "/status") {
    return { text: await buildStatusText(context) };
  }

  if (command === "/latest") {
    return { text: await buildLatestText(context) };
  }

  if (command === "/jobs") {
    return { text: await buildJobsText(context) };
  }

  if (command === "/refresh") {
    if (!context.isAdmin) {
      throw new Error("Chỉ admin được yêu cầu refresh newsroom.");
    }

    return { text: await requestRefresh(context) };
  }

  return { text: HELP_TEXT };
}

export async function sendTelegramMessage({ token, chatId, text, extra = {} }) {
  const normalizedToken = String(token || "").trim();
  const normalizedChatId = String(chatId || "").trim();

  if (!normalizedToken || !normalizedChatId) {
    return null;
  }

  return apiCall(normalizedToken, "sendMessage", {
    chat_id: normalizedChatId,
    text: String(text || "").slice(0, 4000),
    disable_web_page_preview: true,
    ...extra
  });
}

async function buildStatusText(context) {
  const [state, control] = await Promise.all([
    context.getState?.(),
    context.getControlSummary?.().catch(() => null)
  ]);
  const articles = Array.isArray(state?.articles) ? state.articles : [];
  const latest = articles.slice().sort(sortByPublishedDesc)[0];

  return [
    "Tình hình Patrick Tech Media",
    "",
    `Web: ${context.siteUrl}/vi/`,
    `Bài public: ${articles.length}`,
    `Cập nhật dữ liệu: ${formatDate(state?.runtime?.generatedAt || state?.generated_at)}`,
    latest ? `Bài mới nhất: ${latest.title}` : "Bài mới nhất: chưa có dữ liệu",
    control
      ? `OpenClaw: ${control.jobs?.queued || 0} queued, ${control.jobs?.running || 0} running, ${control.jobs?.failed || 0} failed`
      : "OpenClaw: chưa có dữ liệu control"
  ].join("\n");
}

async function buildLatestText(context) {
  const state = await context.getState?.();
  const latest = (Array.isArray(state?.articles) ? state.articles : [])
    .slice()
    .sort(sortByPublishedDesc)
    .slice(0, 6);

  if (!latest.length) {
    return "Chưa có bài nào trong newsroom.";
  }

  return [
    "Bài mới nhất",
    "",
    ...latest.map((article, index) => `${index + 1}. ${article.title}\n${context.siteUrl}${article.href}`)
  ].join("\n\n");
}

async function buildJobsText(context) {
  const control = await context.getControlSummary?.();

  if (!control) {
    return "Chưa có dữ liệu OpenClaw jobs.";
  }

  const recent = Array.isArray(control.recentJobs) ? control.recentJobs.slice(0, 5) : [];
  return [
    "OpenClaw jobs",
    "",
    `Queued: ${control.jobs?.queued || 0}`,
    `Running: ${control.jobs?.running || 0}`,
    `Completed: ${control.jobs?.completed || 0}`,
    `Failed: ${control.jobs?.failed || 0}`,
    "",
    ...recent.map((job) => `- ${job.status}: ${job.type} (${job.id})`)
  ].join("\n").trim();
}

async function requestRefresh(context) {
  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `telegram:${context.userId || "admin"}`
    });

    if (result?.ok) {
      return "Đã yêu cầu GitHub Actions chạy OpenClaw manager. Khi xong bot sẽ báo cáo nếu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS đã cấu hình.";
    }
  }

  if (typeof context.createControlJob === "function") {
    const job = await context.createControlJob({
      type: "newsroom-refresh",
      capability: "newsroom",
      command: "npm run openclaw:manage && npm run openclaw:git-sync",
      payload: {
        source: "telegram",
        requestedBy: context.userId || ""
      },
      priority: 900,
      leaseSeconds: 1800
    });

    return `Đã đưa job refresh vào hàng đợi OpenClaw: ${job.id}`;
  }

  return "Chưa cấu hình GITHUB_WORKFLOW_DISPATCH_TOKEN hoặc OpenClaw worker để chạy refresh từ Telegram.";
}

async function apiCall(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with HTTP ${response.status}.`);
  }

  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || `Telegram API ${method} failed.`);
  }

  return body.result;
}

function stripBotMention(text, username = "") {
  if (!username) {
    return text;
  }

  return text.replace(new RegExp(`^(/\\w+)@${username}\\b`, "i"), "$1");
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : String(values || "").split(","))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "") || "https://patricktechmedia.com";
}

function sortByPublishedDesc(left, right) {
  return Date.parse(right.updated_at || right.published_at || 0) - Date.parse(left.updated_at || left.published_at || 0);
}

function formatDate(value) {
  if (!value) {
    return "chưa rõ";
  }

  try {
    return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Saigon" });
  } catch {
    return String(value);
  }
}
