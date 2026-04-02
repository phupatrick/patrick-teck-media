import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
      const scenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          content_type: "NewsArticle",
          verification_state: "trend",
          title: "Cộng đồng đang dõi theo bản cập nhật mới của một ứng dụng mạng xã hội",
          slug: "cong-dong-dang-doi-theo-ban-cap-nhat-moi-cua-mot-ung-dung-mang-xa-hoi",
          summary: "Một tín hiệu đang lan nhanh trong cộng đồng công nghệ Việt Nam sau khi người dùng phát hiện bản cập nhật mới xuất hiện theo từng nhóm nhỏ.",
          dek: "Câu chuyện đã có ảnh nguồn, phần mở, phần giải thích và đủ dữ liệu để index, nhưng vẫn chưa nên bật quảng cáo khi mức xác nhận còn sớm.",
          hook: "Một tín hiệu đang lan nhanh trong cộng đồng công nghệ Việt Nam sau khi người dùng phát hiện bản cập nhật mới xuất hiện theo từng nhóm nhỏ, đủ để đọc nhưng chưa đủ để quảng cáo.",
          sections: [
            {
              heading: "Điều vừa xảy ra",
              body: "Người dùng trong nhiều nhóm cộng đồng đồng loạt phát hiện bản cập nhật mới xuất hiện trên một số tài khoản thử nghiệm, kèm ảnh chụp màn hình và mô tả trải nghiệm ban đầu."
            },
            {
              heading: "Vì sao đáng chú ý",
              body: "Đây là kiểu tín hiệu thường đi trước một đợt rollout rộng hơn, nhất là khi thay đổi chạm vào khu vực có tần suất sử dụng hằng ngày và dễ tạo tranh luận trong cộng đồng."
            },
            {
              heading: "Điều cần theo dõi tiếp",
              body: "Điểm cần chờ thêm là xác nhận chính thức từ nền tảng và việc tính năng này có được mở rộng từ nhóm thử nghiệm nhỏ sang diện người dùng rộng hơn hay không."
            }
          ],
          image: {
            src: "https://images.example.com/trend-social-update.jpg",
            caption: "Ảnh tham khảo từ nguồn theo dõi cộng đồng.",
            credit: "Community Watch",
            source_url: "https://example.com/trend-social-update"
          },
          source_set: [
            {
              source_type: "community",
              source_name: "Community Watch",
              source_url: "https://example.com/trend-social-update",
              region: "VN",
              language: "vi",
              trust_tier: "community",
              published_at: "2026-03-31T11:00:00.000Z",
              image_url: "https://images.example.com/trend-social-update.jpg",
              image_caption: "Ảnh tham khảo từ nguồn theo dõi cộng đồng.",
              image_credit: "Community Watch"
            }
          ]
        })
      ]);
      const article = getArticleByRoute(
        scenario,
        "vi",
        "tin-tuc",
        "cong-dong-dang-doi-theo-ban-cap-nhat-moi-cua-mot-ung-dung-mang-xa-hoi"
      );
      const html = renderArticlePage(scenario, "vi", article, [], { client: "", slots: {} });

      assert.equal(article.verification_state, "trend");
      assert.equal(article.ad_eligible, false);
      assert.match(html, /Trend Watch/);
      assert.doesNotMatch(html, /Reserved for Google AdSense/);
      assert.doesNotMatch(html, /adsbygoogle/);
    }
  },
  {
    name: "renders Patrick Tech Store promo slots for verified stories when AdSense is not configured",
    run() {
      const scenario = buildScenarioState([
        makeScenarioArticle({
          language: "en",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "A major cloud platform is expanding local AI processing for support teams",
          slug: "a-major-cloud-platform-is-expanding-local-ai-processing-for-support-teams",
          summary: "A verified rollout shows a major cloud platform moving more AI work closer to the device so response time and reliability improve for real support operations.",
          dek: "The important part is not the demo value but the move toward a production workflow that reduces latency, keeps more work available offline, and gives teams a simpler operating path.",
          hook: "A verified rollout shows a major cloud platform moving more AI work closer to the device so response time and reliability improve for real support operations, which is exactly the kind of shift support teams tend to notice first.",
          sections: [
            {
              heading: "What happened",
              body: "The company outlined a verified rollout that moves more of the assistant stack onto hardware closer to the user, reducing the need to send every request back to the cloud."
            },
            {
              heading: "Why it matters",
              body: "That kind of shift usually means faster answers, better resilience when connectivity is weak, and a more believable path from pilot feature to something teams can rely on in everyday operations."
            },
            {
              heading: "What to watch next",
              body: "The next thing to watch is whether the rollout stays limited to one workflow or expands into field support, internal documentation, and ticket triage over the next few release cycles."
            }
          ],
          image: {
            src: "https://images.example.com/verified-edge-ai.jpg",
            caption: "Reference image from the verified rollout.",
            credit: "Example Cloud",
            source_url: "https://example.com/verified-edge-ai"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "Example Cloud",
              source_url: "https://example.com/verified-edge-ai",
              region: "Global",
              language: "en",
              trust_tier: "official",
              published_at: "2026-03-31T10:00:00.000Z",
              image_url: "https://images.example.com/verified-edge-ai.jpg",
              image_caption: "Reference image from the verified rollout.",
              image_credit: "Example Cloud"
            }
          ]
        })
      ]);
      const article = getArticleByRoute(
        scenario,
        "en",
        "news",
        "a-major-cloud-platform-is-expanding-local-ai-processing-for-support-teams"
      );
      const html = renderArticlePage(scenario, "en", article, [], { client: "", slots: {} });

      assert.equal(article.verification_state, "verified");
      assert.equal(article.ad_eligible, true);
      assert.equal(article.hero_image.kind, "source");
      assert.match(html, /Patrick Tech Store/);
      assert.match(html, /patricktechstore\.vercel\.app/);
      assert.match(html, /\/media\/source\?src=https%3A%2F%2Fimages\.example\.com%2Fverified-edge-ai\.jpg/);
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
      const viStory = state.articles.find((article) => article.language === "vi");
      const enStory = state.articles.find((article) => article.language === "en");
      assert.match(xml, /<loc>https:\/\/patricktech\.media\/vi\//);
      assert.match(xml, /<loc>https:\/\/patricktech\.media\/en\//);
      assert.match(xml, /hreflang="vi"/);
      assert.match(xml, /hreflang="en"/);
      assert.match(xml, new RegExp(escapeRegExp(viStory.slug)));
      assert.match(xml, new RegExp(escapeRegExp(enStory.slug)));
    }
  },
  {
    name: "emits a dedicated news sitemap for indexable news articles",
    run() {
      const xml = buildNewsSitemapXml(state);
      const viNews = state.articles.find((article) => article.language === "vi" && article.content_type === "NewsArticle");
      const enNews = state.articles.find((article) => article.language === "en" && article.content_type === "NewsArticle");

      assert.match(xml, /<news:news>/);
      assert.match(xml, new RegExp(escapeRegExp(viNews.slug)));
      assert.match(xml, new RegExp(escapeRegExp(enNews.slug)));
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
    name: "front page prioritizes AI and core technology stories over softer gaming chatter",
    run() {
      const scenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "emerging",
          title: "Rockstar làm GTA 6 theo cách không ai ngờ: tạo 10.000 âm thanh bước chân rồi chỉ dùng 100",
          slug: "rockstar-lam-gta-6-theo-cach-khong-ai-ngo-tao-10000-am-thanh-buoc-chan-roi-chi-dung-100",
          summary: "Bài này lên rất nhanh từ mảng game và cộng đồng, có hình nguồn nhưng giá trị ở front page nên thấp hơn các diễn biến AI hay bảo mật có tác động rộng hơn.",
          dek: "Dù mới và hút click, đây vẫn là kiểu câu chuyện nên nằm ở lớp theo dõi hoặc chuyên mục game thay vì chiếm vị trí dẫn đầu trang chủ công nghệ.",
          hook: "Dù mới và hút click, đây vẫn là kiểu câu chuyện nên nằm ở lớp theo dõi hoặc chuyên mục game thay vì chiếm vị trí dẫn đầu trang chủ công nghệ.",
          published_at: "2026-03-31T11:30:00.000Z",
          updated_at: "2026-03-31T11:30:00.000Z",
          sections: [
            { heading: "Cộng đồng đang nói gì", body: "Người chơi bàn nhiều về chi tiết sản xuất âm thanh và cách đội ngũ của Rockstar chọn ra số lượng âm thanh thật sự dùng trong game." },
            { heading: "Vì sao lan nhanh", body: "GTA 6 luôn là từ khóa có khả năng kéo tương tác mạnh, đặc biệt khi câu chuyện đụng vào chi tiết hậu trường dễ chia sẻ trong cộng đồng game." },
            { heading: "Nó nên đứng ở đâu", body: "Dạng bài này phù hợp ở chuyên mục gaming hoặc cụm theo dõi, thay vì lên đầu toàn bộ newsroom công nghệ." }
          ],
          image: {
            src: "https://images.example.com/gta6-audio.jpg",
            caption: "Ảnh tham khảo từ nguồn game.",
            credit: "GenK Apps-Games",
            source_url: "https://example.com/gta6-audio"
          },
          source_set: [
            {
              source_type: "press",
              source_name: "GenK Apps-Games",
              source_url: "https://example.com/gta6-audio",
              region: "VN",
              language: "vi",
              trust_tier: "established-media",
              published_at: "2026-03-31T11:30:00.000Z",
              image_url: "https://images.example.com/gta6-audio.jpg",
              image_caption: "Ảnh tham khảo từ nguồn game.",
              image_credit: "GenK Apps-Games"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "OpenAI thử nghiệm trợ lý AI cho nhóm chăm sóc khách hàng tại Đông Nam Á",
          slug: "openai-thu-nghiem-tro-ly-ai-cho-nhom-cham-soc-khach-hang-tai-dong-nam-a",
          summary: "Một đợt thử nghiệm mới cho thấy AI đang đi nhanh hơn vào vận hành thật, chạm thẳng vào nhóm công việc mà doanh nghiệp Việt Nam và khu vực theo dõi sát từng tuần.",
          dek: "Câu chuyện có độ ưu tiên cao hơn vì nó liên quan trực tiếp tới AI ứng dụng, cách doanh nghiệp vận hành đội hỗ trợ và hướng đi của các nền tảng lớn.",
          hook: "Câu chuyện có độ ưu tiên cao hơn vì nó liên quan trực tiếp tới AI ứng dụng, cách doanh nghiệp vận hành đội hỗ trợ và hướng đi của các nền tảng lớn.",
          published_at: "2026-03-31T11:00:00.000Z",
          updated_at: "2026-03-31T11:00:00.000Z",
          sections: [
            { heading: "Điều vừa xảy ra", body: "OpenAI đang thử nghiệm một luồng trợ lý mới cho đội ngũ chăm sóc khách hàng, tập trung vào trả lời nhanh, tóm tắt ngữ cảnh và giữ độ ổn định khi tải tăng." },
            { heading: "Vì sao đáng lên đầu trang", body: "Đây là kiểu diễn biến có sức nặng với độc giả công nghệ vì nó chạm vào AI ứng dụng, chiến lược nền tảng lớn và câu hỏi xem AI đang tiến xa tới đâu trong công việc thật." },
            { heading: "Điều cần theo dõi", body: "Điểm tiếp theo cần xem là mức độ mở rộng sang các thị trường châu Á và cách những đối thủ như Google hay Microsoft phản ứng." }
          ],
          image: {
            src: "https://images.example.com/openai-support.jpg",
            caption: "Ảnh tham khảo từ nguồn xác thực.",
            credit: "OpenAI",
            source_url: "https://example.com/openai-support"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "OpenAI",
              source_url: "https://example.com/openai-support",
              region: "Global",
              language: "vi",
              trust_tier: "official",
              published_at: "2026-03-31T11:00:00.000Z",
              image_url: "https://images.example.com/openai-support.jpg",
              image_caption: "Ảnh tham khảo từ nguồn xác thực.",
              image_credit: "OpenAI"
            }
          ]
        })
      ]);
      const home = getHomeData(scenario, "vi");
      const gamingStory = scenario.articles.find((article) => article.slug.includes("rockstar-lam-gta-6"));

      assert.equal(home.featured.slug, "openai-thu-nghiem-tro-ly-ai-cho-nhom-cham-soc-khach-hang-tai-dong-nam-a");
      assert.equal(gamingStory.topic, "gaming");
    }
  },
  {
    name: "keeps internal automation branding off public pages and generates hooks for every article",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });
      const article = state.articles.find((entry) => entry.language === "en");
      const articleHtml = renderArticlePage(state, "en", article, [], { client: "", slots: {} });

      assert.ok(state.articles.every((entry) => entry.hook && /[.?!]$/.test(entry.hook)));
      assert.doesNotMatch(homeHtml, /OpenClaw/i);
      assert.doesNotMatch(articleHtml, /OpenClaw/i);
    }
  },
  {
    name: "lets OpenClaw tune the front page through web control state",
    run() {
      const gamingArticle = makeScenarioArticle({
          language: "vi",
          topic: "gaming",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "Rockstar xác nhận thêm một đợt hé lộ mới cho GTA 6",
          slug: "rockstar-xac-nhan-them-mot-dot-he-lo-moi-cho-gta-6",
          summary: "Bài gaming này đủ mạnh để lên trang, nhưng sẽ chỉ được đẩy lên cao nhất nếu web control thực sự ưu tiên nó.",
          dek: "Bài gaming này đủ mạnh để lên trang, nhưng sẽ chỉ được đẩy lên cao nhất nếu web control thực sự ưu tiên nó.",
          hook: "Bài gaming này đủ mạnh để lên trang, nhưng sẽ chỉ được đẩy lên cao nhất nếu web control thực sự ưu tiên nó.",
          sections: [
            { heading: "Điều vừa xác nhận", body: "Rockstar vừa xác nhận thêm một nhịp hé lộ mới khiến cộng đồng game tiếp tục theo dõi sát mọi động thái liên quan GTA 6." },
            { heading: "Vì sao được chú ý", body: "Đây là nhóm headline kéo tương tác mạnh, nhất là khi người chơi vẫn chờ thêm mốc thời gian cụ thể cho các bản cập nhật lớn." },
            { heading: "Điều cần theo dõi", body: "Điểm tiếp theo là liệu nhịp hé lộ này có kéo thêm những thay đổi về kế hoạch ra mắt hoặc demo công khai hay không." }
          ],
          image: {
            src: "https://images.example.com/gaming-lead.jpg",
            caption: "Ảnh tham khảo từ nguồn game.",
            credit: "Gaming Desk",
            source_url: "https://example.com/gaming-lead"
          },
          source_set: [
            {
              source_type: "press",
              source_name: "Gaming Desk",
              source_url: "https://example.com/gaming-lead",
              region: "VN",
              language: "vi",
              trust_tier: "established-media",
              image_url: "https://images.example.com/gaming-lead.jpg",
              image_caption: "Ảnh tham khảo từ nguồn game.",
              image_credit: "Gaming Desk"
            }
          ]
        });
      const aiArticle = makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "OpenAI mở rộng trợ lý AI cho khối vận hành doanh nghiệp",
          slug: "openai-mo-rong-tro-ly-ai-cho-khoi-van-hanh-doanh-nghiep",
          summary: "Bài AI đủ mạnh, nhưng test này sẽ xác nhận rằng OpenClaw web control có thể đổi trọng số ưu tiên khi cần.",
          dek: "Bài AI đủ mạnh, nhưng test này sẽ xác nhận rằng OpenClaw web control có thể đổi trọng số ưu tiên khi cần.",
          hook: "Bài AI đủ mạnh, nhưng test này sẽ xác nhận rằng OpenClaw web control có thể đổi trọng số ưu tiên khi cần.",
          sections: [
            { heading: "Điều vừa xảy ra", body: "OpenAI mở rộng trợ lý AI cho khối vận hành, nhắm tới các tác vụ hỗ trợ đội chăm sóc khách hàng và nhóm vận hành nội bộ." },
            { heading: "Vì sao đáng chú ý", body: "Đây là nhóm tin cốt lõi của newsroom, thường được ưu tiên ở đầu trang vì liên quan trực tiếp tới AI ứng dụng và Big Tech." },
            { heading: "Điều cần theo dõi", body: "Điểm tiếp theo là mức độ mở rộng sang thị trường châu Á và cách hệ sinh thái doanh nghiệp phản ứng với nhịp thay đổi này." }
          ],
          image: {
            src: "https://images.example.com/ai-lead.jpg",
            caption: "Ảnh tham khảo từ nguồn AI.",
            credit: "AI Desk",
            source_url: "https://example.com/ai-lead"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "AI Desk",
              source_url: "https://example.com/ai-lead",
              region: "Global",
              language: "vi",
              trust_tier: "official",
              image_url: "https://images.example.com/ai-lead.jpg",
              image_caption: "Ảnh tham khảo từ nguồn AI.",
              image_credit: "AI Desk"
            }
          ]
        });
      const controlled = buildNewsroomState({
        siteUrl: "https://patricktech.media",
        storeUrl: "https://patricktechstore.vercel.app",
        externalArticles: [gamingArticle, aiArticle],
        webControl: {
          frontpageCopy: {
            vi: {
              heroTitle: "OpenClaw đang giữ nhịp mặt tiền theo dữ liệu nóng nhất."
            }
          },
          ranking: {
            topicWeights: {
              gaming: 220,
              ai: -20
            }
          }
        }
      });
      controlled.home = {
        vi: getHomeData(controlled, "vi"),
        en: getHomeData(controlled, "en")
      };
      const html = renderHomePage(controlled, "vi", { client: "", slots: {} });

      assert.equal(controlled.site.frontPageTopicWeights.gaming, 220);
      assert.equal(controlled.site.frontPageTopicWeights.ai, -20);
      assert.match(html, /OpenClaw đang giữ nhịp mặt tiền theo dữ liệu nóng nhất/);
    }
  },
  {
    name: "renders a news-first homepage and article community section",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });
      const article = state.articles.find((entry) => entry.language === "vi");
      const articleHtml = renderArticlePage(state, "vi", article, [], { client: "", slots: {} }, {
        feedback: {
          totalReactions: 3,
          totalComments: 1,
          reactions: [
            { id: "useful", emoji: "👍", label: "Hữu ích", count: 2 },
            { id: "love", emoji: "🔥", label: "Hay", count: 1 }
          ],
          comments: [{ id: "comment-1", author_name: "Phú", body: "Bài này khá sát với nhu cầu thực tế.", created_at: "2026-03-31T02:00:00.000Z" }]
        },
        notice: "",
        error: ""
      });

      assert.match(homeHtml, /Tin công nghệ mới nhất từ Việt Nam và thế giới/);
      assert.match(homeHtml, /Nóng lúc này/);
      assert.match(homeHtml, /Biên tập chọn/);
      assert.match(homeHtml, /Các tin vừa bật lên/);
      assert.match(homeHtml, /Patrick Tech Co\. VN/);
      assert.doesNotMatch(homeHtml, /3 bài giữ nhịp hôm nay/);
      assert.doesNotMatch(homeHtml, /Những chủ đề kéo độc giả vào đọc/);
      assert.doesNotMatch(homeHtml, /Dòng tin mới đang chạy trên trang chủ/);
      assert.doesNotMatch(homeHtml, /Vào trang chủ là biết nên đọc gì trước/);
      assert.match(articleHtml, /Bạn thấy bài này thế nào/);
      assert.match(articleHtml, /Gửi bình luận/);
      assert.match(articleHtml, /Hữu ích/);
    }
  },
  {
    name: "clips overlong homepage headlines so the front page stays readable",
    run() {
      const seedStories = state.articles.filter((entry) => entry.language === "vi").slice(0, 3);
      const scenario = buildScenarioState([
        {
          ...seedStories[0],
          id: "scenario-overlong-headline",
          cluster_id: "scenario-overlong-headline",
          slug: "patrick-tech-media-theo-doi-mot-cuoc-dua-ai-moi-giua-cac-ong-lon-cong-nghe",
          href: "/vi/tin-tuc/patrick-tech-media-theo-doi-mot-cuoc-dua-ai-moi-giua-cac-ong-lon-cong-nghe",
          title:
            "Patrick Tech Media theo dõi một cuộc đua AI mới giữa các ông lớn công nghệ với hàng loạt thay đổi sản phẩm, giá bán, đối tác phần cứng và cả những tác động chưa thể đo ngay trên thị trường việc làm khu vực",
          published_at: "2026-04-01T09:00:00.000Z",
          updated_at: "2026-04-01T09:00:00.000Z"
        },
        {
          ...seedStories[1],
          id: "scenario-overlong-headline-2",
          cluster_id: "scenario-overlong-headline-2",
          slug: "scenario-overlong-headline-2",
          href: "/vi/tin-tuc/scenario-overlong-headline-2",
          published_at: "2026-04-01T08:30:00.000Z",
          updated_at: "2026-04-01T08:30:00.000Z"
        },
        {
          ...seedStories[2],
          id: "scenario-overlong-headline-3",
          cluster_id: "scenario-overlong-headline-3",
          slug: "scenario-overlong-headline-3",
          href: "/vi/tin-tuc/scenario-overlong-headline-3",
          published_at: "2026-04-01T08:00:00.000Z",
          updated_at: "2026-04-01T08:00:00.000Z"
        }
      ]);
      const homeHtml = renderHomePage(scenario, "vi", { client: "", slots: {} });
      const leadHeadline = /<article class="lead-feature[\s\S]*?<h2><a href="[^"]+">([^<]+)<\/a><\/h2>/.exec(homeHtml)?.[1] || "";

      assert.match(leadHeadline, /Patrick Tech Media theo dõi một cuộc đua AI mới giữa các ông lớn công nghệ/);
      assert.match(leadHeadline, /…/);
      assert.doesNotMatch(leadHeadline, /tác động chưa thể đo ngay trên thị trường việc làm khu vực/);
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
      assert.equal(feed.items.length, state.articles.filter((article) => article.language === "vi").length);
      assert.match(feed.items[0].url, /\/vi\//);
    }
  },
  {
    name: "publishes only articles that are complete enough for the public site",
    run() {
      assert.ok(state.articles.length > 0);
      assert.ok(state.articles.every((article) => article.hero_image.kind === "source"));
      assert.ok(state.articles.every((article) => article.sections.length >= 3));
      assert.ok(state.articles.every((article) => article.summary.length >= 90));
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
        contentPath,
        webControl: {}
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
        image: {},
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
        contentPath,
        webControl: {}
      });
      const html = renderArticlePage(fileState, "en", fileState.articles[0], [], { client: "", slots: {} });

      assert.equal(fileState.articles[0].hero_image.kind, "source");
      assert.equal(fileState.articles[0].hero_image.src, "https://images.example.com/story.jpg");
      assert.match(html, /\/media\/source\?src=https%3A%2F%2Fimages\.example\.com%2Fstory\.jpg/);
      assert.match(html, /Tech Press/);
      assert.doesNotMatch(html, />undefined</);
    }
  },
  {
    name: "builds radar lanes for trend, emerging, and verified stories",
    run() {
      const radar = getRadarData(state, "en");
      assert.equal(radar.lanes.length, 3);
      assert.ok(radar.lanes.some((lane) => lane.stories.length > 0));
      assert.ok(radar.sourceMix.length > 0);
      assert.ok(radar.queue.length > 0);
    }
  },
  {
    name: "refresh accepts a local hidden feed file as an external newsroom source",
    run() {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-refresh-file-"));
      const sourcePath = path.join(tempDir, "hidden-feed.json");
      const outputPath = path.join(tempDir, "newsroom-content.json");
      const article = makeScenarioArticle({
        language: "vi",
        content_type: "NewsArticle",
        verification_state: "verified",
        title: "Patrick Tech Media nháº­n luá»“ng hidden feed cá»¥c bá»™ Ä‘á»ƒ cÃ³ thá»ƒ lĂ m má»›i newsroom mĂ  khĂ´ng cáº§n URL ngoĂ i",
        slug: "patrick-tech-media-nhan-luong-hidden-feed-cuc-bo-de-co-the-lam-moi-newsroom-ma-khong-can-url-ngoai",
        summary: "BĂ i kiá»ƒm tra nĂ y mĂ´ phá»ng hidden feed cá»¥c bá»™ Ä‘á»ƒ newsroom cĂ³ thá»ƒ Ä‘á»c payload JSON ngay trĂªn mĂ¡y vĂ  váº«n Ä‘i qua cĂ¹ng quality gate nhÆ° má»™t nguá»“n bên ngoĂ i.",
        dek: "Luá»“ng file cĂ¥c bá»™ giĂºp manager Ä‘á»“ng bá»™ vĂ²ng OpenClaw vá»›i newsroom mĂ  khĂ´ng pháº£i chá» endpoint xa, miá»…n lĂ  payload váº«n Ä‘á»§ title, hook, dek, section vĂ  nguá»“n.",
        hook: "Luá»“ng file cĂ¥c bá»™ giĂºp manager Ä‘á»“ng bá»™ vĂ²ng OpenClaw vá»›i newsroom mĂ  khĂ´ng pháº£i chá» endpoint xa, miá»…n lĂ  payload váº«n Ä‘á»§ title, hook, dek, section vĂ  nguá»“n Ä‘á»ƒ xuáº¥t báº£n.",
        sections: [
          {
            heading: "Luá»“ng feed",
            body: "Hidden feed trong bĂ i test nĂ y Ä‘Æ°á»£c ghi ra tá»« payload JSON cá»¥c bá»™, giá»¯ nguyĂªn title, nguá»“n, hĂ¬nh áº£nh vĂ  cáº¥u trĂºc section Ä‘á»ƒ refresh script cĂ³ thá»ƒ Ä‘á»c ná»‘i tiáº¿p nhÆ° má»™t external feed."
          },
          {
            heading: "Quality gate",
            body: "BĂ i máº«u váº«n Ä‘i qua cĂ¡c Ä‘iá»u kiá»‡n báº¯t buá»™c nhÆ° summary Ä‘á»§ dĂ i, dek rĂµ, hook hoĂ n chá»‰nh, nguá»“n áº£nh há»£p lá»‡ vĂ  ba section cá»§ thÃ¢n bĂ i khĂ´ng trá»‘ng."
          },
          {
            heading: "Káº¿t quáº£",
            body: "Khi manager Ä‘á»c Ä‘Æ°á»£c hidden feed cĂ¥c bá»™, nĂ³ cĂ³ thá»ƒ Ä‘Ă¡nh dáº¥u refresh á»Ÿ cháº¿ Ä‘á»™ external-feed thay vĂ¬ rÆ¡i xuá»‘ng curated-rss, tá»« Ä‘Ă³ giĂºp OpenClaw tháº­t sá»± nắm newsroom cycle."
          }
        ],
        image: {
          src: "https://images.example.com/openclaw-hidden-feed.jpg",
          caption: "áº¢nh tham kháº£o tá»« luá»“ng hidden feed cá»¥c bá»™.",
          credit: "Patrick Tech Media",
          source_url: "https://example.com/openclaw-hidden-feed"
        },
        source_set: [
          {
            source_type: "editorial-research",
            source_name: "Patrick Tech Media",
            source_url: "https://example.com/openclaw-hidden-feed",
            region: "VN",
            language: "vi",
            trust_tier: "editorial",
            image_url: "https://images.example.com/openclaw-hidden-feed.jpg",
            image_caption: "áº¢nh tham kháº£o tá»« luá»“ng hidden feed cá»¥c bá»™.",
            image_credit: "Patrick Tech Media"
          }
        ]
      });

      fs.writeFileSync(sourcePath, JSON.stringify({ articles: [article] }, null, 2), "utf8");

      const result = spawnSync(process.execPath, ["scripts/newsroom-refresh.mjs"], {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          NEWSROOM_PULL_URL: "",
          OPENCLAW_NEWSROOM_URL: "",
          NEWSROOM_PULL_FILE: sourcePath,
          OPENCLAW_NEWSROOM_FILE: "",
          NEWSROOM_CONTENT_PATH: outputPath
        },
        encoding: "utf8"
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /external-feed/);

      const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.equal(output.articles.length, 1);
      assert.equal(output.articles[0].slug, article.slug);
    }
  },
  {
    name: "refresh repairs common mojibake from mixed RSS and HTML encodings",
    run() {
      const brokenOpen = "\u00e2\u20ac\u02dc";
      const brokenClose = "\u00e2\u20ac\u2122";
      const brokenDash = "\u00e2\u20ac\u201d";
      const brokenOpenDouble = "\u00e2\u20ac\u0153";
      const brokenCloseDouble = "\u00e2\u20ac\u009d";
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-refresh-fix-"));
      const sourcePath = path.join(tempDir, "hidden-feed.json");
      const outputPath = path.join(tempDir, "newsroom-content.json");
      const article = makeScenarioArticle({
        language: "en",
        content_type: "NewsArticle",
        verification_state: "verified",
        title: `Google Photos is losing some of its editing shortcuts to ${brokenOpen}reduce accidental triggers${brokenClose}`,
        slug: "google-photos-is-losing-some-of-its-editing-shortcuts-to-reduce-accidental-triggers",
        summary: `Google Photos has become much more than a way to manage and backup your photos and videos, especially in the age of AI. Not everyone needs ${brokenDash} or, more accurately, wants ${brokenDash} to trigger these functions on a regular basis, though, and a new update is helping to eliminate those annoying pop-ups.`,
        dek: "Google Photos has become much more than a way to manage and backup your photos and videos, especially in the age of AI, and the latest cleanup is meant to reduce accidental triggers.",
        hook: `Google Photos has become much more than a way to manage and backup your photos and videos, especially in the age of AI. Not everyone needs ${brokenDash} or, more accurately, wants ${brokenDash} to trigger these functions on a regular basis, though, and a new update is helping to eliminate those annoying pop-ups.`,
        sections: [
          {
            heading: "What happened",
            body: `Google Photos has become much more than a way to manage and backup your photos and videos, especially in the age of AI. Not everyone needs ${brokenDash} or, more accurately, wants ${brokenDash} to trigger these functions on a regular basis, though, and a new update is helping to eliminate those annoying pop-ups.`
          },
          {
            heading: "Why it matters",
            body: `Google is removing shortcuts you might have been using to access editing tools in Photos on Android, all in the name of ${brokenOpenDouble}reducing accidental triggers.${brokenCloseDouble} The practical effect is a calmer editor and fewer unwanted jumps into AI tools.`
          },
          {
            heading: "What to watch next",
            body: "The next thing to watch is whether the cleaner interaction model rolls out across Android first and then shows up in the web editor, with the same focus on making common actions feel direct again."
          }
        ],
        image: {
          src: "https://images.example.com/google-photos.jpg",
          caption: "Reference image from the source story.",
          credit: "Android Authority",
          source_url: "https://example.com/google-photos"
        },
        source_set: [
          {
            source_type: "press",
            source_name: "Android Authority",
            source_url: "https://example.com/google-photos",
            region: "Global",
            language: "en",
            trust_tier: "established-media",
            image_url: "https://images.example.com/google-photos.jpg",
            image_caption: "Reference image from the source story.",
            image_credit: "Android Authority"
          }
        ]
      });

      fs.writeFileSync(sourcePath, JSON.stringify({ articles: [article] }, null, 2), "utf8");

      const result = spawnSync(process.execPath, ["scripts/newsroom-refresh.mjs"], {
        cwd: path.resolve(process.cwd()),
        env: {
          ...process.env,
          NEWSROOM_PULL_URL: "",
          OPENCLAW_NEWSROOM_URL: "",
          NEWSROOM_PULL_FILE: sourcePath,
          OPENCLAW_NEWSROOM_FILE: "",
          NEWSROOM_CONTENT_PATH: outputPath
        },
        encoding: "utf8"
      });

      assert.equal(result.status, 0, result.stderr || result.stdout);

      const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      const published = output.articles[0];
      const blob = JSON.stringify(published);

      assert.doesNotMatch(blob, /\u00e2\u20ac|\u00c3|\u00c2/);
      assert.match(published.title, /‘reduce accidental triggers’/);
      assert.match(published.summary, /everyone needs — or, more accurately, wants —/);
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
    storeUrl: "https://patricktechstore.vercel.app",
    webControl: {}
  });
  newsroom.home = {
    vi: getHomeData(newsroom, "vi"),
    en: getHomeData(newsroom, "en")
  };
  return newsroom;
}

