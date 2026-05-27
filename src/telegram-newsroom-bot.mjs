const DEFAULT_COMMANDS = [
  { command: "status", description: "Xem trạng thái web và tòa soạn" },
  { command: "auto", description: "Xem lịch chạy tự động" },
  { command: "latest", description: "Xem các bài mới đăng" },
  { command: "audit", description: "Kiểm tra chất lượng bài public" },
  { command: "learn", description: "Xem hồ sơ học của bot" },
  { command: "feedback", description: "Dạy bot bằng phản hồi của chủ sở hữu" },
  { command: "health", description: "Kiểm tra sức khỏe web live" },
  { command: "web", description: "Mở liên kết quản lý web" },
  { command: "id", description: "Lấy Telegram chat id và user id" },
  { command: "submit", description: "Đọc, xác thực và đăng bài từ link" },
  { command: "up", description: "Tự động up thêm bài mới" },
  { command: "refresh", description: "Yêu cầu làm mới tòa soạn" },
  { command: "jobs", description: "Xem hàng đợi OpenClaw" },
  { command: "setup", description: "Xem checklist cài đặt" },
  { command: "menu", description: "Mở bảng điều khiển" },
  { command: "help", description: "Xem danh sách lệnh" }
];

const HELP_TEXT = [
  "Bot tòa soạn Patrick Tech Media",
  "",
  "/ping - kiểm tra bot nhanh",
  "/id - lấy chat id và user id để cấu hình Vercel",
  "/status - trạng thái web, số bài, bài mới nhất và OpenClaw",
  "/auto - lịch chạy tự động và trạng thái thiết lập",
  "/latest - danh sách bài mới đăng",
  "/audit - quét bài public bị mỏng hoặc nhiễu nội dung",
  "/learn - hồ sơ học hiện tại của bot",
  "/feedback <good|bad|more|less|source|image|tone> <ghi chú> - dạy bot bằng phản hồi",
  "/health - kiểm tra homepage live và API tòa soạn",
  "/web - liên kết quản lý web",
  "/setup - checklist cài đặt trên Vercel",
  "/submit <url> - đọc, xác thực và đăng bài từ link nguồn",
  "/up - tự động up thêm bài mới",
  "/refresh - yêu cầu làm mới tòa soạn, chỉ admin dùng được",
  "/jobs - tóm tắt hàng đợi OpenClaw",
  "/help - danh sách lệnh",
  "/menu - mở bảng điều khiển bằng nút",
  "",
  "Chế độ hiện tại: Vercel nhận lệnh Telegram qua webhook, GitHub Actions làm mới tòa soạn thường xuyên, Vercel cron làm dự phòng hằng ngày."
].join("\n");

const MENU_TEXT = [
  "Bảng điều khiển Patrick Tech Media",
  "",
  "Chọn một nút bên dưới để quản lý nhanh tòa soạn trên Vercel."
].join("\n");

