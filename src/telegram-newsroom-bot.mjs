const DEFAULT_COMMANDS = [
  { command: "status", description: "Xem trạng thái web và tòa soạn" },
  { command: "auto", description: "Xem lịch chạy tự động" },
  { command: "latest", description: "Xem các bài mới đăng" },
  { command: "views", description: "Xem bảng xếp hạng bài view cao" },
  { command: "rank", description: "Xếp hạng bài theo view" },
  { command: "audit", description: "Kiểm tra chất lượng bài đã đăng" },
  { command: "learn", description: "Xem hồ sơ học của bot" },
  { command: "feedback", description: "Dạy bot bằng phản hồi của chủ sở hữu" },
  { command: "health", description: "Kiểm tra tình trạng web đang chạy" },
  { command: "diagnose", description: "Kiểm tra lưu trữ và tự động hóa" },
  { command: "web", description: "Mở liên kết quản lý web" },
  { command: "id", description: "Lấy mã chat và mã người dùng" },
  { command: "submit", description: "Đọc, xác thực và đăng bài từ link" },
  { command: "shopee", description: "Thêm link quảng cáo Shopee" },
  { command: "ads", description: "Xem link quảng cáo Shopee" },
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
  "/id - lấy mã chat và mã người dùng để cấu hình Vercel",
  "/status - trạng thái web, số bài, bài mới nhất và OpenClaw",
  "/auto - lịch chạy tự động và trạng thái thiết lập",
  "/latest - danh sách bài mới đăng",
  "/views hoặc /rank - bảng xếp hạng bài view cao và bot học được gì từ nhóm đó",
  "/audit - quét bài đã đăng bị mỏng hoặc nhiễu nội dung",
  "/learn - hồ sơ học hiện tại của bot",
  "/feedback <tốt|tệ|sâu|gọn|nguồn|ảnh|giọng> <ghi chú> - dạy bot bằng phản hồi",
  "/health - kiểm tra trang chủ đang chạy và API tòa soạn",
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
  const getArticleViewStats = options.getArticleViewStats;
  const getArticleViewStorageMode = options.getArticleViewStorageMode;
  const addLearningFeedback = options.addLearningFeedback;
  const addShopeeAdLink = options.addShopeeAdLink;
  const listShopeeAdLinks = options.listShopeeAdLinks;
  const getBotDiagnostics = options.getBotDiagnostics;
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
    verifiedAt: "",
    registeredAt: "",
    retryAfterSeconds: 0,
    lastError: ""
  };
  let webhookRegistrationPromise = null;

  return {
    async initialize() {
      if (!token) {
        return false;
      }

      if (!botProfile) {
        botProfile = await apiCall(token, "getMe", {});

        try {
          await apiCall(token, "setMyCommands", { commands: DEFAULT_COMMANDS });
          await apiCall(token, "setMyCommands", { commands: DEFAULT_COMMANDS, language_code: "vi" });
        } catch {
          // Telegram command registration is optional; the bot can still answer messages.
        }
      }

      if (autoRegisterWebhook) {
        try {
          await ensureWebhookRegistration();
        } catch (error) {
          webhookStatus = {
            ...webhookStatus,
            lastAttemptAt: new Date().toISOString(),
            retryAfterSeconds: Number(error?.retryAfterSeconds || 0),
            lastError: error.message || "Không đăng ký được webhook."
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
        await sendMessage(message.chat.id, "Chat này chưa được phép điều khiển bot tòa soạn. Gửi /id để lấy mã chat và mã người dùng rồi cấu hình trên Vercel.");
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
          getArticleViewStats,
          getArticleViewStorageMode,
          addLearningFeedback,
          addShopeeAdLink,
          listShopeeAdLinks,
          getBotDiagnostics,
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
        await sendMessage(message.chat.id, error.message || "Lệnh tòa soạn bị lỗi.", {
          reply_to_message_id: message.message_id
        });
      }
    }
  };

  async function handleCallback(callbackQuery) {
    const message = callbackQuery?.message;
    const chat = message?.chat;

    if (!isAllowedChat(chat)) {
      await answerCallback(callbackQuery.id, "Chat chưa được phép.");
      return;
    }

    const action = String(callbackQuery.data || "");
    const command = mapCallbackToCommand(action);

    if (!command) {
      await answerCallback(callbackQuery.id, "Nút không hợp lệ.");
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
        getArticleViewStats,
        getArticleViewStorageMode,
        addLearningFeedback,
        addShopeeAdLink,
        listShopeeAdLinks,
        getBotDiagnostics,
        getWebhookStatus: () => ({ ...webhookStatus }),
        createControlJob,
        dispatchWorkflow,
        openClawEnabled
      });

      await answerCallback(callbackQuery.id, "Đã cập nhật.");
      await editMessage(chat.id, message.message_id, response?.text || MENU_TEXT, {
        reply_markup: buildMenuMarkup(action)
      });
    } catch (error) {
      await answerCallback(callbackQuery.id, "Có lỗi.");
      await editMessage(chat.id, message.message_id, error.message || "Lệnh tòa soạn bị lỗi.", {
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

  async function ensureWebhookRegistration() {
    if (webhookRegistrationPromise) {
      return webhookRegistrationPromise;
    }

    webhookRegistrationPromise = (async () => {
      const attemptedAt = new Date().toISOString();
      const current = await apiCall(token, "getWebhookInfo", {});
      const currentUrl = normalizeWebhookUrl(current?.url || "");

      if (currentUrl === webhookUrl) {
        webhookStatus = {
          enabled: true,
          url: webhookUrl,
          lastAttemptAt: attemptedAt,
          verifiedAt: attemptedAt,
          registeredAt: webhookStatus.registeredAt || attemptedAt,
          retryAfterSeconds: 0,
          lastError: ""
        };
        return current;
      }

      await registerWebhook({ token, webhookUrl, webhookSecret });
      webhookStatus = {
        enabled: true,
        url: webhookUrl,
        lastAttemptAt: attemptedAt,
        verifiedAt: attemptedAt,
        registeredAt: attemptedAt,
        retryAfterSeconds: 0,
        lastError: ""
      };
      return current;
    })().finally(() => {
      webhookRegistrationPromise = null;
    });

    return webhookRegistrationPromise;
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
    return { text: `Bot đang nhận lệnh trên Vercel.\nTrang web: ${context.siteUrl}/vi/` };
  }

  if (command === "/id") {
    return {
      text: [
        "Mã Telegram",
        "",
        `Mã chat: ${context.chatId || "chưa rõ"}`,
        `Mã người dùng: ${context.userId || "chưa rõ"}`,
        "",
        "Dùng mã chat cho TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS hoặc TELEGRAM_NEWSROOM_REPORT_CHAT_IDS.",
        "Dùng mã người dùng cho TELEGRAM_NEWSROOM_ADMIN_USER_IDS."
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

  if (command === "/views" || command === "/view" || command === "/rank" || command === "/ranking") {
    return { text: await buildViewsText(context) };
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

  if (command === "/diagnose" || command === "/diag") {
    return { text: await buildDiagnosticsText(context) };
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

  if (command === "/shopee" || command === "/addad") {
    return addShopeeAdvertisement(commandText.slice(firstToken.length).trim(), context);
  }

  if (command === "/ads" || command === "/listads") {
    return { text: await buildShopeeAdvertisementList(context) };
  }

  if (command === "/up" || command === "/upbai" || command === "/dangbai") {
    if (!context.isAdmin && !context.canSubmitLinks) {
      throw new Error("Chat này chưa được phép yêu cầu bot tự động up bài.");
    }

    return { text: await requestRefresh(context, "telegram-up-more") };
  }

  if (command === "/jobs") {
    return { text: await buildJobsText(context) };
  }

  if (command === "/refresh") {
    if (!context.isAdmin) {
      throw new Error("Chỉ admin được yêu cầu làm mới tòa soạn.");
    }

    return { text: await requestRefresh(context) };
  }

  return { text: HELP_TEXT };
}

export async function submitLearningFeedback(rawText, context = {}) {
  if (!context.isAdmin) {
    throw new Error("Chỉ admin được dạy bot bằng phản hồi.");
  }

  const parsed = parseFeedbackText(rawText);
  if (!parsed.note) {
    return {
      text: [
        "Chưa có nội dung phản hồi.",
        "",
        "Ví dụ:",
        "/feedback tốt Bài có checklist và ví dụ thực tế rất ổn",
        "/feedback tệ Bài còn mỏng, thiếu thông tin liên quan"
      ].join("\n")
    };
  }

  const diagnostics = typeof context.getBotDiagnostics === "function" ? await context.getBotDiagnostics().catch(() => null) : null;
  if (diagnostics && !diagnostics.learningPersistent) return { text: "Phản hồi chưa được lưu bền vững vì bộ nhớ học production đang tạm thời. Cần thêm DATABASE_URL trên Vercel trước khi dạy bot." };

  if (typeof context.addLearningFeedback !== "function") {
    return {
      text: "Chưa có nơi lưu hồ sơ học. Cần cấu hình DATABASE_URL hoặc OPENCLAW_LEARNING_STATE_PATH để bot ghi nhớ phản hồi."
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
      "Đã ghi nhớ phản hồi để bot học.",
      "",
      `Loại phản hồi: ${formatFeedbackKind(parsed.kind)}`,
      parsed.targetUrl ? `Liên kết: ${parsed.targetUrl}` : "",
      `Ghi chú: ${parsed.note}`,
      "",
      "Chu kỳ OpenClaw tiếp theo sẽ cập nhật hồ sơ học và điều chỉnh ưu tiên bài/nguồn."
    ].filter(Boolean).join("\n")
  };
}

async function addShopeeAdvertisement(rawText, context = {}) {
  if (!context.isAdmin) {
    throw new Error("Only admins can add advertising links.");
  }

  if (typeof context.addShopeeAdLink !== "function") {
    return { text: "Shopee advertising storage is not configured." };
  }

  const [urlPart, ...titleParts] = String(rawText || "").split("|");
  const url = String(urlPart || "").trim();
  const title = titleParts.join("|").trim() || "Shopee offer";

  if (!url) {
    return { text: "Usage: /shopee <shopee_url> | Title" };
  }

  const link = await context.addShopeeAdLink({ url, title, actor: context.userId || "telegram-admin" });
  return {
    text: [
    "Đã lưu link quảng cáo Shopee.",
    "Tiêu đề: " + link.title,
    "Link: " + link.url,
    "Website có thể tự động hiển thị ưu đãi này ở các vị trí quảng cáo phù hợp."
    ].join("\n")
  };
}

async function buildShopeeAdvertisementList(context = {}) {
  if (typeof context.listShopeeAdLinks !== "function") {
    return "Shopee advertising storage is not configured.";
  }

  const links = await context.listShopeeAdLinks();
  return links.length
    ? ["Link quảng cáo Shopee đang hoạt động", "", ...links.map((entry) => "- " + entry.id + " | " + entry.title + " | " + entry.url)].join("\n")
    : "Chưa có link quảng cáo Shopee. Dùng /shopee <link_shopee> | Tiêu đề";
}

export async function submitNewsroomLink(rawText, context = {}) {
  const [articleUrl] = extractArticleUrls(rawText);

  if (!articleUrl) {
    return {
      text: [
        "Chưa thấy liên kết bài viết hợp lệ.",
        "",
        "Gửi liên kết trực tiếp cho bot, hoặc dùng:",
        "/submit https://example.com/article"
      ].join("\n")
    };
  }

  if (!context.isAdmin && !context.canSubmitLinks) {
    throw new Error("Chat này chưa được phép gửi liên kết để bot xác thực và lên bài.");
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
    "Tình hình Patrick Tech Media",
    "",
    `Trang web: ${context.siteUrl}/vi/`,
    `Bài đã đăng: ${articles.length}`,
    `Cập nhật dữ liệu: ${formatDate(state?.runtime?.generatedAt || state?.generated_at)}`,
    latest ? `Bài mới nhất: ${latest.title}` : "Bài mới nhất: chưa có dữ liệu",
    control
      ? `OpenClaw: ${formatQueueSummary(control.jobs)}`
      : "OpenClaw: chưa có dữ liệu điều phối"
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
    ? formatQueueSummary(jobs)
    : "chưa có dữ liệu điều phối";
  const webhookText = webhook?.enabled
    ? webhook.lastError
      ? `tự động bật nhưng có lỗi: ${webhook.lastError}${webhook.retryAfterSeconds ? ` (chờ ${webhook.retryAfterSeconds} giây)` : ""}`
      : webhook.verifiedAt || webhook.registeredAt
        ? `đã kiểm tra, webhook đang đúng lúc ${formatDate(webhook.verifiedAt || webhook.registeredAt)}`
        : "tự động đang chờ khởi động lạnh"
    : "tắt hoặc chưa có URL webhook";

  return [
    "Chế độ tự động",
    "",
    "Telegram webhook: Vercel nhận lệnh 24/24 theo kiểu không cần mở máy.",
    `Webhook tự động: ${webhookText}`,
    "Làm mới tòa soạn: GitHub Actions chạy mỗi 15 phút.",
    "Lịch dự phòng Vercel: gọi /api/openclaw/cron mỗi ngày lúc 01:00 Asia/Saigon.",
    "Báo cáo Telegram: gửi sau mỗi chu kỳ nếu đã cấu hình TELEGRAM_NEWSROOM_REPORT_CHAT_IDS.",
    "",
    `Hàng đợi OpenClaw: ${openClawQueueText}`,
    `Quyền hiện tại: ${context.isAdmin ? "có quyền /refresh" : "chưa có quyền /refresh"}`,
    "",
    "Để bấm /refresh trên Telegram, Vercel cần có GITHUB_WORKFLOW_DISPATCH_TOKEN và đúng repo/ref GitHub."
  ].join("\n");
}

async function buildLearningText(context) {
  const summary = typeof context.getLearningSummary === "function"
    ? await context.getLearningSummary().catch(() => null)
    : null;
  const profile = summary?.profile || {};
  const topicWeights = Object.entries(profile.topicWeights || {}).slice(0, 5);
  const sourceTypeWeights = Object.entries(profile.sourceTypeWeights || {}).slice(0, 5);
  const topViewed = Array.isArray(profile.topViewedArticles) ? profile.topViewedArticles.slice(0, 3) : [];
  const viewInsights = Array.isArray(profile.viewInsights) ? profile.viewInsights.slice(0, 3) : [];
  const storageWarning = summary?.storageMode && summary.storageMode !== "neon-postgres"
    ? "WARNING: learning storage is temporary. Add DATABASE_URL on Vercel before relying on feedback."
    : "";

  if (!summary) {
    return "Chưa có hồ sơ học. Hãy gửi /feedback sau mỗi bài để bot bắt đầu học.";
  }

  return [
    "Hồ sơ học của bot",
    "",
    `Mô hình học: ${summary.model?.id || "adaptive-editorial-bandit-v1"}`,
    `CNN: ${summary.model?.cnn_enabled ? "bật" : "tắt"} (${summary.model?.reason || "chưa phù hợp cho văn bản/Vercel"})`,
    `Tín hiệu học: ${profile.totalSignals || 0}`,
    `Phản hồi của chủ sở hữu: ${summary.feedbackCount || 0}`,
    `Độ tự tin: ${Math.round((profile.confidence || 0) * 100)}%`,
    summary.storageMode ? `Nguồn hồ sơ: ${summary.storageMode}` : "",
    storageWarning,
    profile.updated_at ? `Cập nhật: ${formatDate(profile.updated_at)}` : "",
    "",
    topicWeights.length ? `Chủ đề đang ưu tiên: ${topicWeights.map(([key, value]) => `${formatTopicKey(key)} ${value > 0 ? "+" : ""}${value}`).join(", ")}` : "Chủ đề đang ưu tiên: chưa đủ tín hiệu",
    sourceTypeWeights.length ? `Nguồn đang ưu tiên: ${sourceTypeWeights.map(([key, value]) => `${formatSourceTypeKey(key)} ${value > 0 ? "+" : ""}${value}`).join(", ")}` : "Nguồn đang ưu tiên: chưa đủ tín hiệu",
    topViewed.length ? `Bài view cao đang học: ${topViewed.map((entry) => `${entry.title} (${entry.views})`).join("; ")}` : "Bài view cao đang học: chưa có dữ liệu view",
    viewInsights.length ? `Bài học từ view: ${viewInsights.map(localizeLearningRule).join(" | ")}` : "",
    "",
    "Quy tắc đang học:",
    ...((profile.styleRules || []).slice(0, 4).map((rule) => `- ${localizeLearningRule(rule)}`)),
    "",
    "Nên tránh:",
    ...((profile.avoidRules || []).slice(0, 4).map((rule) => `- ${localizeLearningRule(rule)}`))
  ].filter((line) => line !== "").join("\n");
}

async function buildLatestText(context) {
  const state = await context.getState?.();
  const articles = Array.isArray(state?.articles) ? state.articles : [];
  const latest = selectLatestNewsArticles(articles, 6);

  if (!latest.length) {
    return "Chưa có bài nào trong tòa soạn.";
  }

  return [
    "Bài mới nhất",
    ...latest.map((article, index) => formatTelegramArticleReference(context.siteUrl, article, index + 1))
  ].join("\n\n");
}

async function buildViewsText(context) {
  const [views, learning] = await Promise.all([
    typeof context.getArticleViewStats === "function"
      ? context.getArticleViewStats({ limit: 10, language: "vi" }).catch(() => [])
      : Promise.resolve([]),
    typeof context.getLearningSummary === "function"
      ? context.getLearningSummary().catch(() => null)
      : Promise.resolve(null)
  ]);
  const items = Array.isArray(views) ? views : [];
  const insights = Array.isArray(learning?.profile?.viewInsights) ? learning.profile.viewInsights.slice(0, 4) : [];
  const storageMode = typeof context.getArticleViewStorageMode === "function" ? context.getArticleViewStorageMode() : "";
  const storageWarning = storageMode && storageMode !== "neon-postgres"
    ? "Storage view chưa bền. Cần DATABASE_URL trên Vercel production để bot đọc được view sau cold start."
    : "";

  if (!items.length) {
    return [
      "Thống kê view",
      storageMode ? `Storage: ${storageMode}` : "",
      "",
      "Chưa có dữ liệu view. Từ bản này, mỗi lần mở trang bài viết sẽ được ghi nhớ dạng thống kê gộp để bot học.",
      storageWarning
    ].filter((line) => line !== "").join("\n");
  }

  return [
    "Bảng xếp hạng view",
    storageMode ? `Storage: ${storageMode}` : "",
    "",
    ...items.map((entry, index) => [
      `${formatViewRank(entry.rank || index + 1, entry.rank_label)} ${entry.title || entry.article_href}`,
      `Điểm hạng: ${entry.rank_score || 0} | View: ${entry.views} | Unique: ${entry.unique_views}`,
      `Nhóm: ${formatTopicKey(entry.topic)} / ${entry.content_type || "NewsArticle"} / ${formatSourceTypeKey(entry.source_type)}`,
      buildPublicArticleUrl(context.siteUrl, entry)
    ].join("\n")),
    storageWarning ? "" : "",
    storageWarning,
    insights.length ? "" : "",
    insights.length ? "Bot rút ra:" : "",
    ...insights.map((insight) => `- ${localizeLearningRule(insight)}`)
  ].filter((line) => line !== "").join("\n\n");
}

function formatViewRank(rank, label = "") {
  const normalizedRank = Number.isFinite(Number(rank)) ? Number(rank) : 0;
  if (label) {
    return `${label}.`;
  }
  return normalizedRank > 0 ? `#${normalizedRank}.` : "#.";
}

async function buildAuditText(context) {
  const state = await context.getState?.();
  const articles = Array.isArray(state?.articles) ? state.articles : [];
  const audits = articles.map(auditArticleForTelegram).filter((entry) => entry.issues.length > 0);
  const thinCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("nội dung mỏng"))).length;
  const noisyCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("nhiễm menu"))).length;
  const sourceCount = audits.filter((entry) => entry.issues.some((issue) => issue.startsWith("lặp tên nguồn"))).length;

  if (!articles.length) {
    return "Chưa có dữ liệu bài viết để kiểm tra.";
  }

  if (!audits.length) {
    return [
      "Kiểm tra nội dung",
      "",
      `Đã quét ${articles.length} bài đã đăng.`,
      "Không thấy bài mỏng, nhiễm menu nguồn, hoặc lặp nguồn quá mức."
    ].join("\n");
  }

  const topIssues = audits
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
  const repairText = await requestAuditRepair(context, {
    totalIssues: audits.length,
    examples: topIssues.map((entry) => ({
      title: entry.title,
      href: entry.href,
      issues: entry.issues
    }))
  });

  return [
    "Kiểm tra nội dung",
    "",
    `Đã quét ${articles.length} bài đã đăng.`,
    `Cần xem lại: ${audits.length}`,
    `Nội dung mỏng: ${thinCount}`,
    `Nhiễm menu nguồn: ${noisyCount}`,
    `Lặp tên nguồn: ${sourceCount}`,
    "",
    ...topIssues.map((entry, index) => [
      `${index + 1}. ${entry.title}`,
      `Vấn đề: ${entry.issues.join(", ")}`,
      buildPublicArticleUrl(context.siteUrl, entry)
    ].join("\n")),
    "",
    "Xử lý tự động:",
    repairText
  ].join("\n");
}

async function buildHealthText(context) {
  const startedAt = Date.now();
  const checks = await Promise.all([
    checkUrl(`${context.siteUrl}/vi/`, "Trang chủ"),
    checkUrl(`${context.siteUrl}/api/newsroom/overview?lang=vi`, "API tòa soạn")
  ]);
  const elapsedMs = Date.now() - startedAt;

  return [
    "Kiểm tra web đang chạy",
    "",
    ...checks.map((check) => `${check.label}: ${check.ok ? "ổn" : "lỗi"} ${check.status || ""} ${check.ms}ms`),
    "",
    `Tổng thời gian: ${elapsedMs}ms`
  ].join("\n");
}

async function buildDiagnosticsText(context) {
  const diagnostics = typeof context.getBotDiagnostics === "function" ? await context.getBotDiagnostics().catch(() => null) : null;
  if (!diagnostics) return "Bot diagnostics are unavailable.";
  return ["Chẩn đoán bot Patrick Tech Media", "", "Lưu trữ hồ sơ học: " + diagnostics.learningStorageMode, "Hồ sơ học bền vững: " + (diagnostics.learningPersistent ? "sẵn sàng" : "cần DATABASE_URL"), "Lưu trữ view: " + diagnostics.viewStorageMode, "Lưu trữ quảng cáo Shopee: " + diagnostics.sellerStorageMode, "Gọi GitHub Actions làm mới: " + (diagnostics.workflowDispatchConfigured ? "sẵn sàng" : "thiếu token"), "Worker OpenClaw: " + (diagnostics.openClawEnabled ? "sẵn sàng" : "chưa cấu hình"), "", diagnostics.learningPersistent ? "Hồ sơ học bền vững đã sẵn sàng." : "Việc cần làm: thêm cùng một DATABASE_URL vào Vercel Production và GitHub Actions secrets, sau đó deploy lại."].join("\n");
}

async function buildJobsText(context) {
  const control = await context.getControlSummary?.();

  if (!control) {
    return "Chưa có dữ liệu hàng đợi OpenClaw.";
  }

  const recent = Array.isArray(control.recentJobs) ? control.recentJobs.slice(0, 5) : [];
  return [
    "Hàng đợi OpenClaw",
    "",
    `Đang chờ: ${control.jobs?.queued || 0}`,
    `Đang chạy: ${control.jobs?.running || 0}`,
    `Đã xong: ${control.jobs?.completed || 0}`,
    `Bị lỗi: ${control.jobs?.failed || 0}`,
    "",
    ...recent.map((job) => `- ${formatJobStatus(job.status)}: ${formatJobType(job.type)} (${job.id})`)
  ].join("\n").trim();
}

async function requestRefresh(context, reasonPrefix = "telegram") {
  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `${reasonPrefix}:${context.userId || "admin"}`
    });

    if (result?.ok) {
      if (reasonPrefix === "telegram-up-more") {
        const requestedAt = new Date().toISOString();
        return [
          `Đã bắt đầu yêu cầu quét tin mới lúc ${requestedAt}.`,
          "GitHub Actions sẽ thu thập nguồn web hiện tại, viết/lọc nội dung và cập nhật kho bài.",
          "Bot chỉ xác nhận kết quả sau khi chu kỳ xong bằng báo cáo thời gian thực: nguồn, bài quét, bài đạt/giữ lại và bài mới."
        ].join("\n");
      }

      return "Đã yêu cầu GitHub Actions chạy OpenClaw manager. Khi xong bot sẽ báo cáo nếu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS đã cấu hình.";
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
      ? `Đã đưa tác vụ tự động up bài vào hàng đợi OpenClaw: ${job.id}`
      : `Đã đưa tác vụ làm mới vào hàng đợi OpenClaw: ${job.id}`;
  }

  return [
    "Chưa bật tự động làm mới.",
    "",
    "Hiện bot đang chạy trên Vercel để nhận lệnh /status, /latest, /health, /web.",
    "Khi đã thiết lập OpenClaw/GitHub Actions, thêm GITHUB_WORKFLOW_DISPATCH_TOKEN rồi dùng lại /refresh."
  ].join("\n");
}

async function requestAuditRepair(context, auditSummary) {
  if (!context.isAdmin && !context.canSubmitLinks) {
    return "Chat này chưa có quyền tự xử lý lỗi audit.";
  }

  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `telegram-audit-fix:${context.userId || "admin"}`,
      auditRepair: true
    });

    if (result?.ok) {
      return [
        `Đã đưa ${auditSummary.totalIssues} bài cần sửa vào quy trình tự động.`,
        "GitHub Actions sẽ chạy bước sửa audit, chuẩn hóa lại nội dung, lọc bài không đủ điều kiện và commit dữ liệu mới.",
        "Khi xong, bot sẽ gửi báo cáo Telegram."
      ].join("\n");
    }
  }

  if (context.openClawEnabled && typeof context.createControlJob === "function") {
    const job = await context.createControlJob({
      type: "newsroom-audit-repair",
      capability: "newsroom",
      command: "node scripts/newsroom-audit-repair.mjs && npm run openclaw:git-sync",
      payload: {
        source: "telegram-audit",
        requestedBy: context.userId || "",
        auditSummary
      },
      priority: 980,
      leaseSeconds: 1800
    });

    return `Đã đưa tác vụ sửa audit vào hàng đợi OpenClaw: ${job.id}`;
  }

  return "Đã phát hiện lỗi, nhưng chưa có GITHUB_WORKFLOW_DISPATCH_TOKEN hoặc OpenClaw worker để tự sửa. Cần bật một trong hai đường này.";
}

