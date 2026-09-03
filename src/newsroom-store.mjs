import { createDocumentStore } from "./document-store.mjs";

const DEFAULT_NEWSROOM_PAYLOAD = {
  generated_at: "",
  articles: []
};

export function createNewsroomStore({ contentPath, databaseUrl = process.env.DATABASE_URL || "" }) {
  const documentStore = createDocumentStore({
    documentKey: "newsroom_content",
    fallbackPath: contentPath,
    initialValue: DEFAULT_NEWSROOM_PAYLOAD,
    databaseUrl,
    // GitHub deployments carry a newer generated snapshot than a stale
    // database row when the refresh job has already pushed its commit.
    preferNewerFile: true
  });

  return {
    contentPath: documentStore.statePath,
    storageMode: documentStore.storageMode,
    readPayload: async () => normalizeNewsroomPayload(await documentStore.read()),
    writePayload: async (payload) => documentStore.write(normalizeNewsroomPayload(payload)),
    async updatePayload(updater) {
      return documentStore.update((draft) => {
        const normalizedDraft = normalizeNewsroomPayload(draft);
        const updated = updater(normalizedDraft) || normalizedDraft;
        return normalizeNewsroomPayload(updated);
      });
    }
  };
}

export function normalizeNewsroomPayload(payload) {
  const articles = Array.isArray(payload?.articles) ? payload.articles.map(normalizeUnifiedArticle) : [];
  const byCluster = new Map();
  for (const article of articles) {
    const key = article.cluster_id || article.id;
    if (!key) continue;
    const current = byCluster.get(key) || {};
    byCluster.set(key, {
      title_vi: current.title_vi || article.title_vi,
      title_en: current.title_en || article.title_en,
      dek_vi: current.dek_vi || article.dek_vi,
      dek_en: current.dek_en || article.dek_en,
      body_vi: current.body_vi || article.body_vi,
      body_en: current.body_en || article.body_en,
      slug_vi: current.slug_vi || article.slug_vi,
      slug_en: current.slug_en || article.slug_en
    });
  }
  return {
    generated_at: typeof payload?.generated_at === "string" ? payload.generated_at : "",
    articles: articles.map((article) => ({ ...article, ...(byCluster.get(article.cluster_id || article.id) || {}) }))
  };
}

const UNIFIED_CATEGORIES = new Set(["ai", "software", "devices", "chips", "security", "gaming", "social"]);

export function normalizeUnifiedArticle(raw = {}) {
  const article = raw && typeof raw === "object" ? raw : {};
  const language = article.language === "en" ? "en" : "vi";
  const sourceSet = Array.isArray(article.source_set) ? article.source_set : [];
  const category = normalizeCategory(article.category || article.topic);
  const sourceUrls = Array.isArray(article.source_urls)
    ? article.source_urls.filter(Boolean)
    : sourceSet.map((source) => source?.source_url).filter(Boolean);
  const imageUrl = article.image_url || article.source_image || article.image?.src || sourceSet.map((source) => source?.image_url).find(Boolean) || "";
  const publishedAt = article.published_at || new Date().toISOString();
  const base = {
    id: article.id || `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title_vi: article.title_vi || (language === "vi" ? article.title : "") || "",
    title_en: article.title_en || (language === "en" ? article.title : "") || "",
    dek_vi: article.dek_vi || (language === "vi" ? article.dek || "" : ""),
    dek_en: article.dek_en || (language === "en" ? article.dek || "" : ""),
    body_vi: article.body_vi || (language === "vi" ? article.body || sectionsToBody(article.sections) : ""),
    body_en: article.body_en || (language === "en" ? article.body || sectionsToBody(article.sections) : ""),
    slug_vi: article.slug_vi || (language === "vi" ? article.slug : article.slug || ""),
    slug_en: article.slug_en || (language === "en" ? article.slug : article.slug || ""),
    category,
    geo_scope: article.geo_scope || inferGeoScope(article, sourceSet),
    hot_score: Number.isFinite(Number(article.hot_score)) ? Number(article.hot_score) : 50,
    source_urls: [...new Set(sourceUrls)],
    image_url: imageUrl,
    published_at: publishedAt
  };

  return { ...article, ...base };
}

function sectionsToBody(sections) {
  return Array.isArray(sections)
    ? sections.map((section) => [section?.heading, section?.body].filter(Boolean).join("\n")).filter(Boolean).join("\n\n")
    : "";
}

function normalizeCategory(value) {
  const key = String(value || "").trim().toLowerCase();
  const aliases = {
    "apps-software": "software", app: "software", apps: "software", software: "software",
    devices: "devices", device: "devices", hardware: "devices",
    "chips-ai-infra": "chips", chips: "chips", infrastructure: "chips", "cloud-enterprise": "chips",
    security: "security", gaming: "gaming", game: "gaming", social: "social",
    "social-creator": "social", "internet-business-tech": "social", internet: "social", ai: "ai"
  };
  return UNIFIED_CATEGORIES.has(key) ? key : aliases[key] || "ai";
}

function inferGeoScope(article, sourceSet) {
  const values = [article.region, article.language, ...sourceSet.flatMap((source) => [source?.region, source?.language])]
    .filter(Boolean).map((value) => String(value).toLowerCase());
  return values.some((value) => value === "vn" || value.includes("vietnam") || value === "vi") ? "vn" : "global";
}
