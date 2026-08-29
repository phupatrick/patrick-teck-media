import {
  buildProductCardLine,
  buildProductDetailText,
  createSellerService,
  normalizeDateTime
} from "./seller-service.mjs";

const BOT_ENTRY_COMMAND = "/heybot";
const SEARCH_WAIT_SECONDS = 180;
const LANGUAGE = "en";

const COPY = {
  welcome: "Seller Bot is ready. Choose a category, browse temporary products, or search the Catalog.",
  viewerHint: "Allowed group members can browse and search. Only administrators can add, edit, or delete products.",
  adminHint: "Administrators can use /addcat, /add, /addtemp, /edit, and /delete.",
  buttons: {
    browse: "Categories",
    temporary: "Temporary products",
    search: "Search",
    backHome: "Back to menu",
    backCategories: "Back to categories"
  },
  categoriesTitle: "Product categories",
  temporaryTitle: "Temporary products",
  noCategories: "No categories are available.",
  noProducts: "This category has no products.",
  searchPrompt: "Send a product name, keyword, or plan to search.",
  searchEmpty: "No matching products were found.",
  searchResults: "Search results",
  onlyAdmin: "Only administrators can modify the Catalog.",
  notAllowed: "This group is not allowed to use the bot.",
  help: [
    "Main commands:",
    "/heybot - open the Catalog menu",
    "/find <keyword> - search products",
    "",
    "Administrator commands:",
    "/addcat <category name>",
    "/add <category id> | Name | Duration | Warranty | Price | Description",
    "/addtemp Name | Duration | Warranty | Price | Description | YYYY-MM-DD",
    "/edit <product id> | name=... | category=... | duration=... | warranty=... | price=... | desc=... | until=... | status=active|inactive",
    "/delete <product id>",
    "/addad <Shopee link> | Title",
    "/listads - list advertising links",
    "/deletead <link id>",
    "/summary - show Catalog statistics"
  ].join("\n"),
  summary: "Catalog overview",
  summaryLines: (summary) => [
    `Categories: ${summary.totalCategories}`,
    `Total products: ${summary.totalProducts}`,
    `Standard products: ${summary.standardProducts}`,
    `Temporary products: ${summary.temporaryProducts}`,
    `Active: ${summary.active}`,
    `Pending: ${summary.pending}`,
    `Sold out: ${summary.soldOut}`,
    `Inactive: ${summary.inactive}`,
    `Shopee advertising links: ${summary.activeAdLinks || 0}`
  ]
};