async function requestArticlePublish(context, articleUrl) {
  if (typeof context.dispatchWorkflow === "function") {
    const result = await context.dispatchWorkflow({
      reason: `telegram-link:${context.userId || "admin"}`,
      articleUrl
    });

    if (result?.ok) {
      return [
        "Đã nhận liên kết và gửi vào quy trình tự động.",
        "",
        `Liên kết: ${articleUrl}`,
        "Bot sẽ đọc nội dung, lọc phần dư thừa, xác thực độ tin cậy, chọn ảnh nguồn phù hợp, viết bài có giá trị, chạy cổng kiểm tra chất lượng rồi mới đăng.",
        "Khi quy trình xong, báo cáo Telegram sẽ gửi lại nếu TELEGRAM_NEWSROOM_REPORT_CHAT_IDS đã cấu hình."
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
        instructions: "Đọc URL nguồn, xác thực mức liên quan công nghệ và chất lượng nguồn, chỉ đăng khi bài vượt qua cổng sẵn sàng của tòa soạn."
      },
      priority: 950,
      leaseSeconds: 1800
    });

    return [
      "Đã đưa liên kết vào hàng đợi OpenClaw.",
      "",
      `Tác vụ: ${job.id}`,
      `Liên kết: ${articleUrl}`,
      "Trình xử lý sẽ chạy khi OpenClaw trực tuyến."
    ].join("\n");
  }

  return [
    "Đã nhận liên kết nhưng chưa có đường chạy tự động để đăng bài.",
    "",
    `Liên kết: ${articleUrl}`,
    "Cần cấu hình GITHUB_WORKFLOW_DISPATCH_TOKEN trong Vercel để bot gọi GitHub Actions, hoặc bật OpenClaw worker."
  ].join("\n");
}

