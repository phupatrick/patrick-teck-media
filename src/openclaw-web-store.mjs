import { createDocumentStore } from "./document-store.mjs";

export const DEFAULT_OPENCLAW_WEB_STATE = {
  generated_at: "",
  manager: {
    id: "openclaw",
    autonomy: "guarded-full"
  },
  permissions: {
    content: true,
    frontpage: true,
    git: true,
    deploy_by_push: true
  },
  priorityTopics: [],
  ranking: {
    topicWeights: {},
    sourceTypeWeights: {}
  },
  frontpageCopy: {
    vi: {},
    en: {}
  }
};

export function createOpenClawWebStore({ statePath, databaseUrl = process.env.DATABASE_URL || "" }) {
  const documentStore = createDocumentStore({
    documentKey: "openclaw_web_state",
    fallbackPath: statePath,
    initialValue: DEFAULT_OPENCLAW_WEB_STATE,
    databaseUrl
  });

  return {
    statePath: documentStore.statePath,
    storageMode: documentStore.storageMode,
    readState: async () => normalizeOpenClawWebState(await documentStore.read()),
    writeState: async (payload) => documentStore.write(normalizeOpenClawWebState(payload)),
    async updateState(updater) {
      return documentStore.update((draft) => {
        const normalizedDraft = normalizeOpenClawWebState(draft);
        const updated = updater(normalizedDraft) || normalizedDraft;
        return normalizeOpenClawWebState(updated);
      });
    }
  };
}

export function normalizeOpenClawWebState(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};

  return {
    generated_at: typeof normalized.generated_at === "string" ? normalized.generated_at : "",
    manager: {
      id: normalized.manager?.id || DEFAULT_OPENCLAW_WEB_STATE.manager.id,
      autonomy: normalized.manager?.autonomy || DEFAULT_OPENCLAW_WEB_STATE.manager.autonomy
    },
    permissions: {
      content: normalized.permissions?.content !== false,
      frontpage: normalized.permissions?.frontpage !== false,
      git: normalized.permissions?.git !== false,
      deploy_by_push: normalized.permissions?.deploy_by_push !== false
    },
    priorityTopics: Array.isArray(normalized.priorityTopics)
      ? normalized.priorityTopics.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
    ranking: {
      topicWeights: normalizeWeights(normalized.ranking?.topicWeights),
      sourceTypeWeights: normalizeWeights(normalized.ranking?.sourceTypeWeights)
    },
    frontpageCopy: {
      vi: normalizeFrontpageCopy(normalized.frontpageCopy?.vi),
      en: normalizeFrontpageCopy(normalized.frontpageCopy?.en)
    }
  };
}

function normalizeWeights(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, weight]) => [String(key), Number(weight)])
      .filter(([, weight]) => Number.isFinite(weight))
  );
}

function normalizeFrontpageCopy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, copyValue]) => [String(key), String(copyValue || "").trim()])
      .filter(([, copyValue]) => copyValue)
  );
}
