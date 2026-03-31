import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildJsonFeed,
  buildNewsSitemapXml,
  buildSitemapXml,
  buildNewsroomState,
  getArticleByRoute,
  getHomeData,
  getRadarData,
  getTopicPage
} from "../src/newsroom-service.mjs";
import { renderArticlePage, renderHomePage } from "../src/newsroom-render.mjs";

const state = createState();
const tests = [
  {
    name: "ships at least 20 localized newsroom articles across at least 10 clusters",
    run() {
      assert.ok(state.articles.length >= 20);
      assert.ok(new Set(state.articles.map((article) => article.cluster_id)).size >= 10);
    }
  },
  {
    name: "keeps trend stories indexable but ad-free",
    run() {
      const article = getArticleByRoute(state, "vi", "tin-tuc", "cong-dong-ban-tan-ve-overlay-moi-cho-he-gia-lap-may-handheld");
      const html = renderArticlePage(state, "vi", article, [], { client: "", slots: {} });

      assert.equal(article.verification_state, "trend");
      assert.equal(article.ad_eligible, false);
      assert.match(html, /Trend Watch/);
      assert.doesNotMatch(html, /Reserved for Google AdSense/);
      assert.doesNotMatch(html, /adsbygoogle/);
    }
  },
  {
    name: "renders ad placeholders for verified stories when AdSense is not configured",
    run() {
      const article = getArticleByRoute(state, "en", "news", "viettel-pilots-edge-ai-assistant-for-field-sales-teams");
      const html = renderArticlePage(state, "en", article, [], { client: "", slots: {} });

      assert.equal(article.verification_state, "verified");
      assert.equal(article.ad_eligible, true);
      assert.equal(article.hero_image.kind, "placeholder");
      assert.match(html, /Reserved for Google AdSense/);
      assert.match(html, /hreflang="vi" href="https:\/\/patricktech\.media\/vi\/tin-tuc\/viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang"/);
      assert.match(html, /Source image pending/);
      assert.doesNotMatch(html, /media\/story\/viettel-edge-ai-pilot\.svg\?lang=en/);
    }
  },
  {
    name: "keeps topic pages language-specific",
    run() {
      const page = getTopicPage(state, "vi", "ai");
      assert.ok(page);
      assert.equal(page.label, "AI");
      assert.ok(page.stories.every((story) => story.language === "vi"));
      assert.ok(page.stories.every((story) => story.href.startsWith("/vi/")));
    }
  },
  {
    name: "emits bilingual sitemap entries with hreflang links",
    run() {
      const xml = buildSitemapXml(state);
      assert.match(xml, /<loc>https:\/\/patricktech\.media\/vi\//);
      assert.match(xml, /<loc>https:\/\/patricktech\.media\/en\//);
      assert.match(xml, /hreflang="vi"/);
      assert.match(xml, /hreflang="en"/);
      assert.match(xml, /viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang/);
      assert.match(xml, /viettel-pilots-edge-ai-assistant-for-field-sales-teams/);
    }
  },
  {
    name: "emits a dedicated news sitemap for indexable news articles",
    run() {
      const xml = buildNewsSitemapXml(state);

      assert.match(xml, /<news:news>/);
      assert.match(xml, /viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang/);
      assert.match(xml, /<news:language>vi<\/news:language>/);
      assert.match(xml, /<news:language>en<\/news:language>/);
    }
  },
  {
    name: "home data exposes a live desk payload for continuous refresh",
    run() {
      const home = getHomeData(state, "vi");
      assert.equal(home.liveDesk.cards.length, 4);
      assert.ok(home.liveDesk.ticker.length > 0);
      assert.ok(home.liveDesk.refreshIntervalMs > 0);
    }
  },
  {
    name: "keeps internal automation branding off public pages and generates hooks for every article",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });
      const article = getArticleByRoute(state, "en", "news", "viettel-pilots-edge-ai-assistant-for-field-sales-teams");
      const articleHtml = renderArticlePage(state, "en", article, [], { client: "", slots: {} });

      assert.ok(state.articles.every((entry) => entry.hook && /[.?!]$/.test(entry.hook)));
      assert.doesNotMatch(homeHtml, /OpenClaw/i);
      assert.doesNotMatch(articleHtml, /OpenClaw/i);
    }
  },
  {
    name: "versions public assets so deploys bust stale browser cache",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });

      assert.match(homeHtml, /\/site\.css\?v=/);
      assert.match(homeHtml, /\/site\.js\?v=/);
      assert.match(homeHtml, /\/patrick-tech-media-mark\.svg\?v=/);
      assert.equal(typeof state.site.assetVersion, "string");
      assert.ok(state.site.assetVersion.length > 0);
    }
  },
  {
    name: "builds a machine-readable JSON feed for the newsroom",
    run() {
      const feed = buildJsonFeed(state, "vi");
      assert.equal(feed.version, "https://jsonfeed.org/version/1.1");
      assert.equal(feed.items.length, 11);
      assert.match(feed.items[0].url, /\/vi\//);
    }
  },
  {
    name: "loads live newsroom content from an external JSON file",
    run() {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-media-"));
      const contentPath = path.join(tempDir, "newsroom-content.json");
      fs.writeFileSync(contentPath, JSON.stringify({ articles: [state.articles[0]] }, null, 2), "utf8");

      const fileState = buildNewsroomState({
        siteUrl: "https://patricktech.media",
        storeUrl: "https://patricktechstore.vercel.app",
        contentPath
      });

      assert.equal(fileState.articles.length, 1);
      assert.equal(fileState.contentPath, contentPath);
      assert.equal(fileState.articles[0].title, state.articles[0].title);
    }
  },
  {
    name: "prefers collected source images over generated artwork",
    run() {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-media-images-"));
      const contentPath = path.join(tempDir, "newsroom-content.json");
      const article = {
        ...state.articles.find((entry) => entry.language === "en"),
        slug: "source-image-story",
        href: "/en/news/source-image-story",
        source_set: [
          {
            source_type: "press",
            source_name: "Tech Press",
            source_url: "https://example.com/story",
            image_url: "https://images.example.com/story.jpg",
            image_caption: "Reference image from the source story.",
            image_credit: "Tech Press"
          }
        ]
      };

      fs.writeFileSync(contentPath, JSON.stringify({ articles: [article] }, null, 2), "utf8");

      const fileState = buildNewsroomState({
        siteUrl: "https://patricktech.media",
        storeUrl: "https://patricktechstore.vercel.app",
        contentPath
      });
      const html = renderArticlePage(fileState, "en", fileState.articles[0], [], { client: "", slots: {} });

      assert.equal(fileState.articles[0].hero_image.kind, "source");
      assert.equal(fileState.articles[0].hero_image.src, "https://images.example.com/story.jpg");
      assert.match(html, /https:\/\/images\.example\.com\/story\.jpg/);
      assert.match(html, /Tech Press/);
    }
  },
  {
    name: "builds radar lanes for trend, emerging, and verified stories",
    run() {
      const radar = getRadarData(state, "en");
      assert.equal(radar.lanes.length, 3);
      assert.ok(radar.lanes.every((lane) => lane.stories.length > 0));
      assert.ok(radar.sourceMix.length > 0);
      assert.ok(radar.queue.length > 0);
    }
  }
];

let failed = 0;

for (const entry of tests) {
  try {
    entry.run();
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${entry.name}`);
    console.error(error.stack || error.message || error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} newsroom checks passed.`);
}

function createState() {
  const newsroom = buildNewsroomState({
    siteUrl: "https://patricktech.media",
    storeUrl: "https://patricktechstore.vercel.app"
  });
  newsroom.home = {
    vi: getHomeData(newsroom, "vi"),
    en: getHomeData(newsroom, "en")
  };
  return newsroom;
}