function buildWebLinksText(context) {
  return [
    "Liên kết quản lý Patrick Tech Media",
    "",
    `Trang chính: ${context.siteUrl}/vi/`,
    `Bản tiếng Anh: ${context.siteUrl}/en/`,
    `Tác giả: ${context.siteUrl}/vi/authors`,
    `Cửa hàng: ${context.siteUrl}/vi/store`,
    `Cổng cộng tác viên: ${context.siteUrl}/vi/portal`,
    `Đăng nhập: ${context.siteUrl}/vi/login`,
    "",
    "GitHub: https://github.com/phupatrick/patrick-teck-media",
    "Vercel: mở dashboard dự án patrick-teck-media"
  ].join("\n");
}

function buildSetupText(context) {
  return [
    "Checklist cài đặt bot trên Vercel",
    "",
    "1. Tạo bot với BotFather và lấy token.",
    "2. Thêm TELEGRAM_NEWSROOM_BOT_TOKEN vào biến môi trường Vercel.",
    "3. Gửi /id cho bot để lấy mã chat và mã người dùng.",
    "4. Thêm mã chat vào TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS.",
    "5. Thêm mã người dùng của bạn vào TELEGRAM_NEWSROOM_ADMIN_USER_IDS.",
    "6. Thêm TELEGRAM_NEWSROOM_WEBHOOK_SECRET vào biến môi trường Vercel.",
    "7. Đặt TELEGRAM_NEWSROOM_AUTO_WEBHOOK=1 để Vercel tự đăng ký webhook.",
    "8. Thêm GITHUB_WORKFLOW_DISPATCH_TOKEN để bot nhận liên kết và đẩy lên GitHub Actions.",
    "9. Thêm DATABASE_URL để phản hồi/hồ sơ học được lưu bền vững 24/24.",
    "10. Triển khai lại Vercel.",
    "",
    `Trang đang cấu hình: ${context.siteUrl}/vi/`
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
        button(selected("views", "View cao"), "newsroom:views"),
        button(selected("audit", "Kiểm tra bài"), "newsroom:audit")
      ],
      [
        button(selected("health", "Tình trạng web"), "newsroom:health")
      ],
      [
        button(selected("web", "Liên kết quản lý"), "newsroom:web"),
        button(selected("jobs", "Hàng đợi"), "newsroom:jobs")
      ],
      [
        button(selected("learn", "Bot \u0068\u1ecdc"), "newsroom:learn"),
        button(selected("diagnose", "Ch\u1ea9n \u0111o\u00e1n"), "newsroom:diagnose")
      ],
      [
        button(selected("ads", "Qu\u1ea3ng c\u00e1o"), "newsroom:ads"),
        button(selected("id", "L\u1ea5y ID"), "newsroom:id")
      ],
      [
        button(selected("setup", "Cài đặt"), "newsroom:setup"),
        button(selected("refresh", "Làm mới"), "newsroom:refresh")
      ],
      [
        button("Mở web", "newsroom:site"),
        button("Bảng lệnh", "newsroom:menu")
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
    "newsroom:views": "/views",
    "newsroom:rank": "/rank",
    "newsroom:audit": "/audit",
    "newsroom:learn": "/learn",
    "newsroom:health": "/health",
    "newsroom:diagnose": "/diagnose",
    "newsroom:ads": "/ads",
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
    "good", "hay", "like", "useful", "tot", "tốt",
    "bad", "te", "tệ", "chua", "chưa", "weak",
    "more", "sau", "sâu", "depth", "long",
    "less", "gon", "gọn", "noise",
    "source", "nguon", "nguồn",
    "image", "anh", "ảnh",
    "tone", "giong", "giọng"
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
    tốt: "good",
    bad: "bad",
    te: "bad",
    tệ: "bad",
    chua: "bad",
    chưa: "bad",
    weak: "bad",
    more: "more-depth",
    sau: "more-depth",
    sâu: "more-depth",
    depth: "more-depth",
    long: "more-depth",
    less: "less-noise",
    gon: "less-noise",
    gọn: "less-noise",
    noise: "less-noise",
    source: "source",
    nguon: "source",
    nguồn: "source",
    image: "image",
    anh: "image",
    ảnh: "image",
    tone: "tone",
    giong: "tone",
    giọng: "tone"
  };

  return aliases[normalized] || "good";
}

