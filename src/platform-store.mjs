import { createDocumentStore } from "./document-store.mjs";

const DEFAULT_STATE = {
  users: [],
  submissions: [],
  withdrawals: [],
  articleComments: [],
  articleReactions: []
};

export function createPlatformStore({ statePath, databaseUrl = process.env.DATABASE_URL || "" }) {
  const documentStore = createDocumentStore({
    documentKey: "platform_state",
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
      return documentStore.update((draft) => {
        const normalizedDraft = normalizeState(draft);
        const updated = updater(normalizedDraft) || normalizedDraft;
        return normalizeState(updated);
      });
    }
  };
}

function normalizeState(state) {
  return {
    users: Array.isArray(state?.users) ? state.users : [],
    submissions: Array.isArray(state?.submissions) ? state.submissions : [],
    withdrawals: Array.isArray(state?.withdrawals) ? state.withdrawals : [],
    articleComments: Array.isArray(state?.articleComments) ? state.articleComments : [],
    articleReactions: Array.isArray(state?.articleReactions) ? state.articleReactions : []
  };
}
