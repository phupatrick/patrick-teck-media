import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStoryArtSvg,
  buildHumanSitemap,
  buildNewsSitemapXml,
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
  getWorkflowData,
  loadNewsroomState
} from "./src/newsroom-service.mjs";
import {
  buildGoogleAuthUrl,
  clearGoogleStateCookie,
  createCsrfToken,
  clearSessionCookie,
  createGoogleStateValue,
  exchangeGoogleCode,
  parseCookies,
  readGoogleState,
  readSessionUserId,
  setGoogleStateCookie,
  setSessionCookie,
  verifyCsrfToken
} from "./src/platform-auth.mjs";
import { renderAdminPage, renderAuthPage, renderPortalPage } from "./src/platform-render.mjs";
import { createPlatformService } from "./src/platform-service.mjs";
import {
  renderArticlePage,
  renderAuthorsPage,
  renderStorePage,
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
const DEFAULT_SESSION_SECRET = "patrick-tech-media-dev-secret";
const rawSiteUrl = process.env.SITE_URL || envFromFile.SITE_URL || "https://patricktechmedia.com";
const sessionSecretResolution = resolveSessionSecret(process.env.SESSION_SECRET || envFromFile.SESSION_SECRET || "", rawSiteUrl);

const config = {
  port: Number(process.env.PORT || envFromFile.PORT || 3000),
  siteUrl: rawSiteUrl,
  storeUrl: process.env.PATRICK_TECH_STORE_URL || envFromFile.PATRICK_TECH_STORE_URL || "https://patricktechstore.vercel.app",
  databaseUrl: process.env.DATABASE_URL || envFromFile.DATABASE_URL || "",
  contentPath: process.env.NEWSROOM_CONTENT_PATH || envFromFile.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
  webStatePath: process.env.OPENCLAW_WEB_STATE_PATH || envFromFile.OPENCLAW_WEB_STATE_PATH || "data/openclaw-web-state.json",
  platformStatePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
  sessionSecret: sessionSecretResolution.value,
  googleClientId: process.env.GOOGLE_CLIENT_ID || envFromFile.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || envFromFile.GOOGLE_CLIENT_SECRET || "",
  adminEmails: (process.env.ADMIN_GOOGLE_EMAILS || envFromFile.ADMIN_GOOGLE_EMAILS || "").split(",").map((value) => value.trim()).filter(Boolean),
  adsenseClient: process.env.GOOGLE_ADSENSE_CLIENT || envFromFile.GOOGLE_ADSENSE_CLIENT || "",
  adsenseSlots: {
    hero: process.env.GOOGLE_ADSENSE_SLOT_HERO || envFromFile.GOOGLE_ADSENSE_SLOT_HERO || "",
    inline: process.env.GOOGLE_ADSENSE_SLOT_INLINE || envFromFile.GOOGLE_ADSENSE_SLOT_INLINE || "",
    mid: process.env.GOOGLE_ADSENSE_SLOT_MID || envFromFile.GOOGLE_ADSENSE_SLOT_MID || ""
  }
};
const rateLimitBuckets = new Map();
const RATE_LIMIT_RULES = {
  "/auth/register": { windowMs: 15 * 60 * 1000, max: 5, messages: { vi: "Bạn thao tác đăng ký quá nhanh. Vui lòng thử lại sau vài phút.", en: "You are registering too quickly. Please try again in a few minutes." } },
  "/auth/login": { windowMs: 10 * 60 * 1000, max: 8, messages: { vi: "Bạn đăng nhập quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau.", en: "Too many sign-in attempts in a short period. Please try again later." } },
  "/auth/logout": { windowMs: 5 * 60 * 1000, max: 20, messages: { vi: "Bạn thao tác quá nhanh. Vui lòng thử lại sau.", en: "You are acting too quickly. Please try again later." } },
  "/article/reactions": { windowMs: 10 * 60 * 1000, max: 40, messages: { vi: "Bạn đang thả cảm xúc quá nhanh. Vui lòng chờ một chút rồi thử lại.", en: "You are reacting too quickly. Please wait a moment and try again." } },
  "/article/comments": { windowMs: 10 * 60 * 1000, max: 8, messages: { vi: "Bạn gửi bình luận quá nhanh. Vui lòng chờ một chút rồi thử lại.", en: "You are commenting too quickly. Please wait a moment and try again." } },
  "/portal/submissions": { windowMs: 30 * 60 * 1000, max: 8, messages: { vi: "Bạn gửi bài quá nhanh. Vui lòng rà lại nội dung và thử lại sau.", en: "You are submitting too quickly. Please review your story and try again later." } },
  "/portal/withdrawals": { windowMs: 30 * 60 * 1000, max: 5, messages: { vi: "Bạn gửi yêu cầu rút tiền quá nhanh. Vui lòng thử lại sau.", en: "You are requesting withdrawals too quickly. Please try again later." } },
  "/admin/review": { windowMs: 10 * 60 * 1000, max: 80, messages: { vi: "Bàn duyệt đang nhận quá nhiều thao tác. Vui lòng chờ một chút.", en: "The review desk is receiving too many actions. Please wait a moment." } },
  "/admin/revenue": { windowMs: 10 * 60 * 1000, max: 60, messages: { vi: "Bạn đang cập nhật doanh thu quá nhanh. Vui lòng thử lại sau.", en: "Revenue updates are happening too quickly. Please try again later." } },
  "/admin/withdrawals": { windowMs: 10 * 60 * 1000, max: 60, messages: { vi: "Bạn đang cập nhật trạng thái rút tiền quá nhanh. Vui lòng thử lại sau.", en: "Withdrawal status changes are happening too quickly. Please try again later." } }
};

const trafficGuardBuckets = new Map();
const KNOWN_FORM_ROUTES = new Set(Object.keys(RATE_LIMIT_RULES));
const ALLOWED_REQUEST_METHODS = new Set(["GET", "POST", "OPTIONS"]);
const MAX_REQUEST_URL_LENGTH = 4096;
const MAX_QUERY_STRING_LENGTH = 2048;
const MAX_QUERY_PARAMETER_COUNT = 32;
const PUBLIC_PAGE_CACHE_CONTROL = "public, max-age=0, s-maxage=120, stale-while-revalidate=600";
const PUBLIC_API_CACHE_CONTROL = "public, max-age=15, s-maxage=30, stale-while-revalidate=120";
const LIVE_API_CACHE_CONTROL = "public, max-age=10, s-maxage=15, stale-while-revalidate=45";
const STATIC_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const STATIC_ASSET_FALLBACK_CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";
const SITE_MAP_CACHE_CONTROL = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
const STORY_ART_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const TRAFFIC_GUARD_RULES = [
  {
    id: "auth-edge",
    matches: (pathname) => pathname === "/auth/google/start" || pathname === "/auth/google/callback",
    windowMs: 60 * 1000,
    max: 18,
    messages: {
      vi: "Luu luong dang nhap dang tang qua nhanh. He thong tam chan de bao ve phien truy cap.",
      en: "Sign-in traffic is arriving too quickly. Access is temporarily limited to protect the session flow."
    }
  },
  {
    id: "live-api",
    matches: (pathname) => pathname === "/api/newsroom/live",
    windowMs: 60 * 1000,
    max: 60,
    messages: {
      vi: "Nguon live update dang bi goi qua day. Vui long thu lai sau it giay.",
      en: "The live update feed is being requested too aggressively. Please retry in a few seconds."
    }
  },
  {
    id: "newsroom-api",
    matches: (pathname) => pathname.startsWith("/api/newsroom/"),
    windowMs: 60 * 1000,
    max: 90,
    messages: {
      vi: "API newsroom dang nhan qua nhieu yeu cau. He thong dang ha tai tam thoi.",
      en: "The newsroom API is receiving too many requests. The service is shedding load temporarily."
    }
  },
  {
    id: "remote-image",
    matches: (pathname) => pathname === "/media/source",
    windowMs: 60 * 1000,
    max: 24,
    messages: {
      vi: "Proxy anh dang bi goi qua nhanh. Vui long thu lai sau.",
      en: "The image proxy is being requested too quickly. Please try again later."
    }
  },
  {
    id: "story-art",
    matches: (pathname) => pathname.startsWith("/media/story/") && pathname.endsWith(".svg"),
    windowMs: 60 * 1000,
    max: 90,
    messages: {
      vi: "Tai nguyen minh hoa dang bi goi qua day. Vui long cho mot chut.",
      en: "Illustration assets are being requested too aggressively. Please wait a moment."
    }
  },
  {
    id: "public-page",
    matches: (pathname) =>
      pathname === "/"
      || pathname === "/store"
      || pathname === "/robots.txt"
      || pathname === "/sitemap.xml"
      || pathname === "/sitemap-news.xml"
      || /^\/(vi|en)(?:\/.*)?$/.test(pathname),
    windowMs: 60 * 1000,
    max: 180,
    messages: {
      vi: "Luu luong truy cap dang tang dot bien. He thong tam gioi han nhip tai trang de giu site on dinh.",
      en: "Traffic is spiking unusually fast. The site is temporarily throttling page loads to stay stable."
    }
  }
];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};
const REMOTE_IMAGE_TIMEOUT_MS = 9000;
const REMOTE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const REMOTE_IMAGE_CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=86400";

