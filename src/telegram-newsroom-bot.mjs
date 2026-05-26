const DEFAULT_COMMANDS = [
  { command: "status", description: "View web and newsroom status" },
  { command: "auto", description: "View automatic run schedule" },
  { command: "latest", description: "Show latest published stories" },
  { command: "audit", description: "Review public story quality issues" },
  { command: "health", description: "Check live site health" },
  { command: "web", description: "Show web management links" },
  { command: "id", description: "Show Telegram ids for setup" },
  { command: "refresh", description: "Request a newsroom refresh" },
  { command: "jobs", description: "View OpenClaw jobs" },
  { command: "setup", description: "Show setup checklist" },
  { command: "menu", description: "Open control panel" },
  { command: "help", description: "View commands" }
];

const HELP_TEXT = [
  "Patrick Tech Media newsroom bot",
  "",
  "/ping - quick bot check",
  "/id - show chat id and user id for Vercel env setup",
  "/status - web status, article count, latest story, OpenClaw summary",
  "/auto - automatic run schedule and setup state",
  "/latest - latest published stories",
  "/audit - scan public stories for thin or noisy content",
  "/health - check live homepage and newsroom API",
  "/web - web management links",
  "/setup - setup checklist for Vercel",
  "/refresh - admin-only refresh request, enabled after GitHub/OpenClaw setup",
  "/jobs - OpenClaw queue summary",
  "/help - command list",
  "/menu - open button control panel",
  "",
  "Current mode: Vercel webhook for Telegram commands, GitHub Actions for frequent newsroom refresh, Vercel cron as daily fallback."
].join("\n");