export function createTelegramNewsroomBot(options = {}) {
  const token = String(options.token || "").trim();
  const allowedChatIds = new Set(normalizeIdList(options.allowedChatIds || []));
  const adminUserIds = new Set(normalizeIdList(options.adminUserIds || []));
  const siteUrl = normalizeSiteUrl(options.siteUrl || "https://patricktechmedia.com");
  const getState = options.getState;
  const getControlSummary = options.getControlSummary;
  const getLearningSummary = options.getLearningSummary;
  const addLearningFeedback = options.addLearningFeedback;
  const createControlJob = options.createControlJob;
  const dispatchWorkflow = options.dispatchWorkflow;
  const openClawEnabled = Boolean(options.openClawEnabled);
  const webhookUrl = normalizeWebhookUrl(options.webhookUrl || "");
  const webhookSecret = String(options.webhookSecret || "").trim();
  const autoRegisterWebhook = options.autoRegisterWebhook !== false && Boolean(webhookUrl);
  let botProfile = null;
  let webhookStatus = {
    enabled: autoRegisterWebhook,
    url: webhookUrl,
    lastAttemptAt: "",
    registeredAt: "",
    lastError: ""
  };

  return {
    async initialize() {
      if (!token) {
        return false;
      }

      if (!botProfile) {
        botProfile = await apiCall(token, "getMe", {});

        try {
          await apiCall(token, "setMyCommands", { commands: DEFAULT_COMMANDS });
        } catch {
          // Command registration is optional.
        }
      }

      if (autoRegisterWebhook) {
        const shouldTryWebhook = !webhookStatus.registeredAt || shouldRetryWebhook(webhookStatus.lastAttemptAt, webhookStatus.lastError);
        try {
          if (shouldTryWebhook) {
            const attemptedAt = new Date().toISOString();
            await registerWebhook({ token, webhookUrl, webhookSecret });
            webhookStatus = {
              enabled: true,
              url: webhookUrl,
              lastAttemptAt: attemptedAt,
              registeredAt: attemptedAt,
              lastError: ""
            };
          }
        } catch (error) {
          webhookStatus = {
            ...webhookStatus,
            lastAttemptAt: new Date().toISOString(),
            lastError: error.message || "Webhook registration failed."
          };
        }
      }

      return true;
    },
    getWebhookStatus() {
      return { ...webhookStatus };
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

      const text = String(message.text || message.caption || "").trim();
      if (!text) {
        return;
      }

      const publicSetupCommand = isPublicSetupCommand(text, botProfile?.username || "");
      if (!isAllowedChat(message.chat) && !publicSetupCommand) {
        await sendMessage(message.chat.id, "Chat nay chua duoc phep dieu khien newsroom bot. Gui /id de lay Chat id va User id cau hinh tren Vercel.");
        return;
      }

      try {
        const context = {
          userId: String(message.from?.id || ""),
          chatId: String(message.chat?.id || ""),
          botUsername: botProfile?.username || "",
          isAdmin: isAdminUser(message.from),
          canSubmitLinks: true,
          siteUrl,
          getState,
          getControlSummary,
          getLearningSummary,
          addLearningFeedback,
          getWebhookStatus: () => ({ ...webhookStatus }),
          createControlJob,
          dispatchWorkflow,
          openClawEnabled
        };
        const response = text.startsWith("/")
          ? await executeNewsroomCommand(text, context)
          : extractArticleUrls(text).length
            ? await submitNewsroomLink(text, context)
            : null;

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
        canSubmitLinks: true,
        siteUrl,
        getState,
        getControlSummary,
        getLearningSummary,
        addLearningFeedback,
        getWebhookStatus: () => ({ ...webhookStatus }),
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

  if (command === "/learn") {
    return { text: await buildLearningText(context) };
  }

  if (command === "/feedback") {
    const feedbackText = commandText.slice(firstToken.length).trim();
    return submitLearningFeedback(feedbackText, context);
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

  if (command === "/submit") {
    const linkText = commandText.slice(firstToken.length).trim();
    return submitNewsroomLink(linkText, context);
  }

  if (command === "/up" || command === "/upbai" || command === "/dangbai") {
    if (!context.isAdmin && !context.canSubmitLinks) {
      throw new Error("Chat nay chua duoc phep yeu cau bot tu dong up bai.");
    }

    return { text: await requestRefresh(context, "telegram-up-more") };
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

export async function submitLearningFeedback(rawText, context = {}) {
  if (!context.isAdmin) {
    throw new Error("Chi admin duoc day feedback cho bot hoc.");
  }

  const parsed = parseFeedbackText(rawText);
  if (!parsed.note) {
    return {
      text: [
        "Chua co noi dung feedback.",
        "",
        "Vi du:",
        "/feedback good Bai co checklist va vi du thuc te rat on",
        "/feedback bad Bai con mong, thieu thong tin lien quan"
      ].join("\n")
    };
  }

  if (typeof context.addLearningFeedback !== "function") {
    return {
      text: "Chua co learning store. Can cau hinh DATABASE_URL hoac OPENCLAW_LEARNING_STATE_PATH de bot ghi nho feedback."
    };
  }

  await context.addLearningFeedback({
    source: "telegram",
    userId: context.userId || "",
    chatId: context.chatId || "",
    kind: parsed.kind,
    note: parsed.note,
    targetUrl: parsed.targetUrl
  });

  return {
    text: [
      "Da ghi nho feedback cho bot hoc.",
      "",
      `Loai: ${parsed.kind}`,
      parsed.targetUrl ? `Link: ${parsed.targetUrl}` : "",
      `Ghi chu: ${parsed.note}`,
      "",
      "Chu ky OpenClaw tiep theo se cap nhat learning profile va dieu chinh uu tien bai/nguon."
    ].filter(Boolean).join("\n")
  };
}

export async function submitNewsroomLink(rawText, context = {}) {
  const [articleUrl] = extractArticleUrls(rawText);

  if (!articleUrl) {
    return {
      text: [
        "Chua thay link bai viet hop le.",
        "",
        "Gui link truc tiep cho bot, hoac dung:",
        "/submit https://example.com/article"
      ].join("\n")
    };
  }

  if (!context.isAdmin && !context.canSubmitLinks) {
    throw new Error("Chat nay chua duoc phep gui link de bot xac thuc va len bai.");
  }

  return { text: await requestArticlePublish(context, articleUrl) };
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
  const latest = selectLatestNewsArticles(articles, 1)[0] || articles.slice().sort(sortByPublishedDesc)[0];

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
  const controlPromise = typeof context.getControlSummary === "function"
    ? context.getControlSummary().catch(() => null)
    : Promise.resolve(null);
  const [control, webhook] = await Promise.all([
    controlPromise,
    Promise.resolve(typeof context.getWebhookStatus === "function" ? context.getWebhookStatus() : null)
  ]);
  const jobs = control?.jobs || {};
  const openClawQueueText = control
    ? `${jobs.queued || 0} queued, ${jobs.running || 0} running, ${jobs.failed || 0} failed`
    : "chua co du lieu control";
  const webhookText = webhook?.enabled
    ? webhook.lastError
      ? `tu dong bat nhung loi: ${webhook.lastError}`
      : webhook.registeredAt
        ? `tu dong OK luc ${formatDate(webhook.registeredAt)}`
        : "tu dong dang cho cold start"
    : "tat hoac chua co webhook URL";

  return [
    "Che do tu dong",
    "",
    "Telegram webhook: Vercel nhan lenh 24/24 theo kieu serverless.",
    `Auto webhook: ${webhookText}`,
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

async function buildLearningText(context) {
  const summary = typeof context.getLearningSummary === "function"
    ? await context.getLearningSummary().catch(() => null)
    : null;
  const profile = summary?.profile || {};
  const topicWeights = Object.entries(profile.topicWeights || {}).slice(0, 5);
  const sourceTypeWeights = Object.entries(profile.sourceTypeWeights || {}).slice(0, 5);

  if (!summary) {
    return "Chua co learning profile. Hay gui /feedback sau moi bai de bot bat dau hoc.";
  }

  return [
    "Bot learning profile",
    "",
    `Model: ${summary.model?.id || "adaptive-editorial-bandit-v1"}`,
    `CNN: ${summary.model?.cnn_enabled ? "bat" : "tat"} (${summary.model?.reason || "khong phu hop cho text/Vercel"})`,
    `Tin hieu: ${profile.totalSignals || 0}`,
    `Feedback owner: ${summary.feedbackCount || 0}`,
    `Do tu tin: ${Math.round((profile.confidence || 0) * 100)}%`,
    profile.updated_at ? `Cap nhat: ${formatDate(profile.updated_at)}` : "",
    "",
    topicWeights.length ? `Chu de dang uu tien: ${topicWeights.map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`).join(", ")}` : "Chu de dang uu tien: chua du tin hieu",
    sourceTypeWeights.length ? `Nguon dang uu tien: ${sourceTypeWeights.map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`).join(", ")}` : "Nguon dang uu tien: chua du tin hieu",
    "",
    "Quy tac dang hoc:",
    ...((profile.styleRules || []).slice(0, 4).map((rule) => `- ${rule}`)),
    "",
    "Nen tranh:",
    ...((profile.avoidRules || []).slice(0, 4).map((rule) => `- ${rule}`))
  ].filter((line) => line !== "").join("\n");
}

async function buildLatestText(context) {
  const state = await context.getState?.();
  const articles = Array.isArray(state?.articles) ? state.articles : [];
  const latest = selectLatestNewsArticles(articles, 6);

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

async function requestRefresh(context, reasonPrefix = "telegram") {
  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `${reasonPrefix}:${context.userId || "admin"}`
    });

    if (result?.ok) {
      return reasonPrefix === "telegram-up-more"
        ? "Da yeu cau bot tu dong up them bai. GitHub Actions dang chay OpenClaw manager; khi xong bot se bao cao tren Telegram."
        : "Da yeu cau GitHub Actions chay OpenClaw manager. Khi xong bot se bao cao neu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS da cau hinh.";
    }
  }

  if (context.openClawEnabled && typeof context.createControlJob === "function") {
    const job = await context.createControlJob({
      type: "newsroom-refresh",
      capability: "newsroom",
      command: "npm run openclaw:manage && npm run openclaw:git-sync",
      payload: {
        source: reasonPrefix,
        requestedBy: context.userId || ""
      },
      priority: 900,
      leaseSeconds: 1800
    });

    return reasonPrefix === "telegram-up-more"
      ? `Da dua job tu dong up bai vao hang doi OpenClaw: ${job.id}`
      : `Da dua job refresh vao hang doi OpenClaw: ${job.id}`;
  }

  return [
    "Chua bat tu dong refresh.",
    "",
    "Tam thoi bot dang chay tren Vercel de nhan lenh /status, /latest, /health, /web.",
    "Khi nao setup OpenClaw/GitHub Actions, them GITHUB_WORKFLOW_DISPATCH_TOKEN roi dung lai /refresh."
  ].join("\n");
}

async function requestArticlePublish(context, articleUrl) {
  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `telegram-link:${context.userId || "admin"}`,
      articleUrl
    });

    if (result?.ok) {
      return [
        "Da nhan link va gui vao workflow tu dong.",
        "",
        `Link: ${articleUrl}`,
        "Bot se doc noi dung, loc boilerplate, xac thuc do tin cay, chon anh nguon phu hop, viet bai co gia tri, chay quality gate roi moi publish.",
        "Khi workflow xong, Telegram report se bao lai neu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS da cau hinh."
      ].join("\n");
    }
  }

  if (context.openClawEnabled && typeof context.createControlJob === "function") {
    const job = await context.createControlJob({
      type: "newsroom-link-publish",
      capability: "newsroom",
      command: "npm run openclaw:manage && npm run openclaw:git-sync",
      payload: {
        source: "telegram-link",
        url: articleUrl,
        requestedBy: context.userId || "",
        instructions: "Read the source URL, verify technology relevance and source quality, publish only if the article passes the newsroom readiness gate."
      },
      priority: 950,
      leaseSeconds: 1800
    });

    return [
      "Da dua link vao hang doi OpenClaw.",
      "",
      `Job: ${job.id}`,
      `Link: ${articleUrl}`,
      "Worker se xu ly khi co OpenClaw worker online."
    ].join("\n");
  }

  return [
    "Da nhan link nhung chua co duong chay tu dong de publish.",
    "",
    `Link: ${articleUrl}`,
    "Can cau hinh GITHUB_WORKFLOW_DISPATCH_TOKEN trong Vercel de bot dispatch GitHub Actions, hoac bat OpenClaw worker."
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
    "7. De TELEGRAM_NEWSROOM_AUTO_WEBHOOK=1 de Vercel tu dang ky webhook.",
    "8. Them GITHUB_WORKFLOW_DISPATCH_TOKEN de bot nhan link va day len GitHub Actions.",
    "9. Them DATABASE_URL de feedback/learning luu ben vung 24/24.",
    "10. Redeploy Vercel.",
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
        button(selected("status", "Trạng thái"), "newsroom:status"),
        button(selected("auto", "Tự động"), "newsroom:auto")
      ],
      [
        button(selected("up", "Tự động up bài"), "newsroom:up"),
        button(selected("latest", "Bài mới"), "newsroom:latest")
      ],
      [
        button(selected("audit", "Kiểm tra bài"), "newsroom:audit"),
        button(selected("health", "Sức khỏe web"), "newsroom:health")
      ],
      [
        button(selected("web", "Link quản lý"), "newsroom:web"),
        button(selected("jobs", "Hàng đợi"), "newsroom:jobs")
      ],
      [
        button(selected("learn", "Bot học"), "newsroom:learn"),
        button(selected("id", "Lấy ID"), "newsroom:id")
      ],
      [
        button(selected("setup", "Cài đặt"), "newsroom:setup"),
        button(selected("refresh", "Làm mới"), "newsroom:refresh")
      ],
      [
        button("Mở web", "newsroom:site"),
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
    "newsroom:learn": "/learn",
    "newsroom:health": "/health",
    "newsroom:web": "/web",
    "newsroom:id": "/id",
    "newsroom:setup": "/setup",
    "newsroom:jobs": "/jobs",
    "newsroom:up": "/up",
    "newsroom:refresh": "/refresh",
    "newsroom:site": "/web"
  };

  return commandMap[action] || "";
}

function parseFeedbackText(rawText) {
  const [firstToken, ...rest] = String(rawText || "").trim().split(/\s+/);
  const explicitKind = isFeedbackKind(firstToken);
  const kind = explicitKind ? normalizeFeedbackKind(firstToken) : "good";
  const body = explicitKind ? rest.join(" ").trim() : String(rawText || "").trim();
  const [targetUrl] = extractArticleUrls(body);
  const note = body.replace(targetUrl || "", "").trim() || body || String(rawText || "").trim();

  return {
    kind,
    targetUrl: targetUrl || "",
    note
  };
}

function isFeedbackKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "good", "hay", "like", "useful", "tot",
    "bad", "te", "chua", "weak",
    "more", "sau", "depth", "long",
    "less", "gon", "noise",
    "source", "nguon",
    "image", "anh",
    "tone", "giong"
  ].includes(normalized);
}

function normalizeFeedbackKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const aliases = {
    good: "good",
    hay: "good",
    like: "good",
    useful: "good",
    tot: "good",
    bad: "bad",
    te: "bad",
    chua: "bad",
    weak: "bad",
    more: "more-depth",
    sau: "more-depth",
    depth: "more-depth",
    long: "more-depth",
    less: "less-noise",
    gon: "less-noise",
    noise: "less-noise",
    source: "source",
    nguon: "source",
    image: "image",
    anh: "image",
    tone: "tone",
    giong: "tone"
  };

  return aliases[normalized] || "good";
}

function extractArticleUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^\s<>"')\]]+/gi)]
    .map((match) => normalizeArticleUrl(match[0]))
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 3);
}

function normalizeArticleUrl(value) {
  const trimmed = String(value || "").trim().replace(/[.,;:!?]+$/g, "");

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    const hostname = url.hostname.toLowerCase();
    if (isPrivateOrLocalHostname(hostname)) {
      return "";
    }

    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return "";
  }
}

function isPrivateOrLocalHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host === "0.0.0.0"
    || host.startsWith("127.")
    || host.startsWith("10.")
    || host.startsWith("192.168.")
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || host.startsWith("169.254.")
    || host === "::1"
    || host.startsWith("fc")
    || host.startsWith("fd")
    || host.startsWith("fe80");
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

