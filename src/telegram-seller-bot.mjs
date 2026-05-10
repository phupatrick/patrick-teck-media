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
  welcome: "Seller bot is ready. Pick a category, browse temporary products, or search the catalog.",
  viewerHint: "Everyone in the allowed group can browse and search. Only admins can add, edit, or delete products.",
  adminHint: "Admins can use /addcat, /add, /addtemp, /edit, and /delete.",
  buttons: {
    browse: "Categories",
    temporary: "Temporary items",
    search: "Search",
    backHome: "Back to menu",
    backCategories: "Back to categories"
  },
  categoriesTitle: "Product categories",
  temporaryTitle: "Temporary products",
  noCategories: "No categories yet.",
  noProducts: "This category has no products yet.",
  searchPrompt: "Send a product name, keyword, or bundle you want to find.",
  searchEmpty: "No matching products found.",
  searchResults: "Search results",
  onlyAdmin: "Only admins can modify the catalog.",
  notAllowed: "This group is not allowed to use this bot.",
  help: [
    "Main commands:",
    "/heybot - open the catalog menu",
    "/find <keyword> - search products",
    "",
    "Admin commands:",
    "/addcat Category name",
    "/add <category_id> | Name | Duration | Warranty | Price | Description",
    "/addtemp Name | Duration | Warranty | Price | Description | YYYY-MM-DD",
    "/edit <product_id> | name=... | category=... | duration=... | warranty=... | price=... | desc=... | until=... | status=active|inactive",
    "/delete <product_id>",
    "/summary"
  ].join("\n"),
  summary: "Catalog summary",
  summaryLines: (summary) => [
    `Categories: ${summary.totalCategories}`,
    `Total products: ${summary.totalProducts}`,
    `Standard: ${summary.standardProducts}`,
    `Temporary: ${summary.temporaryProducts}`,
    `Visible: ${summary.active}`,
    `Pending: ${summary.pending}`,
    `Sold out: ${summary.soldOut}`,
    `Hidden: ${summary.inactive}`
  ]
};

export function createTelegramSellerBot(options = {}) {
  const token = String(options.token || "").trim();
  const service = options.service || createSellerService(options.serviceOptions || {});
  const pollingTimeoutSeconds = Math.max(1, Number(options.pollingTimeoutSeconds || 20));
  const allowedChatIds = new Set(normalizeIdList(options.allowedChatIds || []));
  const adminUserIds = new Set(normalizeIdList(options.adminUserIds || options.allowedUserIds || []));
  const timezone = String(options.timezone || "Asia/Saigon").trim() || "Asia/Saigon";
  const timezoneOffset = String(options.timezoneOffset || service.timezoneOffset || "+07:00").trim() || "+07:00";
  const waitingSearch = new Map();

  let running = false;
  let offset = Number.isInteger(options.offset) ? options.offset : 0;
  let loopPromise = null;
  let botProfile = null;

  return {
    service,
    async initialize() {
      if (!token) {
        return false;
      }

      if (botProfile) {
        return true;
      }

      await service.ensureDefaultCategories();
      try {
        botProfile = await apiCall(token, "getMe", {});
      } catch (error) {
        throw error;
      }

      try {
        await apiCall(token, "setMyCommands", {
          commands: [
            { command: "heybot", description: "Open seller catalog menu" },
            { command: "find", description: "Search products" },
            { command: "help", description: "View help" }
          ]
        });
      } catch {
        // Optional.
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
    const categories = await service.listCategories({ includeTemporary: false, language: LANGUAGE });
    return {
      text: categories.length
        ? [COPY.categoriesTitle, "", ...categories.map((entry) => `- ${entry.name}`)].join("\n")
        : COPY.noCategories,
      replyMarkup: inlineKeyboard([
        ...categories.map((entry) => [button(entry.name, `cat:${entry.id}`)]),
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
      context.timezone || "Asia/Saigon"
    );
  }

  if (command === "/summary") {
    const summary = await service.getSummary({ now: context.now, language: LANGUAGE });
    return {
      text: [COPY.summary, "", ...COPY.summaryLines(summary)].join("\n")
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
      throw new Error("Usage: /add <category_id> | Name | Duration | Warranty | Price | Description");
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

    return { text: `Added ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/addtemp") {
    const segments = splitPipeSegments(restText);
    if (segments.length < 6) {
      throw new Error("Usage: /addtemp Name | Duration | Warranty | Price | Description | YYYY-MM-DD");
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

    return { text: `Added temporary ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/edit") {
    const segments = splitPipeSegments(restText);
    const productId = safeTrim(segments.shift());

    if (!productId || segments.length === 0) {
      throw new Error("Usage: /edit <product_id> | name=... | category=... | duration=... | warranty=... | price=... | desc=... | until=... | status=active|inactive");
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
    return { text: `Updated ${product.id}\n${buildProductDetailText(product, { timezone: context.timezone, language: LANGUAGE })}` };
  }

  if (command === "/delete") {
    const productId = safeTrim(restText);
    if (!productId) {
      throw new Error("Usage: /delete <product_id>");
    }

    const product = await service.deleteProduct(productId, { actor: context.actor });
    return { text: `Deleted ${product.id} - ${product.name}` };
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