const MENU_TEXT = [
  "Patrick Tech Media control panel",
  "",
  "Chon mot nut ben duoi de quan ly nhanh newsroom tren Vercel."
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
  const openClawEnabled = Boolean(options.openClawEnabled);
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
        // Command registration is optional.
      }

      return true;
    },
    async handleUpdate(update) {
      await this.initialize();

      if (update?.callback_query) {
        await handleCallback(update.callback_query);
        return;
      }

      const message = update?.message || update?.edited_message;
      if (!message) {
        return;
      }

      if (!isAllowedChat(message.chat)) {
        await sendMessage(message.chat.id, "Chat nay chua duoc phep dieu khien newsroom bot.");
        return;
      }

      const text = String(message.text || "").trim();
      if (!text || !text.startsWith("/")) {
        return;
      }

      try {
        const response = await executeNewsroomCommand(text, {
          userId: String(message.from?.id || ""),
          chatId: String(message.chat?.id || ""),
          botUsername: botProfile?.username || "",
          isAdmin: isAdminUser(message.from),
          siteUrl,
          getState,
          getControlSummary,
          createControlJob,
          dispatchWorkflow,
          openClawEnabled
        });

        if (response?.text) {
          await sendMessage(message.chat.id, response.text, {
            reply_to_message_id: message.message_id,
            reply_markup: response.replyMarkup
          });
        }
      } catch (error) {
        await sendMessage(message.chat.id, error.message || "Newsroom command failed.", {
          reply_to_message_id: message.message_id
        });
      }
    }
  };

  async function handleCallback(callbackQuery) {
    const message = callbackQuery?.message;
    const chat = message?.chat;

    if (!isAllowedChat(chat)) {
      await answerCallback(callbackQuery.id, "Chat chua duoc phep.");
      return;
    }

    const action = String(callbackQuery.data || "");
    const command = mapCallbackToCommand(action);

    if (!command) {
      await answerCallback(callbackQuery.id, "Nut khong hop le.");
      return;
    }

    try {
      const response = await executeNewsroomCommand(command, {
        userId: String(callbackQuery.from?.id || ""),
        chatId: String(chat?.id || ""),
        botUsername: botProfile?.username || "",
        isAdmin: isAdminUser(callbackQuery.from),
        siteUrl,
        getState,
        getControlSummary,
        createControlJob,
        dispatchWorkflow,
        openClawEnabled
      });

      await answerCallback(callbackQuery.id, "Da cap nhat.");
      await editMessage(chat.id, message.message_id, response?.text || MENU_TEXT, {
        reply_markup: buildMenuMarkup(action)
      });
    } catch (error) {
      await answerCallback(callbackQuery.id, "Loi.");
      await editMessage(chat.id, message.message_id, error.message || "Newsroom command failed.", {
        reply_markup: buildMenuMarkup("menu")
      });
    }
  }

  async function sendMessage(chatId, text, extra = {}) {
    return sendTelegramMessage({ token, chatId, text, extra });
  }

  async function editMessage(chatId, messageId, text, extra = {}) {
    return apiCall(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: String(text || "").slice(0, 4000),
      disable_web_page_preview: true,
      ...extra
    });
  }

  async function answerCallback(callbackQueryId, text = "") {
    return apiCall(token, "answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text: String(text || "").slice(0, 180)
    });
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

  if (["/start", "/help", "/menu"].includes(command)) {
    return { text: `${MENU_TEXT}\n\n${HELP_TEXT}`, replyMarkup: buildMenuMarkup("menu") };
  }

  if (command === "/ping") {
    return { text: `Pong. Bot dang nhan lenh tren Vercel.\nWeb: ${context.siteUrl}/vi/` };
  }

  if (command === "/id") {
    return {
      text: [
        "Telegram ids",
        "",
        `Chat id: ${context.chatId || "unknown"}`,
        `User id: ${context.userId || "unknown"}`,
        "",
        "Dung Chat id cho TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS hoac TELEGRAM_NEWSROOM_REPORT_CHAT_IDS.",
        "Dung User id cho TELEGRAM_NEWSROOM_ADMIN_USER_IDS."
      ].join("\n")
    };
  }

  if (command === "/status") {
    return { text: await buildStatusText(context) };
  }

  if (command === "/auto") {
    return { text: await buildAutomationText(context) };
  }

  if (command === "/latest") {
    return { text: await buildLatestText(context) };
  }

  if (command === "/audit") {
    return { text: await buildAuditText(context) };
  }

  if (command === "/health") {
    return { text: await buildHealthText(context) };
  }

  if (command === "/web") {
    return { text: buildWebLinksText(context) };
  }

  if (command === "/setup") {
    return { text: buildSetupText(context) };
  }

  if (command === "/jobs") {
    return { text: await buildJobsText(context) };
  }

  if (command === "/refresh") {
    if (!context.isAdmin) {
      throw new Error("Chi admin duoc yeu cau refresh newsroom.");
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
    "Tinh hinh Patrick Tech Media",
    "",
    `Web: ${context.siteUrl}/vi/`,
    `Bai public: ${articles.length}`,
    `Cap nhat du lieu: ${formatDate(state?.runtime?.generatedAt || state?.generated_at)}`,
    latest ? `Bai moi nhat: ${latest.title}` : "Bai moi nhat: chua co du lieu",
    control
      ? `OpenClaw: ${control.jobs?.queued || 0} queued, ${control.jobs?.running || 0} running, ${control.jobs?.failed || 0} failed`
      : "OpenClaw: chua co du lieu control"
  ].join("\n");
}

async function buildAutomationText(context) {
  const control = await context.getControlSummary?.().catch(() => null);
  const jobs = control?.jobs || {};
  const openClawQueueText = control
    ? `${jobs.queued || 0} queued, ${jobs.running || 0} running, ${jobs.failed || 0} failed`
    : "chua co du lieu control";

  return [
    "Che do tu dong",
    "",
    "Telegram webhook: Vercel nhan lenh 24/24 theo kieu serverless.",
    "Newsroom refresh: GitHub Actions chay moi 15 phut.",
    "Vercel cron fallback: goi /api/openclaw/cron moi ngay 01:00 Asia/Saigon.",
    "Bao cao Telegram: gui sau moi chu ky neu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS da cau hinh.",
    "",
    `OpenClaw queue: ${openClawQueueText}`,
    `Admin hien tai: ${context.isAdmin ? "co quyen /refresh" : "chua co quyen /refresh"}`,
    "",
    "De /refresh bam tay tren Telegram hoat dong, Vercel can GITHUB_WORKFLOW_DISPATCH_TOKEN va GitHub repo/ref dung."
  ].join("\n");
}

async function buildLatestText(context) {
  const state = await context.getState?.();
  const latest = (Array.isArray(state?.articles) ? state.articles : [])
    .slice()
    .sort(sortByPublishedDesc)
    .slice(0, 6);

  if (!latest.length) {
    return "Chua co bai nao trong newsroom.";
  }

  return [
    "Bai moi nhat",
    "",
    ...latest.map((article, index) => `${index + 1}. ${article.title}\n${context.siteUrl}${article.href}`)
  ].join("\n\n");
}

