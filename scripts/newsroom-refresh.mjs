import path from "node:path";
import { normalizeArticles, publishArticles } from "./newsroom-publish.mjs";

const outputPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";
const sourceUrl = process.env.NEWSROOM_PULL_URL || process.env.OPENCLAW_NEWSROOM_URL || "";
const sourceToken = process.env.NEWSROOM_PULL_TOKEN || process.env.OPENCLAW_NEWSROOM_TOKEN || "";

if (!sourceUrl) {
  console.log("NEWSROOM_PULL_URL is not configured. Skipping refresh.");
  process.exit(0);
}

const headers = {
  Accept: "application/json",
  "User-Agent": "patrick-tech-media-refresh/1.0"
};

if (sourceToken) {
  headers.Authorization = `Bearer ${sourceToken}`;
}

try {
  const response = await fetch(sourceUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch newsroom source (${response.status} ${response.statusText})`);
  }

  const payload = await response.json();
  const incomingArticles = normalizeArticles(payload);

  if (incomingArticles.length === 0) {
    console.log("Source returned no newsroom articles. Nothing to publish.");
    process.exit(0);
  }

  const result = publishArticles({
    incomingArticles,
    outputPath
  });

  if (!result.changed) {
    console.log(`Newsroom already up to date at ${path.resolve(process.cwd(), outputPath)}`);
    process.exit(0);
  }

  console.log(`Refreshed ${result.publishedCount} article(s) into ${result.outputPath}`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
