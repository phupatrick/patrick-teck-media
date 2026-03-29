import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStoryArtSvg,
  buildHumanSitemap,
  buildNewsroomState,
  buildJsonFeed,
  buildRobotsTxt,
  buildRssXml,
  buildSitemapXml,
  getArticleByRoute,
  getAuthorCollection,
  getDashboardData,
  getHomeData,
  getRadarData,
  getPolicyPage,
  getTopicPage,
  getArticlesForLanguage,
  getWorkflowData
} from "./src/newsroom-service.mjs";
import {
  renderArticlePage,
  renderAuthorsPage,
  renderHomePage,
  renderHumanSitemapPage,
  renderNotFoundPage,
  renderDashboardPage,
  renderPolicyPage,
  renderRadarPage,
  renderTopicPage,
  renderWorkflowPage
} from "./src/newsroom-render.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const envFromFile = loadEnvFile(path.join(__dirname, ".env"));

const config = {
  port: Number(process.env.PORT || envFromFile.PORT || 3000),
  siteUrl: process.env.SITE_URL || envFromFile.SITE_URL || "https://patricktech.media",
  storeUrl: process.env.PATRICK_TECH_STORE_URL || envFromFile.PATRICK_TECH_STORE_URL || "https://store.patricktech.media",
  adsenseClient: process.env.GOOGLE_ADSENSE_CLIENT || envFromFile.GOOGLE_ADSENSE_CLIENT || "",
  adsenseSlots: {
    hero: process.env.GOOGLE_ADSENSE_SLOT_HERO || envFromFile.GOOGLE_ADSENSE_SLOT_HERO || "",
    inline: process.env.GOOGLE_ADSENSE_SLOT_INLINE || envFromFile.GOOGLE_ADSENSE_SLOT_INLINE || "",
    mid: process.env.GOOGLE_ADSENSE_SLOT_MID || envFromFile.GOOGLE_ADSENSE_SLOT_MID || ""
  }
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const adsConfig = {
  client: config.adsenseClient,
  slots: { ...config.adsenseSlots }
};

let cachedState = buildState();
let cachedAt = Date.now();
const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const state = getState();

    if (pathname.startsWith("/api/")) {
      return handleApi(pathname, requestUrl, res, state);
    }

    if (pathname.startsWith("/media/story/") && pathname.endsWith(".svg")) {
      const clusterId = pathname.slice("/media/story/".length, -".svg".length);
      const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
      return sendText(res, 200, buildStoryArtSvg(state, clusterId, language), "image/svg+xml; charset=utf-8");
    }

    if (pathname === "/") {
      return redirect(res, "/vi/");
    }

    if (pathname === "/robots.txt") {
      return sendText(res, 200, buildRobotsTxt(state), "text/plain; charset=utf-8");
    }

    if (pathname === "/sitemap.xml") {
      return sendText(res, 200, buildSitemapXml(state), "application/xml; charset=utf-8");
    }

    if (await tryStatic(pathname, res)) {
      return;
    }

    if (req.method !== "GET") {
      return sendJson(res, 405, { error: "Method not allowed." });
    }

    const segments = pathname.split("/").filter(Boolean);
    const language = segments[0];

    if (!["vi", "en"].includes(language)) {
      return sendHtml(res, 404, renderNotFoundPage(state, "vi", adsConfig));
    }

    if (segments.length === 1) {
      return sendHtml(res, 200, renderHomePage(state, language, adsConfig));
    }

    if (segments[1] === "radar") {
      return sendHtml(res, 200, renderRadarPage(state, language, state.radar[language], adsConfig));
    }

    if (segments[1] === "workflow") {
      return sendHtml(res, 200, renderWorkflowPage(state, language, state.workflow[language], adsConfig));
    }

    if (segments[1] === "dashboard") {
      return sendHtml(res, 200, renderDashboardPage(state, language, state.dashboard[language], adsConfig));
    }

    if (segments[1] === "feed.json") {
      return sendJson(res, 200, buildJsonFeed(state, language));
    }

    if (segments[1] === "feed.xml") {
      return sendText(res, 200, buildRssXml(state, language), "application/xml; charset=utf-8");
    }

    if (segments[1] === "topics" && segments[2]) {
      const topicPage = getTopicPage(state, language, segments[2]);
      return sendHtml(
        res,
        topicPage ? 200 : 404,
        topicPage ? renderTopicPage(state, language, topicPage, adsConfig) : renderNotFoundPage(state, language, adsConfig)
      );
    }

    if (segments[1] === "authors") {
      return sendHtml(res, 200, renderAuthorsPage(state, language, getAuthorCollection(state, language), adsConfig));
    }

    if (segments[1] === "sitemap") {
      return sendHtml(res, 200, renderHumanSitemapPage(state, language, buildHumanSitemap(state, language), adsConfig));
    }

    const policyPage = getPolicyPage(state, segments[1]);
    if (policyPage && segments.length === 2) {
      return sendHtml(res, 200, renderPolicyPage(state, language, policyPage, adsConfig));
    }

    if (segments.length === 3) {
      const article = getArticleByRoute(state, language, segments[1], segments[2]);

      if (!article) {
        return sendHtml(res, 404, renderNotFoundPage(state, language, adsConfig));
      }

      const relatedStories = getArticlesForLanguage(state, language)
        .filter((story) => story.cluster_id !== article.cluster_id && story.topic === article.topic)
        .slice(0, 3);

      return sendHtml(res, 200, renderArticlePage(state, language, article, relatedStories, adsConfig));
    }

    return sendHtml(res, 404, renderNotFoundPage(state, language, adsConfig));
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(config.port, () => {
  console.log(`Patrick Tech Media is running at http://localhost:${config.port}`);
});

export { server, buildState };

function buildState() {
  const newsroom = buildNewsroomState({
    siteUrl: config.siteUrl,
    storeUrl: config.storeUrl,
    now: new Date().toISOString()
  });

  newsroom.home = {
    vi: getHomeData(newsroom, "vi"),
    en: getHomeData(newsroom, "en")
  };
  newsroom.radar = {
    vi: getRadarData(newsroom, "vi"),
    en: getRadarData(newsroom, "en")
  };
  newsroom.workflow = {
    vi: getWorkflowData(newsroom, "vi"),
    en: getWorkflowData(newsroom, "en")
  };
  newsroom.dashboard = {
    vi: getDashboardData(newsroom, "vi"),
    en: getDashboardData(newsroom, "en")
  };

  return newsroom;
}

function getState() {
  if (Date.now() - cachedAt > 30_000) {
    cachedState = buildState();
    cachedAt = Date.now();
  }

  return cachedState;
}

async function tryStatic(pathname, res) {
  const staticPath = pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicDir, staticPath));

  if (!filePath.startsWith(publicDir)) {
    return false;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "Cache-Control": "public, max-age=300",
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function handleApi(pathname, requestUrl, res, state) {
  if (pathname === "/api/newsroom/overview") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    const home = state.home[language];
    return sendJson(res, 200, {
      site: state.site,
      metrics: home.metrics,
      featured: compactArticle(home.featured),
      latest: home.latest.map(compactArticle),
      trending: home.trending.map(compactArticle)
    });
  }

  if (pathname === "/api/newsroom/articles") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(
      res,
      200,
      getArticlesForLanguage(state, language).map((article) => ({
        id: article.id,
        href: article.href,
        title: article.title,
        verification_state: article.verification_state,
        ad_eligible: article.ad_eligible,
        topic: article.topic,
        cluster_id: article.cluster_id
      }))
    );
  }

  if (pathname === "/api/newsroom/radar") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.radar[language]);
  }

  if (pathname === "/api/newsroom/dashboard") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.dashboard[language]);
  }

  if (pathname === "/api/newsroom/live") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.home[language].liveDesk);
  }

  return sendJson(res, 404, { error: "Not found." });
}

function compactArticle(article) {
  return {
    href: article.href,
    title: article.title,
    summary: article.summary,
    verification_state: article.verification_state,
    ad_eligible: article.ad_eligible,
    topic: article.topic
  };
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(html);
}

function sendText(res, statusCode, content, contentType) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType
  });
  res.end(content);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const result = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      result[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
    }

    return result;
  } catch {
    return {};
  }
}