async function buildAuditText(context) {
  const state = await context.getState?.();
  const articles = Array.isArray(state?.articles) ? state.articles : [];
  const audits = articles.map(auditArticleForTelegram).filter((entry) => entry.issues.length > 0);
  const thinCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("noi dung mong"))).length;
  const noisyCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("nhiem menu"))).length;
  const sourceCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("nguon lap"))).length;

  if (!articles.length) {
    return "Chua co du lieu bai viet de audit.";
  }

  if (!audits.length) {
    return [
      "Audit noi dung",
      "",
      `Da quet ${articles.length} bai public.`,
      "Khong thay bai mong, nhiem menu nguon, hoac lap nguon qua muc."
    ].join("\n");
  }

  const topIssues = audits
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  return [
    "Audit noi dung",
    "",
    `Da quet ${articles.length} bai public.`,
    `Can xem lai: ${audits.length}`,
    `Noi dung mong: ${thinCount}`,
    `Nhiem menu nguon: ${noisyCount}`,
    `Lap ten nguon: ${sourceCount}`,
    "",
    ...topIssues.map((entry, index) => [
      `${index + 1}. ${entry.title}`,
      `Van de: ${entry.issues.join(", ")}`,
      `${context.siteUrl}${entry.href}`
    ].join("\n"))
  ].join("\n");
}

async function buildHealthText(context) {
  const startedAt = Date.now();
  const checks = await Promise.all([
    checkUrl(`${context.siteUrl}/vi/`, "Homepage"),
    checkUrl(`${context.siteUrl}/api/newsroom/overview?lang=vi`, "Newsroom API")
  ]);
  const elapsedMs = Date.now() - startedAt;

  return [
    "Kiem tra live site",
    "",
    ...checks.map((check) => `${check.label}: ${check.ok ? "OK" : "FAIL"} ${check.status || ""} ${check.ms}ms`),
    "",
    `Tong thoi gian: ${elapsedMs}ms`
  ].join("\n");
}

async function buildJobsText(context) {
  const control = await context.getControlSummary?.();

  if (!control) {
    return "Chua co du lieu OpenClaw jobs.";
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
      return "Da yeu cau GitHub Actions chay OpenClaw manager. Khi xong bot se bao cao neu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS da cau hinh.";
    }
  }

  if (context.openClawEnabled && typeof context.createControlJob === "function") {
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

    return `Da dua job refresh vao hang doi OpenClaw: ${job.id}`;
  }

  return [
    "Chua bat tu dong refresh.",
    "",
    "Tam thoi bot dang chay tren Vercel de nhan lenh /status, /latest, /health, /web.",
    "Khi nao setup OpenClaw/GitHub Actions, them GITHUB_WORKFLOW_DISPATCH_TOKEN roi dung lai /refresh."
  ].join("\n");
}

function buildWebLinksText(context) {
  return [
    "Link quan ly Patrick Tech Media",
    "",
    `Trang chinh: ${context.siteUrl}/vi/`,
    `English: ${context.siteUrl}/en/`,
    `Tac gia: ${context.siteUrl}/vi/authors`,
    `Store: ${context.siteUrl}/vi/store`,
    `Writer portal: ${context.siteUrl}/vi/portal`,
    `Dang nhap: ${context.siteUrl}/vi/login`,
    "",
    "GitHub: https://github.com/phupatrick/patrick-teck-media",
    "Vercel: mo dashboard project patrick-teck-media"
  ].join("\n");
}

function buildSetupText(context) {
  return [
    "Checklist setup bot tren Vercel",
    "",
    "1. Tao bot voi BotFather va lay token.",
    "2. Them TELEGRAM_NEWSROOM_BOT_TOKEN vao Vercel env.",
    "3. Gui /id cho bot de lay chat id va user id.",
    "4. Them chat id vao TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS.",
    "5. Them user id cua ban vao TELEGRAM_NEWSROOM_ADMIN_USER_IDS.",
    "6. Them TELEGRAM_NEWSROOM_WEBHOOK_SECRET vao Vercel env.",
    "7. Redeploy Vercel.",
    "8. Chay npm run telegram:newsroom:webhook:set.",
    "",
    `Site dang cau hinh: ${context.siteUrl}/vi/`
  ].join("\n");
}

