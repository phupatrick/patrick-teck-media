import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNewsroomState } from "../src/newsroom-service.mjs";

const rootDir = process.cwd();
const contentPath = process.env.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json";

const persistedArticleFields = [
  "id",
  "cluster_id",
  "language",
  "topic",
  "topic_label",
  "topic_slug",
  "topic_accent",
  "content_type",
  "content_type_label",
  "path_segment",
  "slug",
  "title",
  "hook",
  "author_name",
  "author_role_vi",
  "author_role_en",
  "summary",
  "dek",
  "sections",
  "image",
  "verification_state",
  "quality_score",
  "ad_eligible",
  "show_editorial_label",
  "indexable",
  "store_link_mode",
  "related_store_items",
  "editorial_focus",
  "source_set",
  "author_id",
  "published_at",
  "updated_at",
  "href",
  "readiness"
];

export function repairNewsroomAudit({
  targetPath = contentPath,
  siteUrl = process.env.SITE_URL || "https://patricktechmedia.com",
  storeUrl = process.env.PATRICK_TECH_STORE_URL || "https://patricktechstore.vercel.app",
  now = new Date().toISOString(),
  strictContentHygiene = /^(1|true|yes|on)$/i.test(String(process.env.NEWSROOM_AUDIT_STRICT || ""))
} = {}) {
  const resolvedPath = path.resolve(rootDir, targetPath);
  const previousPayload = readJson(resolvedPath);
  const previousArticles = Array.isArray(previousPayload?.articles) ? previousPayload.articles : [];
  const state = buildNewsroomState({
    siteUrl,
    storeUrl,
    contentPath: resolvedPath,
    now,
    expandEditorialCopy: !strictContentHygiene
  });
  const repairedArticles = state.articles
    .map(toPersistedArticle)
    .sort(sortByDateDesc);
  const previousComparable = JSON.stringify(previousArticles.map(toPersistedArticle).sort(sortByDateDesc));
  const repairedComparable = JSON.stringify(repairedArticles);
  const changed = previousComparable !== repairedComparable;

  if (changed) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(
      resolvedPath,
      `${JSON.stringify(
        {
          generated_at: now,
          articles: repairedArticles
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  return {
    changed,
    outputPath: resolvedPath,
    before: previousArticles.length,
    after: repairedArticles.length,
    removed: Math.max(0, previousArticles.length - repairedArticles.length),
    repaired: repairedArticles.filter((article) => article.readiness?.ready !== false).length
  };
}

function toPersistedArticle(article) {
  const output = {};

  for (const field of persistedArticleFields) {
    if (article?.[field] !== undefined) {
      output[field] = article[field];
    }
  }

  return output;
}

function sortByDateDesc(left, right) {
  return new Date(right.published_at || right.updated_at || 0).getTime() - new Date(left.published_at || left.updated_at || 0).getTime();
}

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return {};
  }
}

if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  const result = repairNewsroomAudit();
  console.log(
    result.changed
      ? `Đã sửa/chuẩn hóa ${result.after} bài trong ${result.outputPath}.`
      : `Không có bài nào cần sửa trong ${result.outputPath}.`
  );
}