const adsConfig = {
  client: config.adsenseClient,
  slots: { ...config.adsenseSlots }
};
const platformService = createPlatformService({
  statePath: config.platformStatePath,
  databaseUrl: config.databaseUrl,
  newsroomContentPath: config.contentPath,
  siteUrl: config.siteUrl,
  googleClientId: config.googleClientId,
  googleClientSecret: config.googleClientSecret,
  adminEmails: config.adminEmails
});

const stateCache = new Map();
const stateTimestamps = new Map();
const refreshPromises = new Map();
const server = createServer(handleRequest);
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;

if (sessionSecretResolution.warning) {
  console.warn(sessionSecretResolution.warning);
}

async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const method = normalizeMethod(req.method);

    if (method === "OPTIONS") {
      return sendEmpty(res, 204, {
        Allow: "GET, POST, OPTIONS",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With"
      });
    }

    if (!ALLOWED_REQUEST_METHODS.has(method)) {
      return sendMethodNotAllowed(res, "GET, POST, OPTIONS");
    }

    const invalidRequest = validateIncomingRequest(req, requestUrl);
    if (invalidRequest) {
      return sendJson(res, invalidRequest.statusCode, { error: invalidRequest.message });
    }

    if (await tryStatic(pathname, requestUrl, res)) {
      return;
    }

    if (method === "POST" && !KNOWN_FORM_ROUTES.has(pathname)) {
      return sendJson(res, 404, { error: "Not found." });
    }

    const trafficGuardDecision = enforceTrafficGuard(req, pathname, requestUrl);
    if (trafficGuardDecision) {
      return sendRateLimitResponse(res, pathname, trafficGuardDecision);
    }

    if (pathname === "/") {
      return redirect(res, "/vi/");
    }

    if (pathname === "/store") {
      return redirect(res, "/vi/store");
    }

    if (pathname === "/auth/google/start" || pathname === "/auth/google/callback") {
      const cookies = parseCookies(req.headers.cookie || "");
      return handleAuthRoute(req, res, requestUrl, pathname, null, cookies);
    }

    if (method === "POST") {
      const viewer = await platformService.getUserById(readSessionUserId(req, config.sessionSecret));
      return handleFormRoute(req, res, requestUrl, pathname, viewer);
    }

    const publicSiteUrl = resolvePublicSiteUrl(req);

    if (pathname.startsWith("/api/")) {
      const state = await getState(publicSiteUrl);
      return handleApi(pathname, requestUrl, res, state);
    }

    if (pathname.startsWith("/media/story/") && pathname.endsWith(".svg")) {
      const state = await getState(publicSiteUrl);
      const clusterId = pathname.slice("/media/story/".length, -".svg".length);
      const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
      return sendText(
        res,
        200,
        buildStoryArtSvg(state, clusterId, language),
        "image/svg+xml; charset=utf-8",
        { cacheControl: STORY_ART_CACHE_CONTROL }
      );
    }

    if (pathname === "/media/source") {
      const state = await getState(publicSiteUrl);
      return handleRemoteStoryImage(requestUrl, res, state);
    }

    if (pathname === "/robots.txt") {
      const state = await getState(publicSiteUrl);
      return sendText(res, 200, buildRobotsTxt(state), "text/plain; charset=utf-8", { cacheControl: SITE_MAP_CACHE_CONTROL });
    }

    if (pathname === "/sitemap.xml") {
      const state = await getState(publicSiteUrl);
      return sendText(res, 200, buildSitemapXml(state), "application/xml; charset=utf-8", { cacheControl: SITE_MAP_CACHE_CONTROL });
    }

    if (pathname === "/sitemap-news.xml") {
      const state = await getState(publicSiteUrl);
      return sendText(res, 200, buildNewsSitemapXml(state), "application/xml; charset=utf-8", { cacheControl: SITE_MAP_CACHE_CONTROL });
    }

    const state = await getState(publicSiteUrl);

    const segments = pathname.split("/").filter(Boolean);
    const language = segments[0];
    let viewerPromise = null;
    const loadViewer = async () => {
      if (!viewerPromise) {
        viewerPromise = platformService.getUserById(readSessionUserId(req, config.sessionSecret));
      }

      return viewerPromise;
    };
    const publicPageOptions = {
      cacheControl: resolvePublicPageCacheControl(requestUrl)
    };

    if (!["vi", "en"].includes(language)) {
      return sendHtml(res, 404, renderNotFoundPage(state, "vi", adsConfig));
    }

    if (segments.length === 1) {
      return sendHtml(res, 200, renderHomePage(state, language, adsConfig), publicPageOptions);
    }

    if (segments[1] === "login") {
      return sendHtml(
        res,
        200,
        renderAuthPage(state, language, {
          notice: requestUrl.searchParams.get("notice") || requestUrl.searchParams.get("error") || "",
          activeTab: requestUrl.searchParams.get("tab") === "register" ? "register" : "login",
          csrf: buildCsrfTokens()
        })
      );
    }

    if (segments[1] === "portal") {
      const viewer = await loadViewer();

      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập để mở writer portal." : "Please sign in to open the writer portal.")}`);
      }

      const portal = await platformService.getPortalData(viewer.id, language);
      return sendHtml(
        res,
        200,
        renderPortalPage(state, language, portal, {
          notice: requestUrl.searchParams.get("notice") || "",
          csrf: buildCsrfTokens(viewer)
        })
      );
    }

    if (segments[1] === "admin") {
      const viewer = await loadViewer();

      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chỉ admin mới truy cập được bàn duyệt." : "Only admins can access the review desk.")}`);
      }

      return sendHtml(
        res,
        200,
        renderAdminPage(state, language, await platformService.getAdminDashboard(language), {
          notice: requestUrl.searchParams.get("notice") || "",
          csrf: buildCsrfTokens(viewer)
        })
      );
    }

    if (segments[1] === "radar") {
      return sendHtml(res, 200, renderRadarPage(state, language, state.radar[language], adsConfig), publicPageOptions);
    }

    if (segments[1] === "workflow") {
      return sendHtml(res, 200, renderWorkflowPage(state, language, state.workflow[language], adsConfig), publicPageOptions);
    }

    if (segments[1] === "dashboard") {
      return sendHtml(res, 200, renderDashboardPage(state, language, state.dashboard[language], adsConfig), publicPageOptions);
    }

    if (segments[1] === "feed.json" || segments[1] === "feed.xml") {
      const feedEnabled = process.env.PUBLIC_FEED_ENABLED === "true";
      const feedToken = process.env.PUBLIC_FEED_TOKEN || "";
      const suppliedToken = requestUrl.searchParams.get("token") || "";
      const isAllowed = feedEnabled && feedToken && suppliedToken === feedToken;

      if (!isAllowed) {
        return sendHtml(res, 404, renderNotFoundPage(state, language, adsConfig));
      }

      if (segments[1] === "feed.json") {
        return sendJson(res, 200, buildJsonFeed(state, language));
      }

      return sendText(res, 200, buildRssXml(state, language), "application/xml; charset=utf-8");
    }

    if (segments[1] === "store") {
      return sendHtml(res, 200, renderStorePage(state, language, adsConfig), publicPageOptions);
    }

    if (segments[1] === "topics" && segments[2]) {
      const topicPage = getTopicPage(state, language, segments[2]);
      return sendHtml(
        res,
        topicPage ? 200 : 404,
        topicPage ? renderTopicPage(state, language, topicPage, adsConfig) : renderNotFoundPage(state, language, adsConfig),
        topicPage ? publicPageOptions : undefined
      );
    }

    if (segments[1] === "authors") {
      return sendHtml(res, 200, renderAuthorsPage(state, language, getAuthorCollection(state, language), adsConfig), publicPageOptions);
    }

    if (segments[1] === "sitemap") {
      return sendHtml(res, 200, renderHumanSitemapPage(state, language, buildHumanSitemap(state, language), adsConfig), publicPageOptions);
    }

    const policyPage = getPolicyPage(state, segments[1]);
    if (policyPage && segments.length === 2) {
      return sendHtml(res, 200, renderPolicyPage(state, language, policyPage, adsConfig), publicPageOptions);
    }

    if (segments.length === 3) {
      const article = getArticleByRoute(state, language, segments[1], segments[2]);

      if (!article) {
        return sendHtml(res, 404, renderNotFoundPage(state, language, adsConfig));
      }

      const relatedStories = getArticlesForLanguage(state, language)
        .filter((story) => story.cluster_id !== article.cluster_id && story.topic === article.topic)
        .slice(0, 3);
      const feedback = await platformService.getArticleFeedback({
        articleId: article.id,
        href: article.href,
        language
      });
      const viewer = await loadViewer();

      return sendHtml(
        res,
        200,
        renderArticlePage(state, language, article, relatedStories, adsConfig, {
          feedback,
          viewer,
          notice: requestUrl.searchParams.get("notice") || "",
          error: requestUrl.searchParams.get("error") || "",
          csrf: buildCsrfTokens(viewer)
        })
      );
    }

    return sendHtml(res, 404, renderNotFoundPage(state, language, adsConfig));
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
}