async function registerWebhook({ token, webhookUrl, webhookSecret }) {
  return apiCall(token, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: false,
    ...(webhookSecret ? { secret_token: webhookSecret } : {})
  });
}

function shouldRetryWebhook(lastAttemptAt, lastError) {
  if (!lastError) {
    return false;
  }

  const timestamp = Date.parse(lastAttemptAt || "");
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > 5 * 60 * 1000;
}

function stripBotMention(text, username = "") {
  if (!username) {
    return text;
  }

  return text.replace(new RegExp(`^(/\\w+)@${username}\\b`, "i"), "$1");
}

function isPublicSetupCommand(text, username = "") {
  const commandText = stripBotMention(String(text || "").trim(), username);
  const [firstToken] = commandText.split(/\s+/);
  return ["/id", "/setup", "/ping", "/help", "/start"].includes(String(firstToken || "").toLowerCase());
}

function normalizeIdList(values) {
  return (Array.isArray(values) ? values : String(values || "").split(","))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeSiteUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "") || "https://patricktechmedia.com";
}

function normalizeWebhookUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function sortByPublishedDesc(left, right) {
  return Date.parse(right.published_at || right.updated_at || 0) - Date.parse(left.published_at || left.updated_at || 0);
}

function selectLatestNewsArticles(articles, limit) {
  const list = Array.isArray(articles) ? articles : [];
  const news = list
    .filter((article) => article?.content_type === "NewsArticle" && article.verification_state !== "trend")
    .sort(sortByPublishedDesc);

  if (news.length) {
    return news.slice(0, limit);
  }

  return list.slice().sort(sortByPublishedDesc).slice(0, limit);
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