function formatFeedbackKind(kind) {
  const labels = {
    good: "tốt",
    bad: "cần sửa",
    "more-depth": "cần đào sâu hơn",
    "less-noise": "cần gọn và ít nhiễu hơn",
    source: "nguồn",
    image: "ảnh",
    tone: "giọng văn"
  };

  return labels[kind] || kind || "tốt";
}

function formatQueueSummary(jobs = {}) {
  return `${jobs.queued || 0} đang chờ, ${jobs.running || 0} đang chạy, ${jobs.failed || 0} bị lỗi`;
}

function formatJobStatus(status) {
  const labels = {
    queued: "đang chờ",
    running: "đang chạy",
    completed: "đã xong",
    failed: "bị lỗi",
    cancelled: "đã hủy",
    canceled: "đã hủy",
    timed_out: "quá thời gian"
  };

  return labels[String(status || "").toLowerCase()] || String(status || "chưa rõ");
}

function formatJobType(type) {
  const labels = {
    "newsroom-refresh": "làm mới tòa soạn",
    "newsroom-link-publish": "đăng bài từ liên kết"
  };

  return labels[String(type || "").toLowerCase()] || String(type || "tác vụ");
}

function formatTopicKey(key) {
  const labels = {
    ai: "AI",
    devices: "thiết bị",
    security: "bảo mật",
    gaming: "gaming",
    "apps-software": "ứng dụng và phần mềm",
    "internet-business-tech": "internet và doanh nghiệp số"
  };

  return labels[String(key || "").toLowerCase()] || String(key || "chủ đề khác");
}

