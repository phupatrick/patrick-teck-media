const DEFAULT_TIMEOUT_MS = 6_000;
export const SOCIAL_KEYWORD_PATTERN = /\b(announcing|announced|released|release|benchmark|paper|launch|launched|update|updated|feature|features|ra mắt|cập nhật|tính năng)\b/i;
export const REDDIT_SOURCES = ["LocalLLaMA", "MachineLearning", "technology", "ChatGPT"];
export const X_HANDLES = ["sama", "OpenAI", "karpathy", "ylecun", "AnthropicAI", "GoogleDeepMind"];
export const GITHUB_RELEASES = ["vllm-project/vllm", "ollama/ollama", "langchain-ai/langchain"];

export function isUsefulSocialSignal(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length >= 80 && SOCIAL_KEYWORD_PATTERN.test(text);
}

export function normalizeSocialSignal(input, defaults = {}) {
  const title = String(input?.title || "").replace(/\s+/g, " ").trim();
  const summary = String(input?.summary || "").replace(/\s+/g, " ").trim();
  const url = String(input?.url || "").trim();
  if (!title || !url || !/^https?:\/\//i.test(url) || !isUsefulSocialSignal(title + " " + summary)) return null;
  return { title, summary, url, published_at: input?.published_at || new Date().toISOString(), source_name: String(input?.source_name || defaults.source_name || "Social signal").trim(), source_type: String(input?.source_type || defaults.source_type || "community").trim(), trust_tier: String(input?.trust_tier || defaults.trust_tier || "community").trim(), topic_hint: String(input?.topic_hint || defaults.topic_hint || "ai").trim(), discovery_only: true };
}

export async function fetchSocialSignals({ fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, redditSources = REDDIT_SOURCES, xHandles = X_HANDLES, youtubeChannelIds = [], githubReleases = GITHUB_RELEASES } = {}) {
  const groups = await Promise.all([
    Promise.all(redditSources.map((subreddit) => fetchRedditSignals(subreddit, { fetchImpl, timeoutMs }))),
    Promise.all(xHandles.map((handle) => fetchXSignals(handle, { fetchImpl, timeoutMs }))),
    Promise.all(youtubeChannelIds.map((channelId) => fetchYouTubeSignals(channelId, { fetchImpl, timeoutMs }))),
    Promise.all(githubReleases.map((repository) => fetchGitHubReleaseSignals(repository, { fetchImpl, timeoutMs })))
  ]);
  const seen = new Set();
  return groups.flat(2).filter((signal) => signal && !seen.has(signal.url) && seen.add(signal.url));
}

export async function fetchRedditSignals(subreddit, options = {}) {
  const name = String(subreddit || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!name) return [];
  const payload = await fetchJson("https://www.reddit.com/r/" + name + "/hot.json?limit=10", options);
  return (payload?.data?.children || []).map(({ data }) => normalizeSocialSignal({
    title: data?.title, summary: data?.selftext || data?.title,
    url: data?.permalink ? "https://www.reddit.com" + data.permalink : data?.url,
    published_at: data?.created_utc ? new Date(data.created_utc * 1000).toISOString() : "",
    source_name: "Reddit r/" + name
  }, { source_type: "community", trust_tier: "community", topic_hint: "ai" })).filter(Boolean);
}

export async function fetchXSignals(handle, options = {}) {
  const safeHandle = String(handle || "").replace(/[^A-Za-z0-9_]/g, "");
  if (!safeHandle) return [];
  const xml = await fetchText("https://rsshub.app/twitter/user/" + safeHandle + "/exclude_rts_replies=1", options);
  return parseFeedEntries(xml).map((entry) => normalizeSocialSignal({ ...entry, source_name: "X @" + safeHandle }, { source_type: "official-social", trust_tier: "official", topic_hint: "ai" })).filter(Boolean);
}

export async function fetchYouTubeSignals(channelId, options = {}) {
  const safeChannelId = String(channelId || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeChannelId) return [];
  const xml = await fetchText("https://www.youtube.com/feeds/videos.xml?channel_id=" + safeChannelId, options);
  return parseFeedEntries(xml).map((entry) => normalizeSocialSignal({ ...entry, source_name: "YouTube technology channel" }, { source_type: "community", trust_tier: "community", topic_hint: "internet-business-tech" })).filter(Boolean);
}

export async function fetchGitHubReleaseSignals(repository, options = {}) {
  const safeRepository = String(repository || "").match(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)?.[0];
  if (!safeRepository) return [];
  const xml = await fetchText("https://github.com/" + safeRepository + "/releases.atom", options);
  return parseFeedEntries(xml).map((entry) => normalizeSocialSignal({ ...entry, source_name: safeRepository + " releases" }, { source_type: "official-site", trust_tier: "official", topic_hint: "ai" })).filter(Boolean);
}

async function fetchJson(url, options) {
  const text = await fetchText(url, { ...options, accept: "application/json" });
  try { return JSON.parse(text); } catch { return {}; }
}

async function fetchText(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, accept = "application/atom+xml, application/xml, text/xml" } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: accept, "User-Agent": "patrick-tech-media-openclaw/1.0" } });
    return response.ok ? response.text() : "";
  } catch { return ""; } finally { clearTimeout(timeout); }
}

function parseFeedEntries(xml) {
  const blocks = [...String(xml || "").matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map((match) => match[0]);
  return blocks.map((block) => ({ title: readTag(block, "title"), summary: readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"), url: String(block).match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || readTag(block, "link"), published_at: readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated") }));
}

function readTag(xml, tag) {
  const match = String(xml).match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "i"));
  return String(match?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