if (isDirectExecution()) {
  server.listen(config.port, () => {
    console.log(`Patrick Tech Media is running at http://localhost:${config.port}`);
  });
}

export { server, buildState, handleRequest };

async function buildState(siteUrl = config.siteUrl) {
  const communityArticles = await platformService.listPublishedArticles();
  const newsroom = await loadNewsroomState({
    siteUrl,
    storeUrl: config.storeUrl,
    databaseUrl: config.databaseUrl,
    contentPath: config.contentPath,
    webStatePath: config.webStatePath,
    injectedArticles: communityArticles,
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

async function getState(siteUrl = config.siteUrl) {
  const cacheKey = normalizeSiteUrl(siteUrl);
  const cachedAt = stateTimestamps.get(cacheKey) || 0;

  if (!stateCache.has(cacheKey) || Date.now() - cachedAt > 30_000) {
    await refreshState(cacheKey);
  }

  return stateCache.get(cacheKey);
}

async function refreshState(siteUrl = config.siteUrl) {
  const cacheKey = normalizeSiteUrl(siteUrl);

  if (!refreshPromises.has(cacheKey)) {
    refreshPromises.set(
      cacheKey,
      (async () => {
        stateCache.set(cacheKey, await buildState(cacheKey));
        stateTimestamps.set(cacheKey, Date.now());
      })().finally(() => {
        refreshPromises.delete(cacheKey);
      })
    );
  }

  await refreshPromises.get(cacheKey);
}

stateCache.set(normalizeSiteUrl(config.siteUrl), await buildState(config.siteUrl));
stateTimestamps.set(normalizeSiteUrl(config.siteUrl), Date.now());

function isDirectExecution() {
  return path.resolve(process.argv[1] || "") === __filename;
}

function buildCsrfTokens(viewer = null) {
  const userId = viewer?.id || null;

  return {
    login: createCsrfToken("/auth/login", config.sessionSecret, null),
    register: createCsrfToken("/auth/register", config.sessionSecret, null),
    logout: createCsrfToken("/auth/logout", config.sessionSecret, userId),
    articleReactions: createCsrfToken("/article/reactions", config.sessionSecret, userId),
    articleComments: createCsrfToken("/article/comments", config.sessionSecret, userId),
    portalSubmissions: createCsrfToken("/portal/submissions", config.sessionSecret, userId),
    portalWithdrawals: createCsrfToken("/portal/withdrawals", config.sessionSecret, userId),
    adminReview: createCsrfToken("/admin/review", config.sessionSecret, userId),
    adminRevenue: createCsrfToken("/admin/revenue", config.sessionSecret, userId),
    adminWithdrawals: createCsrfToken("/admin/withdrawals", config.sessionSecret, userId)
  };
}

function normalizeMethod(value) {
  return String(value || "GET").trim().toUpperCase();
}

function validateIncomingRequest(req, requestUrl) {
  const rawUrl = String(req.url || "");

  if (rawUrl.length > MAX_REQUEST_URL_LENGTH) {
    return { statusCode: 414, message: "Request URL is too long." };
  }

  if (requestUrl.search.length > MAX_QUERY_STRING_LENGTH) {
    return { statusCode: 414, message: "Query string is too long." };
  }

  let queryParameterCount = 0;
  for (const _entry of requestUrl.searchParams) {
    queryParameterCount += 1;
    if (queryParameterCount > MAX_QUERY_PARAMETER_COUNT) {
      return { statusCode: 400, message: "Too many query parameters." };
    }
  }

  return null;
}

function enforceTrafficGuard(req, pathname, requestUrl) {
  const rule = TRAFFIC_GUARD_RULES.find((entry) => entry.matches(pathname, requestUrl));

  if (!rule) {
    return null;
  }

  const now = Date.now();
  const actor = `ip:${getClientAddress(req)}`;
  const key = `${rule.id}:${actor}`;
  const existing = trafficGuardBuckets.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + rule.windowMs
        };

  entry.count += 1;
  trafficGuardBuckets.set(key, entry);
  pruneTrafficGuardBuckets(now);

  if (entry.count <= rule.max) {
    return null;
  }

  const language = resolveTrafficGuardLanguage(pathname, requestUrl);
  return {
    statusCode: 429,
    message: rule.messages[language] || rule.messages.vi || rule.messages.en,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    limit: rule.max,
    resetAt: entry.resetAt
  };
}

function resolveTrafficGuardLanguage(pathname, requestUrl) {
  if (pathname.startsWith("/en")) {
    return "en";
  }

  if (requestUrl.searchParams.get("lang") === "en") {
    return "en";
  }

  return "vi";
}

function pruneTrafficGuardBuckets(now) {
  if (trafficGuardBuckets.size < 500) {
    return;
  }

  for (const [key, value] of trafficGuardBuckets.entries()) {
    if (value.resetAt <= now) {
      trafficGuardBuckets.delete(key);
    }
  }
}

function sendRateLimitResponse(res, pathname, details) {
  const extraHeaders = {
    "Retry-After": String(details.retryAfterSeconds),
    "X-RateLimit-Limit": String(details.limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.ceil(details.resetAt / 1000)),
    Connection: "close"
  };

  if (pathname.startsWith("/api/")) {
    return sendJson(res, details.statusCode, { error: details.message }, { extraHeaders });
  }

  return sendText(res, details.statusCode, details.message, "text/plain; charset=utf-8", { extraHeaders });
}

function sendMethodNotAllowed(res, allow) {
  return sendJson(res, 405, { error: "Method not allowed." }, { extraHeaders: { Allow: allow } });
}

function sendEmpty(res, statusCode, extraHeaders = {}) {
  res.writeHead(
    statusCode,
    createResponseHeaders({
      cacheControl: "no-store",
      extraHeaders
    })
  );
  res.end();
}

function resolvePublicPageCacheControl(requestUrl) {
  return requestUrl.search ? "no-store" : PUBLIC_PAGE_CACHE_CONTROL;
}

async function tryStatic(pathname, requestUrl, res) {
  const staticPath = pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(publicDir, staticPath));

  if (!filePath.startsWith(publicDir)) {
    return false;
  }

  try {
    const file = await readFile(filePath);
    const cacheControl = requestUrl.searchParams.has("v")
      ? STATIC_ASSET_CACHE_CONTROL
      : STATIC_ASSET_FALLBACK_CACHE_CONTROL;
    res.writeHead(
      200,
      createResponseHeaders({
        cacheControl,
        contentType: mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
      })
    );
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
  const cacheControl = pathname === "/api/newsroom/live" ? LIVE_API_CACHE_CONTROL : PUBLIC_API_CACHE_CONTROL;

  if (pathname === "/api/newsroom/overview") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    const home = state.home[language];
    return sendJson(
      res,
      200,
      {
        site: state.site,
        metrics: home.metrics,
        featured: compactArticle(home.featured),
        latest: home.latest.map(compactArticle),
        trending: home.trending.map(compactArticle)
      },
      { cacheControl }
    );
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
      })),
      { cacheControl }
    );
  }

  if (pathname === "/api/newsroom/radar") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.radar[language], { cacheControl });
  }

  if (pathname === "/api/newsroom/dashboard") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.dashboard[language], { cacheControl });
  }

  if (pathname === "/api/newsroom/live") {
    const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
    return sendJson(res, 200, state.home[language].liveDesk, { cacheControl });
  }

  return sendJson(res, 404, { error: "Not found." });
}

