import assert from "node:assert/strict";
import {
  buildJsonFeed,
  buildSitemapXml,
  buildNewsroomState,
  getArticleByRoute,
  getHomeData,
  getRadarData,
  getTopicPage
} from "../src/newsroom-service.mjs";
import { renderArticlePage } from "../src/newsroom-render.mjs";

const state = createState();
const tests = [
  {
    name: "ships at least 20 localized sample articles across at least 10 clusters",
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
      assert.match(html, /Reserved for Google AdSense/);
      assert.match(html, /hreflang="vi" href="https:\/\/patrickteck\.media\/vi\/tin-tuc\/viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang"/);
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
      assert.match(xml, /<loc>https:\/\/patrickteck\.media\/vi\//);
      assert.match(xml, /<loc>https:\/\/patrickteck\.media\/en\//);
      assert.match(xml, /hreflang="vi"/);
      assert.match(xml, /hreflang="en"/);
      assert.match(xml, /viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang/);
      assert.match(xml, /viettel-pilots-edge-ai-assistant-for-field-sales-teams/);
    }
  },
  {
    name: "builds a machine-readable JSON feed for the demo",
    run() {
      const feed = buildJsonFeed(state, "vi");
      assert.equal(feed.version, "https://jsonfeed.org/version/1.1");
      assert.equal(feed.items.length, 11);
      assert.match(feed.items[0].url, /\/vi\//);
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
    siteUrl: "https://patrickteck.media",
    storeUrl: "https://store.patrickteck.media"
  });
  newsroom.home = {
    vi: getHomeData(newsroom, "vi"),
    en: getHomeData(newsroom, "en")
  };
  return newsroom;
}