function buildMenuMarkup(active = "menu") {
  const activeKey = String(active || "menu").replace(/^newsroom:/, "");
  const selected = (key, label) => key === activeKey ? `${label} *` : label;

  return {
    inline_keyboard: [
      [
        button(selected("status", "Status"), "newsroom:status"),
        button(selected("auto", "Auto"), "newsroom:auto")
      ],
      [
        button(selected("latest", "Latest"), "newsroom:latest"),
        button(selected("audit", "Audit"), "newsroom:audit")
      ],
      [
        button(selected("health", "Health"), "newsroom:health"),
        button(selected("web", "Web links"), "newsroom:web")
      ],
      [
        button(selected("jobs", "Jobs"), "newsroom:jobs"),
        button(selected("id", "IDs"), "newsroom:id")
      ],
      [
        button(selected("setup", "Setup"), "newsroom:setup"),
        button(selected("refresh", "Refresh"), "newsroom:refresh")
      ],
      [
        button("Open site", "newsroom:site"),
        button("Menu", "newsroom:menu")
      ]
    ]
  };
}

function button(text, callbackData) {
  return {
    text,
    callback_data: callbackData
  };
}

function mapCallbackToCommand(action) {
  const commandMap = {
    "newsroom:menu": "/menu",
    "newsroom:status": "/status",
    "newsroom:auto": "/auto",
    "newsroom:latest": "/latest",
    "newsroom:audit": "/audit",
    "newsroom:health": "/health",
    "newsroom:web": "/web",
    "newsroom:id": "/id",
    "newsroom:setup": "/setup",
    "newsroom:jobs": "/jobs",
    "newsroom:refresh": "/refresh",
    "newsroom:site": "/web"
  };

  return commandMap[action] || "";
}

async function checkUrl(url, label) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "patrick-tech-media-newsroom-bot/1.0" }
    });
    return {
      label,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt
    };
  } catch {
    return {
      label,
      ok: false,
      status: "",
      ms: Date.now() - startedAt
    };
  }
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

function auditArticleForTelegram(article) {
  const sections = Array.isArray(article?.sections) ? article.sections : [];
  const fields = [
    article?.summary,
    article?.dek,
    article?.hook,
    ...sections.flatMap((section) => [section?.heading, section?.body])
  ].map(normalizeText);
  const combined = fields.join(" ");
  const totalDepth = sections.reduce((sum, section) => sum + normalizeText(section?.body).length, 0);
  const sourceNames = Array.isArray(article?.source_set)
    ? article.source_set.map((source) => normalizeText(source?.source_name)).filter(Boolean)
    : [];
  const sourceMentionCount = sourceNames.reduce((sum, name) => sum + countTextOccurrences(combined, name), 0);
  const issues = [];

  if (sections.length < 4 || totalDepth < 1200) {
    issues.push(`noi dung mong ${sections.length} muc/${totalDepth} ky tu`);
  }

  if (looksLikeScrapedMenu(combined)) {
    issues.push("nhiem menu nguon");
  }

  if (sourceMentionCount >= Math.max(12, sourceNames.length * 3)) {
    issues.push(`nguon lap ${sourceMentionCount} lan`);
  }

  return {
    title: normalizeText(article?.title) || "Untitled",
    href: article?.href || "",
    issues,
    score: issues.length * 100 + (looksLikeScrapedMenu(combined) ? 50 : 0) + Math.max(0, 1500 - totalDepth) / 100
  };
}

function looksLikeScrapedMenu(text) {
  const normalized = normalizeText(text).toLowerCase();
  const menuSignals = [
    "open menu",
    "view profile",
    "sign out",
    "search search",
    "popular brands",
    "more from",
    "buying guides",
    "coupons",
    "get daily insight"
  ];
  const hits = menuSignals.filter((signal) => normalized.includes(signal)).length;
  return hits >= 3 || /open menu[\s\S]{0,800}view profile[\s\S]{0,800}sign out/i.test(normalized);
}

function countTextOccurrences(text, needle) {
  const haystack = normalizeText(text).toLowerCase();
  const target = normalizeText(needle).toLowerCase();
  if (!target) {
    return 0;
  }

  let count = 0;
  let index = haystack.indexOf(target);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(target, index + target.length);
  }
  return count;
}

function normalizeText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value) {
  if (!value) {
    return "chua ro";
  }

  try {
    return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Saigon" });
  } catch {
    return String(value);
  }
}