function enforceFormSecurity(req, pathname, form, viewer, language) {
  if (!isAllowedFormOrigin(req)) {
    throw new Error(
      language === "vi"
        ? "Yêu cầu bị chặn vì nguồn gửi biểu mẫu không hợp lệ."
        : "The request was blocked because the form origin is invalid."
    );
  }

  if (!verifyCsrfToken(form.csrf_token, config.sessionSecret, pathname, viewer?.id || null)) {
    throw new Error(
      language === "vi"
        ? "Phiên biểu mẫu đã hết hạn hoặc không hợp lệ. Vui lòng tải lại trang và thử lại."
        : "The form session is invalid or has expired. Please reload the page and try again."
    );
  }

  enforceRateLimit(pathname, viewer, req, language);
}

function enforceRateLimit(pathname, viewer, req, language) {
  const rule = RATE_LIMIT_RULES[pathname];

  if (!rule) {
    return;
  }

  const now = Date.now();
  const actor = viewer?.id ? `user:${viewer.id}` : `ip:${getClientAddress(req)}`;
  const key = `${pathname}:${actor}`;
  const existing = rateLimitBuckets.get(key);
  const entry =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + rule.windowMs
        };

  entry.count += 1;
  rateLimitBuckets.set(key, entry);
  pruneRateLimitBuckets(now);

  if (entry.count > rule.max) {
    throw new Error(rule.messages[language] || rule.messages.vi);
  }
}

