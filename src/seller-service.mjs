import crypto from "node:crypto";
import { createSellerStore } from "./seller-store.mjs";
import { createSellerTranslator } from "./seller-translation.mjs";

const DEFAULT_TIMEZONE_OFFSET = "+07:00";
const DEFAULT_CATEGORY_ID = "general";
const TEMPORARY_CATEGORY_ID = "temporary";
const SUPPORTED_LANGUAGES = ["vi", "en", "my"];
const DEFAULT_SELLER_CURRENCY = "USD";

export function createSellerService(options = {}) {
  const store = createSellerStore({
    statePath: options.statePath || "data/seller-catalog.json",
    databaseUrl: options.databaseUrl || process.env.DATABASE_URL || ""
  });
  const translator = options.translator || createSellerTranslator(options.translation || {});
  const config = {
    timezoneOffset: safeTrim(options.timezoneOffset || process.env.SELLER_TIMEZONE_OFFSET || DEFAULT_TIMEZONE_OFFSET) || DEFAULT_TIMEZONE_OFFSET,
    currency: safeTrim(options.currency || process.env.SELLER_CURRENCY || DEFAULT_SELLER_CURRENCY) || DEFAULT_SELLER_CURRENCY
  };

  return {
    statePath: store.statePath,
    storageMode: store.storageMode,
    defaultCurrency: config.currency,
    timezoneOffset: config.timezoneOffset,
    async readState(options = {}) {
      return normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
    },
    async listCategories(options = {}) {
      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      return state.categories
        .filter((category) => !options.temporaryOnly || category.is_temporary)
        .filter((category) => options.includeTemporary || !category.is_temporary)
        .sort(sortCategories);
    },
    async getCategoryById(categoryId, options = {}) {
      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      return state.categories.find((entry) => entry.id === safeTrim(categoryId)) || null;
    },
    async listProducts(options = {}) {
      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      return filterProducts(state.products, options);
    },
    async listProductsByCategory(categoryId, options = {}) {
      const products = await this.listProducts({
        ...options,
        includeTemporary: true
      });
      return products.filter((product) => product.category_id === safeTrim(categoryId)).sort(sortProductsByDisplay);
    },
    async getProductById(productId, options = {}) {
      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      return state.products.find((entry) => entry.id === safeTrim(productId)) || null;
    },
    async searchProducts(query, options = {}) {
      const keyword = safeTrim(query).toLowerCase();
      if (!keyword) {
        return [];
      }

      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      const products = filterProducts(state.products, {
        ...options,
        includeTemporary: true
      });

      return products.filter((product) => {
        const haystack = [
          product.name,
          product.description,
          product.duration_label,
          product.warranty_label,
          product.category_name,
          ...flattenTranslationValues(product.translations)
        ].join(" ").toLowerCase();
        return haystack.includes(keyword);
      });
    },
    async createCategory(input = {}) {
      const name = safeTrim(input.name);
      const actor = safeTrim(input.actor) || "system";
      const explicitId = safeTrim(input.id);
      const isTemporary = Boolean(input.isTemporary);

      if (!name) {
        throw new Error("Category name is required.");
      }

      let created = null;
      await store.updateState((draft) => {
        const state = normalizeDraftState(draft);
        const categoryId = explicitId || slugify(name);

        if (state.categories.some((entry) => entry.id === categoryId)) {
          throw new Error("Category already exists.");
        }

        created = normalizeCategory({
          id: categoryId,
          name,
          description: safeTrim(input.description),
          sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : state.categories.length,
          is_temporary: isTemporary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: actor,
          updated_by: actor
        });

        state.categories.push(created);
        appendAudit(state, {
          action: "create_category",
          actor,
          categoryId: created.id,
          changes: {
            name: created.name,
            is_temporary: created.is_temporary
          }
        });
        return state;
      });

      return normalizeCategory(created);
    },
    async ensureDefaultCategories() {
      const existing = await this.listCategories({ includeTemporary: true });
      const existingIds = new Set(existing.map((entry) => entry.id));

      if (!existingIds.has(DEFAULT_CATEGORY_ID)) {
        await this.createCategory({
          id: DEFAULT_CATEGORY_ID,
          name: "San pham khac",
          description: "Nhom tong hop mac dinh",
          actor: "system"
        });
      }

      if (!existingIds.has(TEMPORARY_CATEGORY_ID)) {
        await this.createCategory({
          id: TEMPORARY_CATEGORY_ID,
          name: "San pham tam thoi",
          description: "San pham se tu dong bien mat khi het han",
          isTemporary: true,
          actor: "system"
        });
      }
    },
    async getUserPreference(userId) {
      const state = normalizeDraftState(await store.readState());
      return state.user_preferences.find((entry) => entry.user_id === safeTrim(userId)) || null;
    },
    async setUserLanguage(userId, language, options = {}) {
      const normalizedUserId = safeTrim(userId);
      const normalizedLanguage = resolveLanguage(language);
      const actor = safeTrim(options.actor) || "system";

      if (!normalizedUserId) {
        throw new Error("User id is required.");
      }

      let result = null;
      await store.updateState((draft) => {
        const state = normalizeDraftState(draft);
        let preference = state.user_preferences.find((entry) => entry.user_id === normalizedUserId) || null;

        if (preference) {
          preference.language = normalizedLanguage;
          preference.updated_at = new Date().toISOString();
          preference.updated_by = actor;
        } else {
          preference = {
            user_id: normalizedUserId,
            language: normalizedLanguage,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: actor
          };
          state.user_preferences.push(preference);
        }

        result = { ...preference };
        return state;
      });

      return result;
    },
    async createProduct(input = {}) {
      const actor = safeTrim(input.actor) || "system";
      const sourceLanguage = resolveSourceLanguage(input.sourceLanguage);
      const sourceFields = normalizeTextFields({
        name: input.name,
        description: input.description,
        duration_label: input.durationLabel,
        warranty_label: input.warrantyLabel
      });
      const price = normalizeMoney(input.price);
      const quantity = normalizeInteger(input.quantity, { allowZero: true, allowBlank: true });
      const temporaryUntil = normalizeDateTime(input.temporaryUntil, config.timezoneOffset);
      const availableFrom = normalizeDateTime(input.availableFrom, config.timezoneOffset);
      const categoryId = safeTrim(input.categoryId || (temporaryUntil ? TEMPORARY_CATEGORY_ID : DEFAULT_CATEGORY_ID));

      validateProductInput(sourceFields, price, quantity, availableFrom, temporaryUntil);

      const translations = buildTranslations(
        sourceLanguage,
        sourceFields,
        await translator.translateProductTexts({
          sourceLanguage,
          fields: sourceFields,
          targets: SUPPORTED_LANGUAGES.filter((entry) => entry !== sourceLanguage)
        })
      );

      let createdId = "";

      await store.updateState((draft) => {
        const state = normalizeDraftState(draft);
        if (!state.categories.some((entry) => entry.id === categoryId)) {
          throw new Error("Category not found.");
        }

        const created = normalizeProduct({
          id: makeId("prod"),
          category_id: categoryId,
          source_language: sourceLanguage,
          translations,
          price,
          currency: config.currency,
          quantity,
          available_from: availableFrom,
          temporary_until: temporaryUntil,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: actor,
          updated_by: actor,
          status: "active"
        });

        createdId = created.id;
        state.products.unshift(created);
        appendAudit(state, {
          action: "create_product",
          actor,
          productId: created.id,
          categoryId,
          changes: {
            source_language: sourceLanguage,
            name: sourceFields.name,
            price
          }
        });
        return state;
      });

      return this.getProductById(createdId, { language: sourceLanguage });
    },
    async updateProduct(productId, updates = {}) {
      const actor = safeTrim(updates.actor) || "system";
      const normalizedId = safeTrim(productId);
      let resolvedLanguage = resolveSourceLanguage(updates.sourceLanguage || "vi");

      await store.updateState(async (draft) => {
        const state = normalizeDraftState(draft);
        const product = state.products.find((entry) => entry.id === normalizedId);

        if (!product) {
          throw new Error("Product not found.");
        }

        resolvedLanguage = resolveSourceLanguage(updates.sourceLanguage || product.source_language || "vi");
        const currentFields = resolveLocalizedFields(product.translations, resolvedLanguage, product.source_language);
        const nextFields = {
          name: Object.prototype.hasOwnProperty.call(updates, "name") ? safeTrim(updates.name) : currentFields.name,
          description: Object.prototype.hasOwnProperty.call(updates, "description") ? safeTrim(updates.description) : currentFields.description,
          duration_label: Object.prototype.hasOwnProperty.call(updates, "durationLabel") ? safeTrim(updates.durationLabel) : currentFields.duration_label,
          warranty_label: Object.prototype.hasOwnProperty.call(updates, "warrantyLabel") ? safeTrim(updates.warrantyLabel) : currentFields.warranty_label
        };

        const price = Object.prototype.hasOwnProperty.call(updates, "price") ? normalizeMoney(updates.price) : product.price;
        const quantity = Object.prototype.hasOwnProperty.call(updates, "quantity")
          ? normalizeInteger(updates.quantity, { allowZero: true, allowBlank: true })
          : product.quantity;
        const availableFrom = Object.prototype.hasOwnProperty.call(updates, "availableFrom")
          ? normalizeDateTime(updates.availableFrom, config.timezoneOffset)
          : product.available_from;
        const temporaryUntil = Object.prototype.hasOwnProperty.call(updates, "temporaryUntil")
          ? normalizeDateTime(updates.temporaryUntil, config.timezoneOffset)
          : product.temporary_until;

        validateProductInput(nextFields, price, quantity, availableFrom, temporaryUntil);

        const translations = buildTranslations(
          resolvedLanguage,
          nextFields,
          await translator.translateProductTexts({
            sourceLanguage: resolvedLanguage,
            fields: nextFields,
            targets: SUPPORTED_LANGUAGES.filter((entry) => entry !== resolvedLanguage)
          })
        );

        if (Object.prototype.hasOwnProperty.call(updates, "categoryId")) {
          const categoryId = safeTrim(updates.categoryId);
          if (!state.categories.some((entry) => entry.id === categoryId)) {
            throw new Error("Category not found.");
          }
          product.category_id = categoryId;
        }

        product.source_language = resolvedLanguage;
        product.translations = translations;
        product.price = price;
        product.currency = safeTrim(product.currency) || config.currency;
        product.quantity = quantity;
        product.available_from = availableFrom;
        product.temporary_until = temporaryUntil;

        if (Object.prototype.hasOwnProperty.call(updates, "status")) {
          product.status = normalizeStoredStatus(updates.status);
        }

        product.updated_at = new Date().toISOString();
        product.updated_by = actor;

        appendAudit(state, {
          action: "update_product",
          actor,
          productId: product.id,
          categoryId: product.category_id,
          changes: {
            source_language: resolvedLanguage,
            name: nextFields.name,
            price
          }
        });

        return state;
      });

      return this.getProductById(normalizedId, { language: resolvedLanguage });
    },
    async deleteProduct(productId, options = {}) {
      const normalizedId = safeTrim(productId);
      const actor = safeTrim(options.actor) || "system";
      let removed = null;

      await store.updateState((draft) => {
        const state = normalizeDraftState(draft);
        const index = state.products.findIndex((entry) => entry.id === normalizedId);
        if (index === -1) {
          throw new Error("Product not found.");
        }

        removed = state.products[index];
        state.products.splice(index, 1);
        appendAudit(state, {
          action: "delete_product",
          actor,
          productId: removed.id,
          categoryId: removed.category_id,
          changes: {
            name: resolveLocalizedFields(removed.translations, removed.source_language, removed.source_language).name
          }
        });
        return state;
      });

      return removed ? normalizeProduct(removed) : null;
    },
    async purgeExpiredTemporaryProducts(options = {}) {
      const now = toDate(options.now);
      const actor = safeTrim(options.actor) || "system";
      let removed = [];

      await store.updateState((draft) => {
        const state = normalizeDraftState(draft);
        const nextProducts = [];

        for (const product of state.products) {
          if (isExpiredTemporary(product, now)) {
            removed.push(normalizeProduct(product));
            appendAudit(state, {
              action: "purge_temporary_product",
              actor,
              productId: product.id,
              categoryId: product.category_id,
              changes: {
                name: resolveLocalizedFields(product.translations, product.source_language, product.source_language).name
              }
            });
            continue;
          }

          nextProducts.push(product);
        }

        state.products = nextProducts;
        return state;
      });

      return removed.map((entry) => enrichProduct(entry, now, [], resolveLanguage(options.language)));
    },
    async getSummary(options = {}) {
      const state = normalizeState(await store.readState(), options.now, resolveLanguage(options.language));
      const products = state.products;

      return {
        totalCategories: state.categories.length,
        totalProducts: products.length,
        standardProducts: products.filter((entry) => !entry.is_temporary).length,
        temporaryProducts: products.filter((entry) => entry.is_temporary).length,
        active: products.filter((entry) => entry.status === "active").length,
        pending: products.filter((entry) => entry.status === "pending").length,
        soldOut: products.filter((entry) => entry.status === "sold_out").length,
        inactive: products.filter((entry) => entry.status === "inactive").length
      };
    }
  };
}

