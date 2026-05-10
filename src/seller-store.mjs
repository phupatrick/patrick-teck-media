import { createDocumentStore } from "./document-store.mjs";

const DEFAULT_STATE = {
  categories: [],
  products: [],
  user_preferences: [],
  audit: []
};

export function createSellerStore({ statePath, databaseUrl = process.env.DATABASE_URL || "" }) {
  const documentStore = createDocumentStore({
    documentKey: "seller_catalog_state",
    fallbackPath: statePath,
    initialValue: DEFAULT_STATE,
    databaseUrl
  });

  return {
    statePath: documentStore.statePath,
    storageMode: documentStore.storageMode,
    readState: async () => normalizeState(await documentStore.read()),
    writeState: async (nextState) => documentStore.write(normalizeState(nextState)),
    async updateState(updater) {
      return documentStore.update(async (draft) => {
        const normalizedDraft = normalizeState(draft);
        const updated = (await updater(normalizedDraft)) || normalizedDraft;
        return normalizeState(updated);
      });
    }
  };
}

function normalizeState(state) {
  return {
    categories: Array.isArray(state?.categories) ? state.categories : [],
    products: Array.isArray(state?.products) ? state.products : [],
    user_preferences: Array.isArray(state?.user_preferences) ? state.user_preferences : [],
    audit: Array.isArray(state?.audit) ? state.audit : []
  };
}