function pruneRateLimitBuckets(now) {
  if (rateLimitBuckets.size < 500) {
    return;
  }

  for (const [key, value] of rateLimitBuckets.entries()) {
    if (value.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

async function handleAuthRoute(req, res, requestUrl, pathname, viewer, cookies) {
  const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";
  const publicSiteUrl = resolvePublicSiteUrl(req);

  if (pathname === "/auth/google/start") {
    if (!platformService.isGoogleConfigured()) {
      return redirect(res, `/${language}/login?error=${encodeURIComponent(language === "vi" ? "Google login chưa được cấu hình." : "Google login is not configured yet.")}`);
    }

    const googleState = createGoogleStateValue(config.sessionSecret);
    setGoogleStateCookie(res, googleState, { secure: shouldUseSecureCookies(req) });

    return redirect(
      res,
      buildGoogleAuthUrl({
        clientId: config.googleClientId,
        redirectUri: `${publicSiteUrl}/auth/google/callback`,
        state: googleState
      })
    );
  }

  if (pathname === "/auth/google/callback") {
    if (!platformService.isGoogleConfigured()) {
      return redirect(res, `/${language}/login?error=${encodeURIComponent(language === "vi" ? "Google login chưa được bật." : "Google login is not enabled.")}`);
    }

    try {
      const googleState = readGoogleState(req, config.sessionSecret);
      if (!requestUrl.searchParams.get("code") || !googleState || requestUrl.searchParams.get("state") !== googleState.token) {
        throw new Error(language === "vi" ? "Phiên đăng nhập Google không hợp lệ." : "Invalid Google sign-in state.");
      }

      const profile = await exchangeGoogleCode({
        code: requestUrl.searchParams.get("code"),
        redirectUri: `${publicSiteUrl}/auth/google/callback`,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret
      });
      const adminUser = await platformService.upsertAdminFromGoogle(profile, language);
      clearGoogleStateCookie(res, { secure: shouldUseSecureCookies(req) });
      setSessionCookie(res, adminUser.id, config.sessionSecret, undefined, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "Đăng nhập admin thành công." : "Admin sign-in completed.")}`);
    } catch (error) {
      clearGoogleStateCookie(res, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/login?error=${encodeURIComponent(error.message || "Google login failed.")}`);
    }
  }

  return sendJson(res, 404, { error: "Not found." });
}

async function handleFormRoute(req, res, requestUrl, pathname, viewer) {
  let form = {};
  let language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";

  try {
    form = await readFormBody(req);
    language = form.lang === "en" ? "en" : language;
    enforceFormSecurity(req, pathname, form, viewer, language);

    if (pathname === "/auth/register") {
      if (form.password !== form.password_confirm) {
        throw new Error(language === "vi" ? "Mật khẩu xác nhận chưa khớp." : "Password confirmation does not match.");
      }

      const user = await platformService.registerWriter({
        name: form.name,
        email: form.email,
        password: form.password,
        language
      });
      setSessionCookie(res, user.id, config.sessionSecret, undefined, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Tài khoản writer đã được tạo." : "Your writer account has been created.")}`);
    }

    if (pathname === "/auth/login") {
      const user = await platformService.loginWriter({
        email: form.email,
        password: form.password,
        language
      });
      setSessionCookie(res, user.id, config.sessionSecret, undefined, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Đăng nhập thành công." : "You are now signed in.")}`);
    }

    if (pathname === "/auth/logout") {
      clearSessionCookie(res, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Bạn đã đăng xuất." : "You have been signed out.")}`);
    }

    if (pathname === "/article/reactions") {
      await platformService.addArticleReaction({
        articleId: form.article_id,
        href: form.article_href,
        reaction: form.reaction,
        user: viewer,
        language
      });

      return redirect(
        res,
        `${safeReturnPath(form.return_to, language)}?notice=${encodeURIComponent(
          language === "vi" ? "Đã ghi nhận cảm xúc của bạn." : "Your reaction has been recorded."
        )}#community`
      );
    }

    if (pathname === "/article/comments") {
      await platformService.addArticleComment({
        articleId: form.article_id,
        href: form.article_href,
        name: form.name,
        body: form.comment,
        user: viewer,
        language
      });

      return redirect(
        res,
        `${safeReturnPath(form.return_to, language)}?notice=${encodeURIComponent(
          language === "vi" ? "Bình luận của bạn đã được đăng." : "Your comment has been published."
        )}#community`
      );
    }

    if (pathname === "/portal/submissions") {
      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập trước khi gửi bài." : "Please sign in before submitting a story.")}`);
      }

      await platformService.createSubmission({
        userId: viewer.id,
        language,
        formData: mapSubmissionForm(form)
      });
      await refreshState();
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Bài viết đã được đưa vào hệ thống duyệt tự động." : "Your story has entered the automatic review flow.")}`);
    }

    if (pathname === "/portal/withdrawals") {
      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập trước khi rút tiền." : "Please sign in before requesting a withdrawal.")}`);
      }

      await platformService.createWithdrawal({
        userId: viewer.id,
        amount: form.amount,
        binanceAccount: form.binance_account,
        walletAddress: form.wallet_address,
        network: form.network,
        note: form.note,
        language
      });
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Yêu cầu rút tiền đã được ghi nhận." : "Your withdrawal request has been recorded.")}`);
    }

    if (pathname === "/admin/review") {
      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chỉ admin mới thao tác được." : "Only admins can perform this action.")}`);
      }

      await platformService.reviewSubmissionDecision({
        submissionId: form.submission_id,
        decision: form.decision,
        language
      });
      await refreshState();
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "Đã cập nhật trạng thái bài viết." : "The story status has been updated.")}`);
    }

    if (pathname === "/admin/revenue") {
      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chỉ admin mới thao tác được." : "Only admins can perform this action.")}`);
      }

      await platformService.updateRevenue({
        submissionId: form.submission_id,
        grossUsd: form.gross_usd,
        language
      });
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "Doanh thu bài viết đã được cập nhật." : "Story revenue has been updated.")}`);
    }

    if (pathname === "/admin/withdrawals") {
      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chá»‰ admin má»›i thao tĂ¡c Ä‘Æ°á»£c." : "Only admins can perform this action.")}`);
      }

      await platformService.updateWithdrawalStatus({
        withdrawalId: form.withdrawal_id,
        status: form.status,
        language
      });
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "YĂªu cáº§u rĂºt tiá»n Ä‘Ă£ Ä‘Æ°á»£c cáº­p nháº­t." : "Withdrawal status has been updated.")}`);
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const fallbackPath = pathname.startsWith("/article/")
      ? safeReturnPath(form.return_to, language)
      : pathname.startsWith("/admin")
      ? `/${language}/admin`
      : pathname.startsWith("/portal")
        ? `/${language}/portal`
        : pathname === "/auth/register"
          ? `/${language}/login`
          : `/${language}/login`;
    const separator = fallbackPath.includes("?") ? "&" : "?";
    const tabParam = pathname === "/auth/register" ? `${separator}tab=register` : "";
    const errorSeparator = tabParam ? "&" : separator;
    return redirect(res, `${fallbackPath}${tabParam}${errorSeparator}error=${encodeURIComponent(error.message || "Request failed.")}`);
  }
}

async function readFormBody(req) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > 256 * 1024) {
      throw new Error("Payload too large.");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function mapSubmissionForm(form) {
  return {
    topic: normalizeTopic(form.topic),
    content_type: form.content_type,
    title: form.title,
    hook: form.hook,
    dek: form.dek,
    summary: form.summary,
    sections: [
      { heading: form.section_heading_1, body: form.section_body_1 },
      { heading: form.section_heading_2, body: form.section_body_2 },
      { heading: form.section_heading_3, body: form.section_body_3 }
    ],
    sources: [
      { source_name: form.source_name_1, source_url: form.source_url_1, source_type: "press", image_url: form.image_src, image_caption: form.image_caption, image_credit: form.image_credit },
      { source_name: form.source_name_2, source_url: form.source_url_2, source_type: "press", image_url: form.image_src, image_caption: form.image_caption, image_credit: form.image_credit }
    ],
    image: {
      src: form.image_src,
      credit: form.image_credit,
      caption: form.image_caption
    }
  };
}

function normalizeTopic(topic) {
  const value = String(topic || "").trim();
  if (value === "software") {
    return "apps-software";
  }
  if (value === "internet-business") {
    return "internet-business-tech";
  }
  return value || "ai";
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

function safeReturnPath(candidate, language) {
  const fallback = `/${language}/`;
  const value = String(candidate || "").trim();

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\r") || value.includes("\n")) {
    return fallback;
  }

  return value;
}

function redirect(res, location) {
  res.writeHead(
    302,
    createResponseHeaders({
      location,
      cacheControl: "no-store"
    })
  );
  res.end();
}

async function handleRemoteStoryImage(requestUrl, res, state) {
  const targetUrl = normalizeRemoteImageUrl(requestUrl.searchParams.get("src") || "");

  if (!targetUrl || !isAllowedRemoteImageUrl(state, targetUrl)) {
    return sendText(res, 404, "Image not available.", "text/plain; charset=utf-8");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "PatrickTechMediaImageProxy/1.0"
      }
    });

    if (!response.ok) {
      return sendText(res, 404, "Image not available.", "text/plain; charset=utf-8");
    }

    const imageBytes = Buffer.from(await response.arrayBuffer());
    if (imageBytes.byteLength > REMOTE_IMAGE_MAX_BYTES) {
      return sendText(res, 413, "Image is too large.", "text/plain; charset=utf-8");
    }
    const contentType = resolveRemoteImageContentType(
      String(response.headers.get("content-type") || "").trim(),
      targetUrl,
      imageBytes
    );

    if (!contentType) {
      return sendText(res, 415, "Unsupported image type.", "text/plain; charset=utf-8");
    }

    res.writeHead(
      200,
      createResponseHeaders({
        cacheControl: REMOTE_IMAGE_CACHE_CONTROL,
        contentType
      })
    );
    res.end(imageBytes);
  } catch {
    return sendText(res, 404, "Image not available.", "text/plain; charset=utf-8");
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRemoteImageContentType(headerValue, targetUrl, imageBytes) {
  const normalizedHeader = String(headerValue || "").split(";")[0].trim().toLowerCase();

  if (/^image\//i.test(normalizedHeader)) {
    return normalizedHeader;
  }

  const extensionType = inferImageTypeFromUrl(targetUrl);
  if (extensionType) {
    return extensionType;
  }

  if (Buffer.isBuffer(imageBytes)) {
    if (imageBytes.length >= 12 && imageBytes.toString("ascii", 0, 4) === "RIFF" && imageBytes.toString("ascii", 8, 12) === "WEBP") {
      return "image/webp";
    }

    if (imageBytes.length >= 8
      && imageBytes[0] === 0x89
      && imageBytes[1] === 0x50
      && imageBytes[2] === 0x4e
      && imageBytes[3] === 0x47) {
      return "image/png";
    }

    if (imageBytes.length >= 3 && imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff) {
      return "image/jpeg";
    }

    if (imageBytes.length >= 6) {
      const signature = imageBytes.toString("ascii", 0, 6);
      if (signature === "GIF87a" || signature === "GIF89a") {
        return "image/gif";
      }
    }
  }

  return "";
}

function inferImageTypeFromUrl(targetUrl) {
  try {
    const pathname = new URL(targetUrl).pathname.toLowerCase();

    if (pathname.endsWith(".avif")) {
      return "image/avif";
    }
    if (pathname.endsWith(".webp")) {
      return "image/webp";
    }
    if (pathname.endsWith(".png")) {
      return "image/png";
    }
    if (pathname.endsWith(".gif")) {
      return "image/gif";
    }
    if (pathname.endsWith(".svg")) {
      return "image/svg+xml";
    }
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
      return "image/jpeg";
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeRemoteImageUrl(value) {
  try {
    const target = new URL(String(value || "").trim());
    if (!/^https?:$/i.test(target.protocol)) {
      return "";
    }
    target.hash = "";
    return target.toString();
  } catch {
    return "";
  }
}

function isAllowedRemoteImageUrl(state, targetUrl) {
  const normalizedTarget = normalizeRemoteImageUrl(targetUrl);
  if (!normalizedTarget) {
    return false;
  }

  for (const article of state.articles || []) {
    const candidates = [
      article?.hero_image?.raw_src,
      article?.hero_image?.src,
      article?.image?.src,
      ...(Array.isArray(article?.source_set)
        ? article.source_set.flatMap((source) => [source?.image_url, source?.image, source?.src])
        : [])
    ];

    for (const candidate of candidates) {
      if (normalizeRemoteImageUrl(candidate) === normalizedTarget) {
        return true;
      }
    }
  }

  return false;
}

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "");

  if (forwardedProto.toLowerCase().includes("https")) {
    return true;
  }

  const host = String(req.headers.host || "");
  return /^https:\/\//i.test(config.siteUrl) && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}

function sendHtml(res, statusCode, html, options = {}) {
  res.writeHead(
    statusCode,
    createResponseHeaders({
      cacheControl: options.cacheControl || "no-store",
      contentType: "text/html; charset=utf-8",
      extraHeaders: options.extraHeaders || {}
    })
  );
  res.end(html);
}

function sendText(res, statusCode, content, contentType, options = {}) {
  res.writeHead(
    statusCode,
    createResponseHeaders({
      cacheControl: options.cacheControl || "no-store",
      contentType,
      extraHeaders: options.extraHeaders || {}
    })
  );
  res.end(content);
}

function sendJson(res, statusCode, payload, options = {}) {
  res.writeHead(
    statusCode,
    createResponseHeaders({
      cacheControl: options.cacheControl || "no-store",
      contentType: "application/json; charset=utf-8",
      extraHeaders: options.extraHeaders || {}
    })
  );
  res.end(JSON.stringify(payload));
}

function createResponseHeaders({ cacheControl = "no-store", contentType = "", location = "", extraHeaders = {} } = {}) {
  const headers = {
    "Cache-Control": cacheControl,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-DNS-Prefetch-Control": "off",
    "Content-Security-Policy": buildContentSecurityPolicy(),
    ...extraHeaders
  };

  if (/^https:\/\//i.test(config.siteUrl)) {
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (location) {
    headers.Location = location;
  }

  return headers;
}

function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://partner.googleadservices.com https://www.googletagservices.com https://www.google.com https://www.gstatic.com",
    "connect-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com",
    "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com",
    "manifest-src 'self'",
    "media-src 'self' https: data:",
    "worker-src 'self' blob:"
  ].join("; ");
}

function getClientAddress(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean);

  return forwarded || req.socket?.remoteAddress || "unknown";
}

function isAllowedFormOrigin(req) {
  const allowedOrigins = new Set([new URL(config.siteUrl).origin]);
  const requestOrigin = getRequestOrigin(req);

  if (requestOrigin) {
    allowedOrigins.add(requestOrigin);
  }

  const originHeader = String(req.headers.origin || "").trim();
  if (originHeader) {
    return allowedOrigins.has(originHeader);
  }

  const refererHeader = String(req.headers.referer || "").trim();
  if (!refererHeader) {
    return true;
  }

  try {
    return allowedOrigins.has(new URL(refererHeader).origin);
  } catch {
    return false;
  }
}

function getRequestOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  if (!host) {
    return "";
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

function resolvePublicSiteUrl(req) {
  return getRequestOrigin(req) || config.siteUrl;
}

function normalizeSiteUrl(value) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");
  return normalized || config.siteUrl;
}

function resolveSessionSecret(value, siteUrl) {
  const trimmed = String(value || "").trim();
  const isProductionLike = /^https:\/\//i.test(siteUrl) && !/localhost|127\.0\.0\.1/i.test(siteUrl);

  if (trimmed && trimmed !== DEFAULT_SESSION_SECRET) {
    return { value: trimmed, warning: "" };
  }

  if (!isProductionLike) {
    return { value: trimmed || DEFAULT_SESSION_SECRET, warning: "" };
  }

  return {
    value: crypto.randomBytes(32).toString("hex"),
    warning: "SESSION_SECRET is missing or using the demo default in production-like mode. A temporary in-memory secret was generated; set a real SESSION_SECRET to keep sessions stable and protected."
  };
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