export function normalizeStoredStatus(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (!normalized) {
    return "active";
  }

  if (["active", "inactive"].includes(normalized)) {
    return normalized;
  }

  throw new Error("Status must be active or inactive.");
}

export function normalizeMoney(value) {
  const normalized = Number.parseFloat(String(value).replace(/[,_\s]/g, ""));
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.round(normalized * 100) / 100;
}

export function normalizeInteger(value, options = {}) {
  const trimmed = safeTrim(value);
  if (!trimmed && options.allowBlank) {
    return 9999;
  }

  const normalized = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(normalized)) {
    return null;
  }

  if (normalized < 0 || (normalized === 0 && !options.allowZero)) {
    return null;
  }

  return normalized;
}

export function normalizeDateTime(value, timezoneOffset = DEFAULT_TIMEZONE_OFFSET) {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00${timezoneOffset}`).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(trimmed)) {
    const normalized = trimmed.replace(" ", "T");
    return new Date(`${normalized}:00${timezoneOffset}`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date/time format.");
  }

  return parsed.toISOString();
}

export function normalizeCategory(category) {
  return {
    id: safeTrim(category?.id),
    name: safeTrim(category?.name),
    description: safeTrim(category?.description),
    sort_order: Number.isFinite(category?.sort_order) ? Number(category.sort_order) : 0,
    is_temporary: Boolean(category?.is_temporary),
    created_at: safeTrim(category?.created_at),
    updated_at: safeTrim(category?.updated_at),
    created_by: safeTrim(category?.created_by),
    updated_by: safeTrim(category?.updated_by)
  };
}

export function getComputedStatus(product, now = new Date()) {
  const normalizedProduct = normalizeProduct(product);
  const currentTime = toDate(now);

  if (normalizedProduct.status !== "active") {
    return normalizedProduct.status;
  }

  if (normalizedProduct.temporary_until) {
    const untilDate = new Date(normalizedProduct.temporary_until);
    if (!Number.isNaN(untilDate.getTime()) && untilDate < currentTime) {
      return "expired";
    }
  }

  if (normalizedProduct.available_from) {
    const fromDate = new Date(normalizedProduct.available_from);
    if (!Number.isNaN(fromDate.getTime()) && fromDate > currentTime) {
      return "pending";
    }
  }

  if (normalizedProduct.quantity <= 0) {
    return "sold_out";
  }

  return "active";
}

export function enrichProduct(product, now = new Date(), categories = [], language = "vi") {
  const normalized = normalizeProduct(product);
  const category = categories.find((entry) => entry.id === normalized.category_id) || null;
  const localized = resolveLocalizedFields(normalized.translations, resolveLanguage(language), normalized.source_language);

  return {
    ...normalized,
    ...localized,
    category_name: category?.name || "",
    is_temporary: Boolean(normalized.temporary_until || category?.is_temporary),
    status: getComputedStatus(normalized, now)
  };
}

export function buildProductCardLine(product, options = {}) {
  const parts = [
    product.name,
    product.duration_label,
    product.warranty_label,
    formatMoney(product.price, product.currency)
  ];

  if (product.is_temporary && product.temporary_until) {
    parts.push(`den ${formatDate(product.temporary_until, options.timezone || "Asia/Saigon")}`);
  }

  return parts.join(" | ");
}

export function buildProductDetailText(product, options = {}) {
  const labels = resolveDetailLabels(options.language || "vi");
  const lines = [
    `${product.name}`,
    `${labels.category}: ${product.category_name || "-"}`,
    `${labels.duration}: ${product.duration_label}`,
    `${labels.warranty}: ${product.warranty_label}`,
    `${labels.price}: ${formatMoney(product.price, product.currency)}`
  ];

  if (product.is_temporary && product.temporary_until) {
    lines.push(`${labels.until}: ${formatDate(product.temporary_until, options.timezone || "Asia/Saigon")}`);
  }

  if (product.description) {
    lines.push("");
    lines.push(product.description);
  }

  return lines.join("\n");
}

function validateProductInput(fields, price, quantity, availableFrom, temporaryUntil) {
  if (!fields.name) {
    throw new Error("Product name is required.");
  }

  if (!fields.duration_label) {
    throw new Error("Duration is required.");
  }

  if (!fields.warranty_label) {
    throw new Error("Warranty is required.");
  }

  if (price === null) {
    throw new Error("Price must be a number.");
  }

  if (quantity === null) {
    throw new Error("Quantity must be a whole number.");
  }

  if (availableFrom && temporaryUntil && availableFrom > temporaryUntil) {
    throw new Error("The available_from time must be before temporary_until.");
  }
}

function buildTranslations(sourceLanguage, sourceFields, translatedFields) {
  const translations = {};

  for (const language of SUPPORTED_LANGUAGES) {
    if (language === sourceLanguage) {
      translations[language] = normalizeTextFields(sourceFields);
      continue;
    }

    const candidate = normalizeTextFields(translatedFields?.[language] || {});
    translations[language] = {
      name: candidate.name || sourceFields.name,
      description: candidate.description || sourceFields.description,
      duration_label: candidate.duration_label || sourceFields.duration_label,
      warranty_label: candidate.warranty_label || sourceFields.warranty_label
    };
  }

  return translations;
}

function normalizeTextFields(fields) {
  return {
    name: safeTrim(fields?.name),
    description: safeTrim(fields?.description),
    duration_label: safeTrim(fields?.duration_label || fields?.durationLabel),
    warranty_label: safeTrim(fields?.warranty_label || fields?.warrantyLabel)
  };
}

function resolveLocalizedFields(translations, language, sourceLanguage) {
  const normalizedTranslations = normalizeTranslations(translations);
  return normalizedTranslations[resolveLanguage(language)]
    || normalizedTranslations[resolveLanguage(sourceLanguage)]
    || normalizeTextFields({});
}

function normalizeTranslations(translations) {
  const nextTranslations = {};

  for (const language of SUPPORTED_LANGUAGES) {
    nextTranslations[language] = normalizeTextFields(translations?.[language] || {});
  }

  return nextTranslations;
}

function normalizeProduct(product) {
  const translations = normalizeTranslations(product?.translations);
  const sourceLanguage = resolveSourceLanguage(product?.source_language || "vi");
  const sourceFields = normalizeTextFields({
    name: product?.name,
    description: product?.description || product?.note,
    duration_label: product?.duration_label || product?.duration,
    warranty_label: product?.warranty_label || product?.warranty
  });

  if (!translations[sourceLanguage].name && sourceFields.name) {
    translations[sourceLanguage] = sourceFields;
  }

  return {
    id: safeTrim(product?.id),
    category_id: safeTrim(product?.category_id) || DEFAULT_CATEGORY_ID,
    source_language: sourceLanguage,
    translations,
    name: sourceFields.name || translations[sourceLanguage].name,
    description: sourceFields.description || translations[sourceLanguage].description,
    duration_label: sourceFields.duration_label || translations[sourceLanguage].duration_label,
    warranty_label: sourceFields.warranty_label || translations[sourceLanguage].warranty_label,
    price: Number.isFinite(product?.price) ? Number(product.price) : 0,
    currency: safeTrim(product?.currency) || DEFAULT_SELLER_CURRENCY,
    quantity: Number.isInteger(product?.quantity) ? product.quantity : 9999,
    available_from: safeTrim(product?.available_from),
    temporary_until: safeTrim(product?.temporary_until),
    created_at: safeTrim(product?.created_at),
    updated_at: safeTrim(product?.updated_at),
    created_by: safeTrim(product?.created_by),
    updated_by: safeTrim(product?.updated_by),
    status: safeTrim(product?.status) || "active"
  };
}

function normalizeState(state, now = new Date(), language = "vi") {
  const normalizedState = normalizeDraftState(state);
  const currentTime = toDate(now);

  normalizedState.products = normalizedState.products
    .filter((product) => !isExpiredTemporary(product, currentTime))
    .map((product) => enrichProduct(product, currentTime, normalizedState.categories, language));

  return normalizedState;
}

function normalizeDraftState(state) {
  const categories = Array.isArray(state?.categories) ? state.categories.map(normalizeCategory) : [];
  const categoryIds = new Set(categories.map((entry) => entry.id));
  const normalizedCategories = [...categories];

  if (!categoryIds.has(DEFAULT_CATEGORY_ID)) {
    normalizedCategories.unshift(
      normalizeCategory({
        id: DEFAULT_CATEGORY_ID,
        name: "San pham khac",
        description: "Nhom tong hop mac dinh",
        sort_order: 0
      })
    );
  }

  if (!categoryIds.has(TEMPORARY_CATEGORY_ID)) {
    normalizedCategories.push(
      normalizeCategory({
        id: TEMPORARY_CATEGORY_ID,
        name: "San pham tam thoi",
        description: "San pham se tu dong bien mat khi het han",
        sort_order: 999,
        is_temporary: true
      })
    );
  }

  return {
    categories: normalizedCategories.sort(sortCategories),
    products: Array.isArray(state?.products) ? state.products.map(normalizeProduct) : [],
    user_preferences: Array.isArray(state?.user_preferences)
      ? state.user_preferences.map((entry) => ({
        user_id: safeTrim(entry?.user_id),
        language: resolveLanguage(entry?.language || "vi"),
        created_at: safeTrim(entry?.created_at),
        updated_at: safeTrim(entry?.updated_at),
        updated_by: safeTrim(entry?.updated_by)
      }))
      : [],
    audit: Array.isArray(state?.audit) ? state.audit : []
  };
}

function filterProducts(products, options = {}) {
  return products
    .filter((product) => {
      if (options.categoryId && product.category_id !== safeTrim(options.categoryId)) {
        return false;
      }

      if (!options.includeInactive && product.status === "inactive") {
        return false;
      }

      if (!options.includeTemporary && product.is_temporary) {
        return false;
      }

      if (options.temporaryOnly && !product.is_temporary) {
        return false;
      }

      return true;
    })
    .sort(sortProductsByDisplay);
}

function appendAudit(state, entry) {
  state.audit.unshift({
    id: makeId("audit"),
    action: safeTrim(entry.action),
    actor: safeTrim(entry.actor) || "system",
    product_id: safeTrim(entry.productId),
    category_id: safeTrim(entry.categoryId),
    changes: entry.changes && typeof entry.changes === "object" ? entry.changes : {},
    created_at: new Date().toISOString()
  });
  state.audit = state.audit.slice(0, 400);
}

function flattenTranslationValues(translations) {
  return SUPPORTED_LANGUAGES.flatMap((language) => {
    const fields = translations?.[language];
    return fields ? Object.values(fields).map((value) => safeTrim(value)) : [];
  });
}

function isExpiredTemporary(product, now) {
  if (!product?.temporary_until) {
    return false;
  }

  const untilDate = new Date(product.temporary_until);
  return !Number.isNaN(untilDate.getTime()) && untilDate < now;
}

function sortProductsByDisplay(left, right) {
  return left.name.localeCompare(right.name, "vi");
}

function sortCategories(left, right) {
  return left.sort_order - right.sort_order || left.name.localeCompare(right.name, "vi");
}

function resolveDetailLabels(language) {
  if (resolveLanguage(language) === "en") {
    return { category: "Category", duration: "Duration", warranty: "Warranty", price: "Price", until: "Available until" };
  }

  if (resolveLanguage(language) === "my") {
    return { category: "Category", duration: "Duration", warranty: "Warranty", price: "Price", until: "Until" };
  }

  return { category: "Danh muc", duration: "Thoi gian", warranty: "Bao hanh", price: "Gia", until: "Ton tai den" };
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

function slugify(value) {
  return safeTrim(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || makeId("cat");
}

function safeTrim(value) {
  return String(value || "").trim();
}

function resolveLanguage(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  return "vi";
}

function resolveSourceLanguage(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (["vi", "en"].includes(normalized)) {
    return normalized;
  }

  return "vi";
}

function toDate(value) {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatMoney(value, currency) {
  const resolvedCurrency = safeTrim(currency) || DEFAULT_SELLER_CURRENCY;
  const amount = Number(value || 0);

  if (resolvedCurrency === "VND") {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: resolvedCurrency,
      maximumFractionDigits: 0
    }).format(amount);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: resolvedCurrency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatDate(value, timezone) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}
