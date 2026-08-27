import fs from "node:fs";
import path from "node:path";

const indexes = String(process.env.NEWSROOM_DISCOVERY_INDEX_URLS || "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const defaultIndexes = [
  "https://raw.githubusercontent.com/spians/awesome-RSS-feeds/master/recommended/with_category/Programming.opml"
];
const outputPath = process.env.NEWSROOM_DISCOVERED_SOURCE_REGISTRY || "data/newsroom-discovered-sources.json";
const limit = Math.max(20, Math.min(500, Number.parseInt(process.env.NEWSROOM_DISCOVERY_LIMIT || "200", 10) || 200));
const blockedHosts = new Set(["facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "youtube.com", "x.com", "twitter.com"]);
const feeds = new Map();

for (const indexUrl of indexes.length ? indexes : defaultIndexes) {
  try {
    const response = await fetch(indexUrl, { headers: { "User-Agent": "patrick-tech-media-source-discovery/1.0" } });
    if (!response.ok) continue;
    const xml = await response.text();
    for (const match of xml.matchAll(/<outline\b[^>]*>/gi)) {
      const tag = match[0];
      const candidate = normalizeCandidate(readAttribute(tag, "text") || readAttribute(tag, "title"), readAttribute(tag, "xmlUrl"));
      if (candidate) feeds.set(candidate.url, candidate);
    }
  } catch (error) {
    console.warn(`Source discovery index skipped: ${indexUrl} (${error.message || error})`);
  }
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  policy: "Discovered feeds are validated at runtime and remain subject to the newsroom quality gate.",
  feeds: [...feeds.values()].slice(0, limit)
};
const absolutePath = path.resolve(process.cwd(), outputPath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Discovered ${payload.feeds.length} candidate technology feeds.`);

function normalizeCandidate(name, value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (url.protocol !== "https:" || blockedHosts.has(host)) return null;
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const cleanName = decodeXml(String(name || "")).replace(/\s+/g, " ").trim();
    if (!cleanName || cleanName.length > 180) return null;
    return { name: cleanName, url: url.toString(), language: "en", region: "Global", sourceType: "press", trustTier: "specialist", topicHint: "apps-software", limit: 6, discovered: true };
  } catch {
    return null;
  }
}

function readAttribute(tag, name) {
  return tag.match(new RegExp(`${name}\\s*=\\s*[\\\"']([^\\\"']+)`, "i"))?.[1] || "";
}

function decodeXml(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
