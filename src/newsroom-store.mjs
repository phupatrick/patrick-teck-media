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
    databaseUrl
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
  return {
    generated_at: typeof payload?.generated_at === "string" ? payload.generated_at : "",
    articles: Array.isArray(payload?.articles) ? payload.articles : []
  };
}