function formatSourceTypeKey(key) {
  const labels = {
    "official-site": "trang chính thức",
    "official-social": "mạng xã hội chính thức",
    press: "báo chí",
    "established-media": "truyền thông uy tín",
    community: "cộng đồng",
    "social-buzz": "tín hiệu mạng xã hội",
    "editorial-research": "nghiên cứu biên tập"
  };

  return labels[String(key || "").toLowerCase()] || String(key || "nguồn khác");
}

function localizeLearningRule(rule) {
  const normalized = String(rule || "").trim();
  const translations = new Map([
    ["prefer practical examples", "ưu tiên ví dụ thực tế"],
    ["prefer source-backed claims", "ưu tiên nhận định có nguồn chứng minh"],
    ["prefer specific workflows", "ưu tiên quy trình cụ thể"],
    ["avoid vague trend language", "tránh nói xu hướng chung chung"],
    ["avoid thin summaries", "tránh tóm tắt mỏng"],
    ["avoid repeated source names", "tránh lặp tên nguồn quá nhiều"],
    ["avoid scraped menu text", "tránh dính menu hoặc chữ thừa từ nguồn"]
  ]);

  return translations.get(normalized.toLowerCase()) || normalized;
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
  const responseText = await response.text();
  let body = {};

  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = {};
  }

  if (!response.ok || !body.ok) {
    const retryAfterSeconds = Number(body?.parameters?.retry_after || response.headers.get("retry-after") || 0);
    const retryHint = retryAfterSeconds > 0 ? ` Thử lại sau ${retryAfterSeconds} giây.` : "";
    const error = new Error(
      `${body.description || `Telegram API ${method} bị lỗi HTTP ${response.status}`}.${retryHint}`.replace(/\.\./g, ".")
    );
    error.statusCode = response.status;
    error.retryAfterSeconds = retryAfterSeconds;
    error.telegramMethod = method;
    throw error;
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

export function buildPublicArticleUrl(siteUrl, article = {}) {
  const href = String(article?.href || article?.article_href || "").trim();

  if (/^https?:\/\//i.test(href)) {
    return href;
  }

  if (href.startsWith("/")) {
    return `${normalizeSiteUrl(siteUrl)}${href}`;
  }

  const slug = String(article?.slug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    return "";
  }

  const language = String(article?.language || "vi").trim().toLowerCase() === "en" ? "en" : "vi";
  const fallbackSegments = {
    NewsArticle: { vi: "tin-tuc", en: "news" },
    EvergreenGuide: { vi: "huong-dan", en: "guides" },
    ComparisonPage: { vi: "so-sanh", en: "compare" },
    Roundup: { vi: "tong-hop", en: "roundups" }
  };
  const contentType = String(article?.content_type || "NewsArticle").trim();
  const segment = String(article?.path_segment || fallbackSegments[contentType]?.[language] || fallbackSegments.NewsArticle[language])
    .trim()
    .replace(/^\/+|\/+$/g, "");

  return `${normalizeSiteUrl(siteUrl)}/${language}/${segment}/${slug}`;
}

export function formatTelegramArticleReference(siteUrl, article = {}, number = null) {
  const title = String(article?.title || "Untitled article").trim();
  const prefix = number === null ? "" : `${number}. `;
  const url = buildPublicArticleUrl(siteUrl, article);
  return url ? `${prefix}${title}\n${url}` : `${prefix}${title}`;
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
    issues.push(`nội dung mỏng ${sections.length} mục/${totalDepth} ký tự`);
  }

  if (looksLikeScrapedMenu(combined)) {
    issues.push("nhiễm menu nguồn");
  }

  if (sourceMentionCount >= Math.max(12, sourceNames.length * 3)) {
    issues.push(`lặp tên nguồn ${sourceMentionCount} lần`);
  }

  return {
    title: normalizeText(article?.title) || "Chưa có tiêu đề",
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
    return "chưa rõ";
  }

  try {
    return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Saigon" });
  } catch {
    return String(value);
  }
}