export function createTelegramSellerBot(options = {}) {
  const token = String(options.token || "").trim();
  const service = options.service || createSellerService(options.serviceOptions || {});
  const pollingTimeoutSeconds = Math.max(1, Number(options.pollingTimeoutSeconds || 20));
  const allowedChatIds = new Set(normalizeIdList(options.allowedChatIds || []));
  const adminUserIds = new Set(normalizeIdList(options.adminUserIds || options.allowedUserIds || []));
  const timezone = String(options.timezone || "Asia/Ho_Chi_Minh").trim() || "Asia/Ho_Chi_Minh";
  const timezoneOffset = String(options.timezoneOffset || service.timezoneOffset || "+07:00").trim() || "+07:00";
  const webhookUrl = normalizeWebhookUrl(options.webhookUrl || "");
  const webhookSecret = String(options.webhookSecret || "").trim();
  const autoRegisterWebhook = options.autoRegisterWebhook !== false && Boolean(webhookUrl);
  const waitingSearch = new Map();

  let running = false;
  let offset = Number.isInteger(options.offset) ? options.offset : 0;
  let loopPromise = null;
  let botProfile = null;
  let webhookRegistrationPromise = null;
  let webhookStatus = { enabled: autoRegisterWebhook, url: webhookUrl, registeredAt: "", lastError: "" };

  return {
    service,
    async initialize() {
      await service.ensureDefaultCategories();
      try {
        const result = await service.syncStoreCatalog({ actor: "store-catalog-sync" });
        console.log(`[telegram-seller-bot] synced ${result.total} Store Catalog products in ${result.categories} categories`);
      } catch (error) {
        console.warn(`[telegram-seller-bot] Store Catalog sync skipped: ${error.message || error}`);
      }

      if (!token) {
        return false;
      }

      if (botProfile) {
        return true;
      }

      try {
        botProfile = await apiCall(token, "getMe", {});
      } catch (error) {
        throw error;
      }

      try {
        await apiCall(token, "setMyCommands", {
          commands: [
            { command: "heybot", description: "Mở menu Catalog Seller" },
            { command: "find", description: "Tìm sản phẩm" },
            { command: "help", description: "Xem hướng dẫn" }
          ]
        });
        await apiCall(token, "setMyCommands", {
          commands: [
            { command: "heybot", description: "Mở menu Catalog Seller" },
            { command: "find", description: "Tìm sản phẩm" },
            { command: "help", description: "Xem hướng dẫn" }
          ],
          language_code: "vi"
        });
      } catch {
        // Optional.
      }

      if (autoRegisterWebhook) {
        try {
          await ensureWebhookRegistration();
        } catch (error) {
          webhookStatus = { ...webhookStatus, lastError: error.message || "Không đăng ký được webhook Seller." };
        }
      }

      return true;
    },
    async start() {
      if (running) {
        return;
      }

      await this.initialize();
      if (!token) {
        return;
      }

      running = true;

      loopPromise = pollLoop();
      return loopPromise;
    },
    async stop() {
      running = false;
      await loopPromise;
    },
    getWebhookStatus() {
      return { ...webhookStatus };
    },
    async executeTextCommand(text, context = {}) {
      await service.ensureDefaultCategories();
      return executeSellerCommand(text, buildExecutionContext(context));
    },
    async handleUpdate(update) {
      await this.initialize();

      if (update?.callback_query) {
        await handleCallback(update.callback_query);
        return;
      }

      if (update?.message) {
        await handleMessage(update.message);
      }
    }
  };

  async function ensureWebhookRegistration() {
    if (webhookRegistrationPromise) return webhookRegistrationPromise;
    webhookRegistrationPromise = (async () => {
      const current = await apiCall(token, "getWebhookInfo", {});
      if (normalizeWebhookUrl(current?.url || "") !== webhookUrl) {
        await apiCall(token, "setWebhook", {
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
          ...(webhookSecret ? { secret_token: webhookSecret } : {})
        });
      }
      webhookStatus = { ...webhookStatus, registeredAt: new Date().toISOString(), lastError: "" };
      return current;
    })().finally(() => { webhookRegistrationPromise = null; });
    return webhookRegistrationPromise;
  }

  function buildExecutionContext(context = {}) {
    return {
      service,
      timezone,
      timezoneOffset,
      botUsername: botProfile?.username || options.botUsername || "",
      actor: resolveActor(context),
      now: context.now,
      adminUserIds,
      userId: String(context?.from?.id || context?.userId || "")
    };
  }

  async function pollLoop() {
    while (running) {
      try {
        const updates = await apiCall(token, "getUpdates", {
          offset,
          timeout: pollingTimeoutSeconds,
          allowed_updates: ["message", "callback_query"]
        });

        for (const update of updates) {
          offset = Math.max(offset, Number(update.update_id || 0) + 1);
          await service.purgeExpiredTemporaryProducts({ actor: "telegram-bot", language: LANGUAGE });

          if (update.callback_query) {
            await handleCallback(update.callback_query);
            continue;
          }

          if (update.message) {
            await handleMessage(update.message);
          }
        }
      } catch (error) {
        console.error(`[telegram-seller-bot] ${error.message || error}`);
        await wait(3000);
      }
    }
  }

  async function handleMessage(message) {
    if (!isAllowedChat(message.chat)) {
      await sendMessage(message.chat.id, COPY.notAllowed);
      return;
    }

    const text = String(message?.text || "").trim();
    const userId = String(message?.from?.id || "");

    if (!text) {
      return;
    }

    if (text.startsWith("/")) {
      try {
        const response = await executeSellerCommand(text, {
          service,
          timezone,
          timezoneOffset,
          botUsername: botProfile?.username || options.botUsername || "",
          actor: resolveActor({ chat: message.chat, from: message.from }),
          now: new Date().toISOString(),
          adminUserIds,
          userId
        });

        if (response?.text) {
          await sendMessage(message.chat.id, response.text, {
            reply_to_message_id: message.message_id,
            reply_markup: response.replyMarkup
          });
        }
      } catch (error) {
        await sendMessage(message.chat.id, error.message || String(error), {
          reply_to_message_id: message.message_id
        });
      }
      return;
    }

    const pendingSearch = waitingSearch.get(userId);
    if (pendingSearch && pendingSearch.expiresAt > Date.now()) {
      waitingSearch.delete(userId);
      const response = await buildSearchResponse(text);
      await sendMessage(message.chat.id, response.text, {
        reply_to_message_id: message.message_id,
        reply_markup: response.replyMarkup
      });
    }
  }

  async function handleCallback(callbackQuery) {
    const message = callbackQuery.message;
    const data = String(callbackQuery.data || "");
    const userId = String(callbackQuery.from?.id || "");

    if (!message || !isAllowedChat(message.chat)) {
      await answerCallback(callbackQuery.id, COPY.notAllowed);
      return;
    }

    try {
      if (data === "home") {
        await editCatalogMessage(message, buildHomeResponse(userId));
        await answerCallback(callbackQuery.id);
        return;
      }

      if (data === "browse") {
        await editCatalogMessage(message, await buildCategoryResponse());
        await answerCallback(callbackQuery.id);
        return;
      }

      if (data === "temporary") {
        await editCatalogMessage(message, await buildTemporaryResponse());
        await answerCallback(callbackQuery.id);
        return;
      }

      if (data === "search") {
        waitingSearch.set(userId, { expiresAt: Date.now() + SEARCH_WAIT_SECONDS * 1000 });
        await answerCallback(callbackQuery.id, COPY.searchPrompt);
        await sendMessage(message.chat.id, COPY.searchPrompt, {});
        return;
      }

      if (data.startsWith("cat:")) {
        const categoryId = data.slice("cat:".length);
        await editCatalogMessage(message, await buildCategoryProductsResponse(categoryId));
        await answerCallback(callbackQuery.id);
        return;
      }

      if (data.startsWith("product:")) {
        const productId = data.slice("product:".length);
        await editCatalogMessage(message, await buildProductResponse(productId));
        await answerCallback(callbackQuery.id);
        return;
      }

      await answerCallback(callbackQuery.id);
    } catch (error) {
      await answerCallback(callbackQuery.id, error.message || String(error));
    }
  }

  function buildHomeResponse(userId) {
    const isAdmin = adminUserIds.has(String(userId || ""));
    return {
      text: [COPY.welcome, "", COPY.viewerHint, isAdmin ? COPY.adminHint : ""].filter(Boolean).join("\n"),
      replyMarkup: inlineKeyboard([
        [button(COPY.buttons.browse, "browse"), button(COPY.buttons.temporary, "temporary")],
        [button(COPY.buttons.search, "search")]
      ])
    };
  }

  async function buildCategoryResponse() {
    const [categories, products] = await Promise.all([
      service.listCategories({ includeTemporary: false, language: LANGUAGE }),
      service.listProducts({ includeTemporary: false, language: LANGUAGE })
    ]);
    const populatedCategoryIds = new Set(products.map((product) => product.category_id));
    const visibleCategories = categories.filter((category) => populatedCategoryIds.has(category.id));
    return {
      text: visibleCategories.length
        ? [COPY.categoriesTitle, "", ...visibleCategories.map((entry) => `- ${entry.name}`)].join("\n")
        : COPY.noCategories,
      replyMarkup: inlineKeyboard([
        ...visibleCategories.map((entry) => [button(entry.name, `cat:${entry.id}`)]),
        [button(COPY.buttons.backHome, "home")]
      ])
    };
  }

  async function buildTemporaryResponse() {
    const products = await service.listProducts({ temporaryOnly: true, includeTemporary: true, language: LANGUAGE });
    return {
      text: products.length
        ? [COPY.temporaryTitle, "", ...products.map((entry) => `- ${buildProductCardLine(entry, { timezone })}`)].join("\n")
        : COPY.noProducts,
      replyMarkup: inlineKeyboard([
        ...products.map((entry) => [button(entry.name, `product:${entry.id}`)]),
        [button(COPY.buttons.backHome, "home")]
      ])
    };
  }

  async function buildCategoryProductsResponse(categoryId) {
    const category = await service.getCategoryById(categoryId, { language: LANGUAGE });
    if (!category) {
      throw new Error(COPY.noCategories);
    }

    const products = await service.listProductsByCategory(categoryId, { includeTemporary: true, language: LANGUAGE });
    return {
      text: products.length
        ? [category.name, "", ...products.map((entry) => `- ${buildProductCardLine(entry, { timezone })}`)].join("\n")
        : `${category.name}\n\n${COPY.noProducts}`,
      replyMarkup: inlineKeyboard([
        ...products.map((entry) => [button(entry.name, `product:${entry.id}`)]),
        [button(COPY.buttons.backCategories, "browse"), button(COPY.buttons.backHome, "home")]
      ])
    };
  }

  async function buildProductResponse(productId) {
    const product = await service.getProductById(productId, { language: LANGUAGE });
    if (!product) {
      throw new Error(COPY.noProducts);
    }

    return {
      text: buildProductDetailText(product, { timezone, language: LANGUAGE }),
      replyMarkup: inlineKeyboard([
        [button(COPY.buttons.backCategories, product.is_temporary ? "temporary" : `cat:${product.category_id}`)],
        [button(COPY.buttons.backHome, "home")]
      ])
    };
  }

  async function buildSearchResponse(query) {
    const products = await service.searchProducts(query, { includeTemporary: true, language: LANGUAGE });
    return buildSearchResultPayload(products, timezone);
  }

  async function editCatalogMessage(message, response) {
    await apiCall(token, "editMessageText", {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: response.text,
      reply_markup: response.replyMarkup
    });
  }

  async function sendMessage(chatId, text, extra = {}) {
    const normalizedText = String(text || "").slice(0, 4000);
    return apiCall(token, "sendMessage", {
      chat_id: chatId,
      text: normalizedText,
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
    if (allowedChatIds.size > 0 && !allowedChatIds.has(chatId)) {
      return false;
    }

    return true;
  }
}

export async function executeSellerCommand(text, context = {}) {
  const raw = String(text || "").trim();
  const service = context.service;

  if (!service) {
    throw new Error("Seller service is required.");
  }

  await service.ensureDefaultCategories();
  const commandText = stripBotMention(raw, context.botUsername);
  const [firstToken] = commandText.split(/\s+/);
  const command = String(firstToken || "").toLowerCase();
  const restText = commandText.slice(firstToken.length).trim();

  if ([BOT_ENTRY_COMMAND, "/start", "/help"].includes(command)) {
    return {
      text: `${COPY.help}\n\n${COPY.welcome}`,
      replyMarkup: inlineKeyboard([
        [button(COPY.buttons.browse, "browse"), button(COPY.buttons.temporary, "temporary")],
        [button(COPY.buttons.search, "search")]
      ])
    };
  }

  if (command === "/find") {
    if (!restText) {
      return { text: COPY.searchPrompt };
    }

    return buildSearchResultPayload(
      await service.searchProducts(restText, { includeTemporary: true, language: LANGUAGE }),
      context.timezone || "Asia/Ho_Chi_Minh"
    );
  }

  if (command === "/summary") {
    const summary = await service.getSummary({ now: context.now, language: LANGUAGE });
    return {
      text: [COPY.summary, "", ...COPY.summaryLines(summary)].join("\n")
    };
  }

  if (command === "/listads") {
    const links = await service.listAdLinks();
    return {
      text: links.length
        ? ["Link quảng cáo Shopee", "", ...links.map((entry) => `- ${entry.id} | ${entry.title} | ${entry.url}`)].join("\n")
        : "Chưa có link quảng cáo Shopee nào."
    };
  }

  if (!isAdminContext(context)) {
    throw new Error(COPY.onlyAdmin);
  }

  if (command === "/addcat") {
    const category = await service.createCategory({
      name: restText,
      actor: context.actor
    });

    return { text: `OK: ${category.name} (${category.id})` };
  }

  if (command === "/add") {
    const segments = splitPipeSegments(restText);
    if (segments.length < 6) {
      throw new Error("Cách dùng: /add <mã danh mục> | Tên | Thời hạn | Bảo hành | Giá | Mô tả");
    }

    const product = await service.createProduct({
      categoryId: segments[0],
      sourceLanguage: "en",
      name: segments[1],
      durationLabel: segments[2],
      warrantyLabel: segments[3],
      price: segments[4],
      description: segments[5],
      actor: context.actor
    });

    return { text: `Đã thêm ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/addtemp") {
    const segments = splitPipeSegments(restText);
    if (segments.length < 6) {
      throw new Error("Cách dùng: /addtemp Tên | Thời hạn | Bảo hành | Giá | Mô tả | YYYY-MM-DD");
    }

    const product = await service.createProduct({
      categoryId: "temporary",
      sourceLanguage: "en",
      name: segments[0],
      durationLabel: segments[1],
      warrantyLabel: segments[2],
      price: segments[3],
      description: segments[4],
      temporaryUntil: normalizeDateTime(segments[5], context.timezoneOffset || "+07:00"),
      actor: context.actor
    });

    return { text: `Đã thêm sản phẩm tạm ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/edit") {
    const segments = splitPipeSegments(restText);
    const productId = safeTrim(segments.shift());

    if (!productId || segments.length === 0) {
      throw new Error("Cách dùng: /edit <mã sản phẩm> | name=... | category=... | duration=... | warranty=... | price=... | desc=... | until=... | status=active|inactive");
    }

    const updates = { actor: context.actor, sourceLanguage: "en" };
    for (const segment of segments) {
      const [rawKey, ...rawValueParts] = segment.split("=");
      const key = safeTrim(rawKey).toLowerCase();
      const value = rawValueParts.join("=").trim();

      if (!key) {
        continue;
      }

      if (key === "name") {
        updates.name = value;
      } else if (key === "category") {
        updates.categoryId = value;
      } else if (key === "duration") {
        updates.durationLabel = value;
      } else if (key === "warranty") {
        updates.warrantyLabel = value;
      } else if (key === "price") {
        updates.price = value;
      } else if (["desc", "description"].includes(key)) {
        updates.description = value;
      } else if (["until", "temporary_until"].includes(key)) {
        updates.temporaryUntil = value ? normalizeDateTime(value, context.timezoneOffset || "+07:00") : "";
      } else if (key === "status") {
        updates.status = value;
      } else {
        throw new Error(`Unsupported field: ${key}`);
      }
    }

    const product = await service.updateProduct(productId, updates);
    return { text: `Đã cập nhật ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/addad") {
    const segments = splitPipeSegments(restText);
    const url = safeTrim(segments[0]);
    const title = safeTrim(segments[1]) || "Shopee";

    if (!url) {
      throw new Error("Cách dùng: /addad <link Shopee> | Tiêu đề");
    }

    const link = await service.addAdLink({
      url,
      title,
      actor: context.actor
    });

    return { text: `Đã lưu link quảng cáo Shopee ${link.id}
${link.title}
${link.url}` };
  }

  if (command === "/deletead") {
    const adLinkId = safeTrim(restText);
    if (!adLinkId) {
      throw new Error("Usage: /deletead <ad_link_id>");
    }

    const link = await service.removeAdLink(adLinkId, { actor: context.actor });
    return { text: `Đã xóa link quảng cáo Shopee ${link.id}` };
  }

  if (command === "/delete") {
    const productId = safeTrim(restText);
    if (!productId) {
      throw new Error("Cách dùng: /delete <mã sản phẩm>");
    }

    const product = await service.deleteProduct(productId, { actor: context.actor });
    return { text: `Đã xóa ${product.id} - ${product.name}` };
  }

  throw new Error(COPY.help);
}

function buildSearchResultPayload(products, timezone) {
  return {
    text: products.length
      ? [COPY.searchResults, "", ...products.map((entry) => `- ${buildProductCardLine(entry, { timezone })}`)].join("\n")
      : COPY.searchEmpty,
    replyMarkup: inlineKeyboard([
      ...products.map((entry) => [button(entry.name, `product:${entry.id}`)]),
      [button(COPY.buttons.backHome, "home")]
    ])
  };
}

function normalizeIdList(values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : String(value || "").split(","))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function resolveActor(context) {
  const user = context?.from;
  const chat = context?.chat;
  const parts = [
    user?.username ? `@${user.username}` : "",
    user?.id ? `user:${user.id}` : "",
    chat?.id ? `chat:${chat.id}` : ""
  ].filter(Boolean);
  return parts.join(" ") || "telegram";
}

function isAdminContext(context) {
  return context.adminUserIds instanceof Set && context.adminUserIds.has(String(context.userId || ""));
}

function inlineKeyboard(rows) {
  return { inline_keyboard: rows };
}

function button(text, callbackData) {
  return { text, callback_data: callbackData };
}

function splitPipeSegments(value) {
  return String(value || "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function stripBotMention(text, botUsername) {
  const username = String(botUsername || "").trim();
  if (!username) {
    return text;
  }

  return text.replace(new RegExp(`^(/\\w+)@${username}\\b`, "i"), "$1");
}

function safeTrim(value) {
  return String(value || "").trim();
}

function normalizeWebhookUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
