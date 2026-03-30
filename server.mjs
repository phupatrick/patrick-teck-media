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
  buildGoogleAuthUrl,
  clearGoogleStateCookie,
  clearSessionCookie,
  createGoogleStateValue,
  exchangeGoogleCode,
  parseCookies,
  readGoogleState,
  readSessionUserId,
  setGoogleStateCookie,
  setSessionCookie
} from "./src/platform-auth.mjs";
import { renderAdminPage, renderAuthPage, renderPortalPage } from "./src/platform-render.mjs";
import { createPlatformService } from "./src/platform-service.mjs";
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
  siteUrl: process.env.SITE_URL || envFromFile.SITE_URL || "https://patricktechmedia.vercel.app",
  storeUrl: process.env.PATRICK_TECH_STORE_URL || envFromFile.PATRICK_TECH_STORE_URL || "https://store.patricktech.media",
  contentPath: process.env.NEWSROOM_CONTENT_PATH || envFromFile.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
  platformStatePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
  sessionSecret: process.env.SESSION_SECRET || envFromFile.SESSION_SECRET || "patrick-tech-media-dev-secret",
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
const platformService = createPlatformService({
  statePath: config.platformStatePath,
  newsroomContentPath: config.contentPath,
  siteUrl: config.siteUrl,
  googleClientId: config.googleClientId,
  googleClientSecret: config.googleClientSecret,
  adminEmails: config.adminEmails
});

let cachedState = buildState();
let cachedAt = Date.now();
const server = createServer(handleRequest);

async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const state = getState();
    const cookies = parseCookies(req.headers.cookie || "");
    const viewer = platformService.getUserById(readSessionUserId(req, config.sessionSecret));

    if (req.method === "POST") {
      return handleFormRoute(req, res, requestUrl, pathname, viewer);
    }

    if (pathname.startsWith("/auth/")) {
      return handleAuthRoute(req, res, requestUrl, pathname, viewer, cookies);
    }

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

    const segments = pathname.split("/").filter(Boolean);
    const language = segments[0];

    if (!["vi", "en"].includes(language)) {
      return sendHtml(res, 404, renderNotFoundPage(state, "vi", adsConfig));
    }

    if (segments.length === 1) {
      return sendHtml(res, 200, renderHomePage(state, language, adsConfig));
    }

    if (segments[1] === "login") {
      return sendHtml(
        res,
        200,
        renderAuthPage(state, language, {
          notice: requestUrl.searchParams.get("notice") || requestUrl.searchParams.get("error") || "",
          googleEnabled: platformService.isGoogleConfigured()
        })
      );
    }

    if (segments[1] === "portal") {
      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập để mở writer portal." : "Please sign in to open the writer portal.")}`);
      }

      const portal = platformService.getPortalData(viewer.id, language);
      return sendHtml(
        res,
        200,
        renderPortalPage(state, language, portal, {
          notice: requestUrl.searchParams.get("notice") || ""
        })
      );
    }

    if (segments[1] === "admin") {
      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chỉ admin mới truy cập được bàn duyệt." : "Only admins can access the review desk.")}`);
      }

      return sendHtml(
        res,
        200,
        renderAdminPage(state, language, platformService.getAdminDashboard(language), {
          notice: requestUrl.searchParams.get("notice") || ""
        })
      );
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
}

if (isDirectExecution()) {
  server.listen(config.port, () => {
    console.log(`Patrick Tech Media is running at http://localhost:${config.port}`);
  });
}

export { server, buildState, handleRequest };

function buildState() {
  const communityArticles = platformService.listPublishedArticles();
  const newsroom = buildNewsroomState({
    siteUrl: config.siteUrl,
    storeUrl: config.storeUrl,
    contentPath: config.contentPath,
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

function getState() {
  if (Date.now() - cachedAt > 30_000) {
    refreshState();
  }

  return cachedState;
}

function refreshState() {
  cachedState = buildState();
  cachedAt = Date.now();
}

function isDirectExecution() {
  return path.resolve(process.argv[1] || "") === __filename;
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

async function handleAuthRoute(req, res, requestUrl, pathname, viewer, cookies) {
  const language = requestUrl.searchParams.get("lang") === "en" ? "en" : "vi";

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
        redirectUri: `${config.siteUrl}/auth/google/callback`,
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
      if (!requestUrl.searchParams.get("code") || !googleState || requestUrl.searchParams.get("state") !== cookies.ptm_google_state) {
        throw new Error(language === "vi" ? "Phiên đăng nhập Google không hợp lệ." : "Invalid Google sign-in state.");
      }

      const profile = await exchangeGoogleCode({
        code: requestUrl.searchParams.get("code"),
        redirectUri: `${config.siteUrl}/auth/google/callback`,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret
      });
      const adminUser = platformService.upsertAdminFromGoogle(profile, language);
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
  const form = await readFormBody(req);
  const language = form.lang === "en" ? "en" : "vi";

  try {
    if (pathname === "/auth/register") {
      const user = platformService.registerWriter({
        name: form.name,
        email: form.email,
        password: form.password,
        language
      });
      setSessionCookie(res, user.id, config.sessionSecret, undefined, { secure: shouldUseSecureCookies(req) });
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Tài khoản writer đã được tạo." : "Your writer account has been created.")}`);
    }

    if (pathname === "/auth/login") {
      const user = platformService.loginWriter({
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

    if (pathname === "/portal/submissions") {
      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập trước khi gửi bài." : "Please sign in before submitting a story.")}`);
      }

      platformService.createSubmission({
        userId: viewer.id,
        language,
        formData: mapSubmissionForm(form)
      });
      refreshState();
      return redirect(res, `/${language}/portal?notice=${encodeURIComponent(language === "vi" ? "Bài viết đã được đưa vào hệ thống duyệt tự động." : "Your story has entered the automatic review flow.")}`);
    }

    if (pathname === "/portal/withdrawals") {
      if (!viewer) {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Vui lòng đăng nhập trước khi rút tiền." : "Please sign in before requesting a withdrawal.")}`);
      }

      platformService.createWithdrawal({
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

      platformService.reviewSubmissionDecision({
        submissionId: form.submission_id,
        decision: form.decision,
        language
      });
      refreshState();
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "Đã cập nhật trạng thái bài viết." : "The story status has been updated.")}`);
    }

    if (pathname === "/admin/revenue") {
      if (!viewer || viewer.role !== "admin") {
        return redirect(res, `/${language}/login?notice=${encodeURIComponent(language === "vi" ? "Chỉ admin mới thao tác được." : "Only admins can perform this action.")}`);
      }

      platformService.updateRevenue({
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

      platformService.updateWithdrawalStatus({
        withdrawalId: form.withdrawal_id,
        status: form.status,
        language
      });
      return redirect(res, `/${language}/admin?notice=${encodeURIComponent(language === "vi" ? "YĂªu cáº§u rĂºt tiá»n Ä‘Ă£ Ä‘Æ°á»£c cáº­p nháº­t." : "Withdrawal status has been updated.")}`);
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const fallbackPath = pathname.startsWith("/admin") ? `/${language}/admin` : pathname.startsWith("/portal") ? `/${language}/portal` : `/${language}/login`;
    return redirect(res, `${fallbackPath}?error=${encodeURIComponent(error.message || "Request failed.")}`);
  }
}

async function readFormBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

function mapSubmissionForm(form) {
  return {
    topic: form.topic,
    content_type: form.content_type,
    title: form.title,
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

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "");

  if (forwardedProto.toLowerCase().includes("https")) {
    return true;
  }

  const host = String(req.headers.host || "");
  return /^https:\/\//i.test(config.siteUrl) && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
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
