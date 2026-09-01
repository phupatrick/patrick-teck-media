import { createDocumentStore } from "./document-store.mjs";

const INITIAL_STATE = { updated_at: "", posts: [], config: {} };

export function createSocialStore({ statePath = "data/social-posts.json", databaseUrl = process.env.DATABASE_URL || "" } = {}) {
  const store = createDocumentStore({ documentKey: "social_autopost", fallbackPath: statePath, initialValue: INITIAL_STATE, databaseUrl });
  return {
    storageMode: store.storageMode,
    async getState() { return normalizeState(await store.read()); },
    async getPosts() { return (await this.getState()).posts; },
    async getConfig() { return (await this.getState()).config; },
    async update(updater) { return normalizeState(await store.update((draft) => updater(normalizeState(draft)) || draft)); }
  };
}

function normalizeState(value) {
  return { updated_at: String(value?.updated_at || ""), posts: Array.isArray(value?.posts) ? value.posts : [], config: value?.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config : {} };
}
