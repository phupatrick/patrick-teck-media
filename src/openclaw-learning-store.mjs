import crypto from "node:crypto";
import { createDocumentStore } from "./document-store.mjs";

export const DEFAULT_OPENCLAW_LEARNING_STATE = {
  generated_at: "",
  model: {
    id: "adaptive-editorial-bandit-v1",
    cnn_enabled: false,
    reason: "CNN is not a good fit for lightweight text editorial tuning on Vercel."
  },
  feedback: [],
  profile: {
    version: 1,
    updated_at: "",
    confidence: 0,
    totalSignals: 0,
    dailyFocus: [],
    topicWeights: {},
    sourceTypeWeights: {},
    styleRules: [],
    avoidRules: [],
    lastCycleSummary: ""
  },
  cycles: []
};

const MAX_FEEDBACK = 300;
const MAX_CYCLES = 40;

export function createOpenClawLearningStore({ statePath, databaseUrl = process.env.DATABASE_URL || "" } = {}) {
  const documentStore = createDocumentStore({
    documentKey: "openclaw_learning_state",
    fallbackPath: statePath || "data/openclaw-learning-state.json",
    initialValue: DEFAULT_OPENCLAW_LEARNING_STATE,
    databaseUrl
  });

  return {
    statePath: documentStore.statePath,
    storageMode: documentStore.storageMode,
    readState: async () => normalizeLearningState(await documentStore.read()),
    writeState: async (payload) => documentStore.write(normalizeLearningState(payload)),
    async addFeedback(input = {}) {
      const now = new Date().toISOString();
      const entry = normalizeFeedback({
        id: input.id || `feedback_${crypto.randomUUID()}`,
        created_at: input.created_at || now,
        source: input.source || "telegram",
        user_id: input.userId || input.user_id || "",
        chat_id: input.chatId || input.chat_id || "",
        kind: input.kind || "",
        target_url: input.targetUrl || input.target_url || "",
        article_id: input.articleId || input.article_id || "",
        note: input.note || ""
      });

      if (!entry.kind || !entry.note) {
        throw new Error("Feedback needs a kind and note.");
      }

      return documentStore.update((draft) => {
        const normalized = normalizeLearningState(draft);
        normalized.feedback = [entry, ...normalized.feedback].slice(0, MAX_FEEDBACK);
        normalized.generated_at = now;
        return normalized;
      });
    },
    async getSummary() {
      const state = normalizeLearningState(await documentStore.read());
      return {
        generated_at: state.generated_at,
        storageMode: documentStore.storageMode,
        feedbackCount: state.feedback.length,
        model: state.model,
        profile: state.profile,
        lastCycle: state.cycles[0] || null
      };
    }
  };
}

export function normalizeLearningState(payload) {
  const normalized = payload && typeof payload === "object" ? payload : {};

  return {
    generated_at: typeof normalized.generated_at === "string" ? normalized.generated_at : "",
    model: {
      id: normalizeText(normalized.model?.id) || DEFAULT_OPENCLAW_LEARNING_STATE.model.id,
      cnn_enabled: normalized.model?.cnn_enabled === true,
      reason: normalizeText(normalized.model?.reason) || DEFAULT_OPENCLAW_LEARNING_STATE.model.reason
    },
    feedback: Array.isArray(normalized.feedback)
      ? normalized.feedback.map(normalizeFeedback).filter((entry) => entry.kind && entry.note).slice(0, MAX_FEEDBACK)
      : [],
    profile: normalizeLearningProfile(normalized.profile),
    cycles: Array.isArray(normalized.cycles)
      ? normalized.cycles.map(normalizeCycle).filter((entry) => entry.generated_at).slice(0, MAX_CYCLES)
      : []
  };
}

export function normalizeLearningProfile(profile) {
  const normalized = profile && typeof profile === "object" ? profile : {};

  return {
    version: 1,
    updated_at: typeof normalized.updated_at === "string" ? normalized.updated_at : "",
    confidence: clampNumber(normalized.confidence, 0, 1, 0),
    totalSignals: clampInteger(normalized.totalSignals, 0, 1_000_000, 0),
    dailyFocus: normalizeTextList(normalized.dailyFocus, 8),
    topicWeights: normalizeWeights(normalized.topicWeights),
    sourceTypeWeights: normalizeWeights(normalized.sourceTypeWeights),
    styleRules: normalizeTextList(normalized.styleRules, 12),
    avoidRules: normalizeTextList(normalized.avoidRules, 12),
    lastCycleSummary: normalizeText(normalized.lastCycleSummary).slice(0, 500)
  };
}

function normalizeFeedback(input = {}) {
  const kind = normalizeFeedbackKind(input.kind);

  return {
    id: normalizeText(input.id).slice(0, 80),
    created_at: normalizeText(input.created_at) || new Date().toISOString(),
    source: normalizeText(input.source).slice(0, 40) || "telegram",
    user_id: normalizeText(input.user_id).slice(0, 80),
    chat_id: normalizeText(input.chat_id).slice(0, 80),
    kind,
    target_url: normalizePublicUrl(input.target_url).slice(0, 500),
    article_id: normalizeText(input.article_id).slice(0, 160),
    note: normalizeText(input.note).slice(0, 1000)
  };
}

function normalizeCycle(input = {}) {
  return {
    generated_at: normalizeText(input.generated_at),
    totalSignals: clampInteger(input.totalSignals, 0, 1_000_000, 0),
    confidence: clampNumber(input.confidence, 0, 1, 0),
    summary: normalizeText(input.summary).slice(0, 500)
  };
}

function normalizeFeedbackKind(value) {
  const normalized = normalizeText(value).toLowerCase();
  const aliases = {
    good: "good",
    hay: "good",
    like: "good",
    useful: "good",
    tot: "good",
    bad: "bad",
    te: "bad",
    chua: "bad",
    weak: "bad",
    more: "more-depth",
    sau: "more-depth",
    depth: "more-depth",
    long: "more-depth",
    less: "less-noise",
    gon: "less-noise",
    noise: "less-noise",
    source: "source",
    nguon: "source",
    image: "image",
    anh: "image",
    tone: "tone",
    giong: "tone"
  };

  return aliases[normalized] || normalized.slice(0, 40);
}

function normalizeTextList(value, maxItems) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => normalizeText(entry).slice(0, 220))
    .filter(Boolean)
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .slice(0, maxItems);
}

function normalizeWeights(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, weight]) => [normalizeText(key), clampNumber(weight, -100, 100, 0)])
      .filter(([key]) => key)
  );
}

function normalizePublicUrl(value) {
  const candidate = normalizeText(value);
  if (!candidate) {
    return "";
  }

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }

    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