function buildScenarioState(injectedArticles) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-scenario-"));
  const contentPath = path.join(tempDir, "newsroom-content.json");
  fs.writeFileSync(contentPath, JSON.stringify({ articles: [] }, null, 2), "utf8");

  const newsroom = buildNewsroomState({
    siteUrl: "https://patricktech.media",
    storeUrl: "https://patricktechstore.vercel.app",
    contentPath,
    injectedArticles,
    webControl: {}
  });

  newsroom.home = {
    vi: getHomeData(newsroom, "vi"),
    en: getHomeData(newsroom, "en")
  };

  return newsroom;
}

function makeScenarioArticle(overrides) {
  const language = overrides.language === "en" ? "en" : "vi";
  const segmentByType = {
    NewsArticle: language === "vi" ? "tin-tuc" : "news",
    EvergreenGuide: language === "vi" ? "huong-dan" : "guides",
    ComparisonPage: language === "vi" ? "so-sanh" : "compare"
  };

  return {
    id: `scenario-${overrides.slug}-${language}`,
    cluster_id: `scenario-${overrides.slug}`,
    language,
    topic: overrides.topic || "ai",
    content_type: overrides.content_type || "NewsArticle",
    slug: overrides.slug,
    title: overrides.title,
    summary: overrides.summary,
    dek: overrides.dek,
    hook: overrides.hook,
    sections: overrides.sections,
    verification_state: overrides.verification_state || "emerging",
    quality_score: 90,
    ad_eligible: overrides.verification_state !== "trend",
    show_editorial_label: false,
    indexable: true,
    store_link_mode: "soft",
    related_store_items: ["ai-workspace-bundle"],
    source_set: overrides.source_set,
    author_id: "mai-linh",
    published_at: overrides.published_at || "2026-03-31T10:00:00.000Z",
    updated_at: overrides.updated_at || overrides.published_at || "2026-03-31T10:00:00.000Z",
    image: overrides.image,
    href: `/${language}/${segmentByType[overrides.content_type || "NewsArticle"]}/${overrides.slug}`
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
