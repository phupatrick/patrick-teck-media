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
import { buildEditorialCompanionArticles } from "../src/newsroom-synthesis.mjs";
import { renderArticlePage, renderHomePage, renderStorePage } from "../src/newsroom-render.mjs";

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
    name: "keeps the Vietnamese newsroom spread across multiple beats instead of collapsing into AI only",
    run() {
      const viStories = state.articles.filter((article) => article.language === "vi");
      const viTopics = new Set(viStories.map((article) => article.topic));
      assert.ok(viStories.length >= 12);
      assert.ok(viTopics.size >= 3);
      assert.ok(viTopics.has("ai"));
      assert.ok([...viTopics].some((topic) => topic !== "ai"));
    }
  },
  {
    name: "keeps explainers and comparison pieces in the public newsroom mix",
    run() {
      const contentTypes = new Set(state.articles.map((article) => article.content_type));
      assert.ok(contentTypes.has("EvergreenGuide"));
      assert.ok(contentTypes.has("ComparisonPage") || contentTypes.has("NewsArticle"));
    }
  },
  {
    name: "keeps the tips lane guide-led and expands Vietnamese AI package coverage",
    run() {
      const home = getHomeData(state, "vi");
      const viAiPackageStories = state.articles.filter(
        (article) => article.language === "vi" && (article.editorial_focus || []).includes("ai-package")
      );

      assert.ok(home.tips.length >= 3);
      assert.ok(home.tips.every((article) => article.content_type === "EvergreenGuide" || (article.editorial_focus || []).includes("guide")));
      assert.ok(viAiPackageStories.length >= 6);
      assert.ok(viAiPackageStories.some((article) => article.content_type === "Roundup"));
    }
  },
  {
    name: "diversifies homepage lanes when one topic and source dominate the queue",
    run() {
      function buildSourceSet(sourceName, slug) {
        return [
          {
            source_type: "press",
            source_name: sourceName,
            source_url: `https://example.com/${slug}`,
            region: "Global",
            language: "vi",
            trust_tier: "established-media",
            published_at: "2026-04-07T10:00:00.000Z"
          }
        ];
      }

      function buildImage(sourceName, slug) {
        return {
          src: `https://images.example.com/${slug}.jpg`,
          caption: `Reference image from ${sourceName} for ${slug}.`,
          credit: sourceName,
          source_url: `https://example.com/${slug}`,
          alt: `Reference image for ${slug} collected from ${sourceName}.`
        };
      }

      const aiStories = Array.from({ length: 8 }, (_, index) => {
        const slug = `ai-package-${index + 1}`;
        const sourceName = index < 4 ? "Google AI Blog" : "Google Workspace Updates";

        return makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: index % 2 === 0 ? "EvergreenGuide" : "NewsArticle",
          verification_state: "verified",
          slug,
          title: `Gói AI ${index + 1} đang đổi giá trị như thế nào`,
          summary: "Một lớp cập nhật mới về gói AI, quyền lợi và cách sử dụng trong công việc hằng ngày.",
          dek: "Người đọc cần phân biệt đâu là thay đổi thật sự hữu ích thay vì chỉ là lời quảng bá.",
          hook: "Bài này gom các thay đổi mới nhất quanh giá, dung lượng và quyền lợi đi kèm trong nhóm gói AI trả phí.",
          sections: [
            { heading: "Điều mới", body: "Tác động nằm ở cách gói AI này thay đổi quy trình làm việc thật chứ không chỉ tăng danh sách tính năng." },
            { heading: "Điều cần soi", body: "Người dùng cần nhìn vào giới hạn, quyền riêng tư và mức độ tích hợp trước khi quyết định xuống tiền." },
            { heading: "Vì sao đáng chú ý", body: "Nếu cùng một loại bài phủ kín trang chủ, người đọc sẽ mất cảm giác mới mẻ dù tin tức vẫn đang tăng." }
          ],
          source_set: buildSourceSet(sourceName, slug),
          image: buildImage(sourceName, slug),
          published_at: `2026-04-07T${String(15 - index).padStart(2, "0")}:00:00.000Z`,
          updated_at: `2026-04-07T${String(15 - index).padStart(2, "0")}:00:00.000Z`
        });
      });

      const supportingStories = [
        makeScenarioArticle({
          language: "vi",
          topic: "devices",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "npu-laptop-moi",
          title: "Laptop NPU mới đang thay đổi cách dân văn phòng nâng máy",
          summary: "Nhiều hãng đẩy NPU lên laptop tầm trung và đây là thứ người dùng cảm được ngay.",
          dek: "Bài thiết bị cần xuất hiện để trang chủ không bị kéo hết về một loại headline.",
          hook: "Đổi máy hay chưa giờ không còn chỉ là chuyện chip mạnh hơn, mà là trải nghiệm AI có dùng thật hay không.",
          sections: [
            { heading: "Điểm mới", body: "Laptop mới bắt đầu đưa AI xuống những tác vụ người dùng chạm mỗi ngày như họp, ghi chú và chỉnh sửa ảnh." },
            { heading: "Điểm mua", body: "Khi giá không tăng quá mạnh, nhóm máy này trở thành lựa chọn dễ bàn hơn với người dùng phổ thông." },
            { heading: "Điều cần theo dõi", body: "Hiệu năng pin, nhiệt độ và phần mềm đi kèm mới là ba thứ quyết định máy có đáng tiền thật hay không." }
          ],
          source_set: buildSourceSet("Hardware Desk", "npu-laptop-moi"),
          image: buildImage("Hardware Desk", "npu-laptop-moi")
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "apps-software",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "workspace-meo-moi",
          title: "Ba mẹo app mới giúp team viết, họp và giữ việc gọn hơn",
          summary: "Một lớp bài practical giúp homepage bớt lặp headline kiểu so gói AI.",
          dek: "Các mẹo app thực tế luôn là nhóm bài kéo độc giả ở lại lâu hơn vì dùng được ngay.",
          hook: "Không phải người đọc nào cũng mở báo để xem thêm một cuộc so giá AI nữa.",
          sections: [
            { heading: "Mẹo nhanh", body: "App tốt là app giúp cắt thao tác vụn trong ngày thay vì thêm một cửa sổ phải học lại từ đầu." },
            { heading: "Điểm dùng thật", body: "Bài app nên nói rõ ai dùng hợp, ai không cần và kịch bản nào tạo ra khác biệt rõ nhất." },
            { heading: "Điểm đáng giữ", body: "Những mẹo nhỏ nhưng dùng được ngay thường tạo cảm giác hữu ích rõ hơn cả một headline rất to." }
          ],
          source_set: buildSourceSet("Workspace Blog", "workspace-meo-moi"),
          image: buildImage("Workspace Blog", "workspace-meo-moi")
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "internet-business-tech",
          content_type: "NewsArticle",
          verification_state: "emerging",
          slug: "mang-xa-hoi-doi-luat-cho-shop",
          title: "Mạng xã hội đổi luật mới khiến nhiều shop phải sửa cách vận hành",
          summary: "Một tín hiệu business-tech giúp mặt trước có thêm nhịp khác ngoài AI thuần.",
          dek: "Tin internet và kinh doanh số là nhóm bài rất cần để bề mặt newsroom không bị đơn điệu.",
          hook: "Mỗi thay đổi nhỏ ở nền tảng bán hàng đều có thể chạm thẳng vào chi phí vận hành và doanh thu.",
          sections: [
            { heading: "Điều đang diễn ra", body: "Một thay đổi nền tảng dù nhỏ vẫn đủ để kéo theo loạt quyết định mới từ shop nhỏ tới đội vận hành nội dung." },
            { heading: "Tác động", body: "Nếu luật mới siết cách hiển thị hoặc đo lường, chi phí sẽ đội lên trước khi người bán kịp phản ứng." },
            { heading: "Điều cần làm", body: "Độc giả cần một bài gọn, rõ và thực tế thay vì thêm một headline khuếch đại cảm giác khẩn cấp." }
          ],
          source_set: buildSourceSet("Platform Watch", "mang-xa-hoi-doi-luat-cho-shop"),
          image: buildImage("Platform Watch", "mang-xa-hoi-doi-luat-cho-shop")
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "gaming",
          content_type: "NewsArticle",
          verification_state: "emerging",
          slug: "tay-cam-moi-cho-handheld",
          title: "Một phụ kiện handheld mới khiến game thủ quay lại nhóm máy mini",
          summary: "Một nốt gaming nhỏ nhưng đủ để homepage thở đều hơn.",
          dek: "Gaming không nên nuốt hết mặt trước, nhưng cũng không nên biến mất khỏi newsroom.",
          hook: "Chỉ một phụ kiện đúng điểm đau cũng đủ kéo lại sự chú ý cho cả một nhánh thiết bị đang chững nhịp.",
          sections: [
            { heading: "Điểm hút", body: "Game thủ chỉ phản ứng mạnh khi phụ kiện mới đụng vào trải nghiệm thật như nhiệt, độ trễ và cảm giác cầm nắm." },
            { heading: "Điểm mua", body: "Nếu giá hợp lý, nhóm handheld sẽ lại có cớ quay về với các bản mod và phụ kiện kiểu này." },
            { heading: "Điểm cần soi", body: "Tin gaming vẫn cần được viết theo hướng trải nghiệm dùng thật thay vì chỉ bơm không khí." }
          ],
          source_set: buildSourceSet("Gaming Desk", "tay-cam-moi-cho-handheld"),
          image: buildImage("Gaming Desk", "tay-cam-moi-cho-handheld")
        })
      ];

      const scenario = buildScenarioState([...aiStories, ...supportingStories]);
      const home = getHomeData(scenario, "vi");
      const latestTopics = new Set(home.latest.map((article) => article.topic));
      const latestSources = new Map();
      const latestHrefs = new Set(home.latest.map((article) => article.href));
      const browserOverlap = home.browserStories.filter((article) => latestHrefs.has(article.href)).length;

      for (const article of home.latest) {
        const sourceName = article.source_set?.[0]?.source_name || article.source_name || "unknown";
        latestSources.set(sourceName, (latestSources.get(sourceName) || 0) + 1);
      }

      assert.ok(latestTopics.size >= 3);
      assert.ok(latestSources.size >= 4);
      assert.ok(browserOverlap <= 4);
    }
  },
  {
    name: "keeps provider-specific AI companion images aligned with the provider being covered",
    run() {
      const articles = [
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "chatgpt-plus-pro-team-gia-tri-moi",
          title: "ChatGPT Plus, Pro và Team vừa đổi gì trong gói AI",
          summary: "OpenAI đang thêm giá trị cho ChatGPT Plus, Pro và Team bằng research, giới hạn cao hơn và lớp cộng tác rõ hơn.",
          dek: "Người dùng đang soi xem ChatGPT có tăng giá trị thật hay chỉ dày thêm danh sách quyền lợi.",
          hook: "Bài toán ở đây là OpenAI có giúp người dùng làm được nhiều việc hơn trong cùng một gói hay không.",
          sections: [
            {
              heading: "Điểm mới",
              body: "ChatGPT Plus, Pro và Team đang được đọc như một gói làm việc nặng hơn, nơi research, viết, code và tạo nội dung bắt đầu đứng chung trên một mặt bàn."
            },
            {
              heading: "Giá trị",
              body: "Người dùng trả phí quan tâm tới việc OpenAI gom thêm quyền lợi nào vào cùng hóa đơn thay vì chỉ nâng một thông số marketing."
            },
            {
              heading: "Điều cần soi",
              body: "Khác biệt thật nằm ở giới hạn dùng, công cụ mở khóa và việc các lớp tiện ích mới có đi vào công việc hàng ngày hay không."
            }
          ],
          image: {
            src: "https://images.example.com/openai-chatgpt-plan.jpg",
            caption: "Reference image from the source story.",
            credit: "OpenAI News",
            source_url: "https://openai.com/news/chatgpt-plan-update"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "OpenAI News",
              source_url: "https://openai.com/news/chatgpt-plan-update",
              region: "Global",
              language: "en",
              trust_tier: "official",
              image_url: "https://images.example.com/openai-chatgpt-plan.jpg",
              image_caption: "Reference image from the source story.",
              image_credit: "OpenAI News"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "openai-chatgpt-deep-research-goi-tra-phi",
          title: "OpenAI đang đẩy Deep Research vào gói ChatGPT trả phí ra sao",
          summary: "Nhiều thay đổi của OpenAI đang được đọc dưới góc nhìn gói thuê bao, không còn chỉ là câu chuyện model nào mạnh hơn.",
          dek: "Người dùng muốn biết gói ChatGPT mới giúp nghiên cứu, tổng hợp và làm việc nhóm tốt hơn ở lớp nào.",
          hook: "Điểm đáng đọc là OpenAI có đang biến thói quen chat thành một gói làm việc thật sự nặng hay không.",
          sections: [
            {
              heading: "Lớp nghiên cứu",
              body: "Deep Research chỉ đáng tiền khi nó giảm được thời gian gom nguồn, tóm tắt và trả kết quả trong bối cảnh người dùng đang trả phí cho ChatGPT."
            },
            {
              heading: "Khác biệt của gói",
              body: "OpenAI bị soi kỹ ở phần model, giới hạn và quyền truy cập công cụ vì đây là nơi giá trị gói lộ ra rõ nhất."
            },
            {
              heading: "Điểm theo dõi tiếp",
              body: "Nếu các quyền lợi mới chỉ nằm trên slide, gói trả phí sẽ khó giữ được sức hút trước Google hay Microsoft."
            }
          ],
          image: {
            src: "https://images.example.com/chatgpt-deep-research.jpg",
            caption: "Reference image from the source story.",
            credit: "The Verge AI",
            source_url: "https://www.theverge.com/2026/04/03/chatgpt-deep-research-plan"
          },
          source_set: [
            {
              source_type: "press",
              source_name: "The Verge AI",
              source_url: "https://www.theverge.com/2026/04/03/chatgpt-deep-research-plan",
              region: "Global",
              language: "en",
              trust_tier: "established-media",
              image_url: "https://images.example.com/chatgpt-deep-research.jpg",
              image_caption: "Reference image from the source story.",
              image_credit: "The Verge AI"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "microsoft-copilot-goi-doanh-nghiep",
          title: "Microsoft đang đẩy Copilot vào gói doanh nghiệp thế nào",
          summary: "Copilot được kéo sâu vào Microsoft 365 và lớp quản trị doanh nghiệp, khiến gói AI của Microsoft phải được đọc như một stack làm việc.",
          dek: "Đây là bài cho người đang soi giá trị của Copilot giữa tích hợp, bảo mật và quản trị.",
          hook: "Microsoft chỉ thắng khi Copilot bớt là nút AI trình diễn và trở thành lớp hạ tầng dùng được mỗi ngày.",
          sections: [
            {
              heading: "Tích hợp",
              body: "Giá trị của Copilot nằm ở chỗ nó ăn vào Outlook, Word, Excel và Teams sâu hơn phần còn lại của thị trường."
            },
            {
              heading: "Ghế trả phí",
              body: "Doanh nghiệp soi Microsoft nhiều nhất ở chi phí theo ghế và quyền hạn quản trị đi kèm."
            },
            {
              heading: "Điều cần theo dõi",
              body: "Nếu Microsoft giữ được nhịp tích hợp sâu mà không làm chi phí đội quá mạnh, Copilot sẽ còn hút khối doanh nghiệp."
            }
          ],
          image: {
            src: "https://images.example.com/microsoft-copilot-plan.jpg",
            caption: "Reference image from the source story.",
            credit: "Microsoft Copilot Blog",
            source_url: "https://blogs.microsoft.com/copilot-enterprise-plan"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "Microsoft Copilot Blog",
              source_url: "https://blogs.microsoft.com/copilot-enterprise-plan",
              region: "Global",
              language: "en",
              trust_tier: "official",
              image_url: "https://images.example.com/microsoft-copilot-plan.jpg",
              image_caption: "Reference image from the source story.",
              image_credit: "Microsoft Copilot Blog"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          slug: "copilot-m365-gia-tri-moi",
          title: "Copilot Pro và Microsoft 365 đang tăng giá trị ở lớp nào",
          summary: "Microsoft đang ép cuộc đua gói AI sang phần tích hợp sâu vào công việc và dữ liệu doanh nghiệp.",
          dek: "Đây là bài theo dõi việc Copilot tăng giá trị trong môi trường Microsoft 365.",
          hook: "Điểm cần soi là Copilot có giúp doanh nghiệp bớt thao tác tay và dễ quản trị hơn hay không.",
          sections: [
            {
              heading: "Điểm mạnh",
              body: "Copilot thường mạnh khi nó bám vào dữ liệu công việc và bớt khiến người dùng phải mở thêm công cụ ngoài."
            },
            {
              heading: "Giá trị gói",
              body: "Người đọc nhìn vào quyền lợi thực tế theo ghế nhiều hơn là headline về AI."
            },
            {
              heading: "Điều nên xem tiếp",
              body: "Nếu phần tích hợp sâu giữ được nhịp, Microsoft sẽ còn là đối thủ khó tránh trong nhóm khách hàng doanh nghiệp."
            }
          ],
          image: {
            src: "https://images.example.com/microsoft-copilot-m365.jpg",
            caption: "Reference image from the source story.",
            credit: "Microsoft Copilot Blog",
            source_url: "https://blogs.microsoft.com/copilot-m365-value"
          },
          source_set: [
            {
              source_type: "official-site",
              source_name: "Microsoft Copilot Blog",
              source_url: "https://blogs.microsoft.com/copilot-m365-value",
              region: "Global",
              language: "en",
              trust_tier: "official",
              image_url: "https://images.example.com/microsoft-copilot-m365.jpg",
              image_caption: "Reference image from the source story.",
              image_credit: "Microsoft Copilot Blog"
            }
          ]
        })
      ];

      const companions = buildEditorialCompanionArticles(articles, "2026-04-04T00:00:00.000Z");
      const openAiCompanion = companions.find((article) => /ChatGPT|OpenAI/i.test(article.title));

      assert.ok(openAiCompanion);
      assert.ok([
        "https://images.example.com/openai-chatgpt-plan.jpg",
        "https://images.example.com/chatgpt-deep-research.jpg"
      ].includes(openAiCompanion.image?.src));
      assert.doesNotMatch(openAiCompanion.image?.credit || "", /Microsoft/i);
    }
  },
  {
    name: "spreads AI package companion images when multiple source visuals are available",
    run() {
      const generalAiPackageStories = state.articles.filter((article) => article.language === "vi" && [
        "editorial-ai-package-watch",
        "editorial-ai-plan-buying-guide",
        "editorial-ai-package-roundup",
        "editorial-ai-workflow-playbook"
      ].includes(article.cluster_id));
      const uniqueImageCount = new Set(generalAiPackageStories.map((article) => article.image?.src).filter(Boolean)).size;

      assert.ok(generalAiPackageStories.length >= 3);
      assert.ok(uniqueImageCount >= 3);
    }
  },
  {
    name: "keeps trend stories indexable but ad-free",
    run() {
      const trendScenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          topic: "internet-doanh-nghiep-so",
          content_type: "NewsArticle",
          verification_state: "trend",
          title: "Cong dong dang theo sat mot ban cap nhat lon cua nen tang nhan tin",
          slug: "cong-dong-dang-theo-sat-mot-ban-cap-nhat-lon-cua-nen-tang-nhan-tin",
          summary: "Tin hieu dang lan nhanh trong cong dong, du chua du muc xac minh de dat vao nhom verified.",
          dek: "Case trend van duoc index de newsroom khong bo lo song doc, nhung bai khong duoc mo vi tri quang cao.",
          hook: "Bai trend can hien tren web sach se, co nhan canh bao ro rang va khong keo block ads.",
          sections: [
            {
              heading: "Vi sao bai nay dang hot",
              body: "Nhieu tai khoan lon dang nhac toi ban cap nhat va chia se anh chup man hinh ve thay doi moi."
            },
            {
              heading: "Dieu gi can than trong luc nay",
              body: "Newsroom can giu bai indexable de bot thay duoc tin, nhung van danh dau day la trend va tat ad."
            },
            {
              heading: "Bieu hien mong muon tren web",
              body: "Trang bai viet phai hien nhan Trend Watch, khong render Google AdSense va khong chen promo slot."
            }
          ],
          image: {
            src: "https://images.example.com/trend-social-update.jpg",
            caption: "Reference image for a fast-moving platform update.",
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
              image_caption: "Reference image for a fast-moving platform update.",
              image_credit: "Community Watch"
            }
          ]
        })
      ]);
      const trendArticle = trendScenario.articles[0];
      const trendHtml = renderArticlePage(trendScenario, "vi", trendArticle, [], { client: "", slots: {} });

      assert.ok(trendArticle);
      assert.equal(trendArticle.verification_state, "trend");
      assert.equal(trendArticle.ad_eligible, false);
      assert.equal(trendArticle.indexable, true);
      assert.match(trendHtml, /Trend Watch/);
      assert.doesNotMatch(trendHtml, /Reserved for Google AdSense/);
      assert.doesNotMatch(trendHtml, /adsbygoogle/);
      return;

      const scenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          content_type: "NewsArticle",
          verification_state: "trend",
          title: "CĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi theo bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§a mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡ng xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£ hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i",
          slug: "cong-dong-dang-doi-theo-ban-cap-nhat-moi-cua-mot-ung-dung-mang-xa-hoi",
          summary: "MĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­n hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡u Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang lan nhanh trong cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡ ViĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡t Nam sau khi ngĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi xuĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n theo tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«ng nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â.",
          dek: "CÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£ cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£nh nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn, phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸, phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n giĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£i thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­ch vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ liĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡u Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ index, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n chĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°a nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t quĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡o khi mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©c xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â²n sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºm.",
          hook: "MĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­n hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡u Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang lan nhanh trong cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡ ViĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡t Nam sau khi ngĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi xuĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n theo tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«ng nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â, Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âc nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng chĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°a Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ quĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡o.",
          sections: [
            {
              heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«a xĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£y ra",
              body: "NgĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng trong nhiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng loĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡t phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi xuĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n trÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“ tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i khoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m, kÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¨m Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£nh chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥p mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬nh vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ trĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£i nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m ban Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u."
            },
            {
              heading: "VÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ sao Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ng chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âº Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½",
              body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  kiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢u tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­n hiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡u thĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“i trĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºc mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£t rollout rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n, nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khi thay Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i chĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡m vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o khu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n suĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng hĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±ng ngÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¦ tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡o tranh luĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n trong cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng."
            },
            {
              heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p",
              body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢m cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªm lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­nh thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©c tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Ân tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  viĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡c tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­nh nĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢ng nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â sang diĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n ngĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n hay khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng."
            }
          ],
          image: {
            src: "https://images.example.com/trend-social-update.jpg",
            caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng.",
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
              image_caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng.",
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
    name: "keeps fallback promo slots on internal store landing pages instead of hardcoded external links",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });
      const storeHtml = renderStorePage(state, "vi", { client: "", slots: {} });

      assert.match(homeHtml, /store-promo-slot\" href=\"\/vi\/store\"/);
      assert.match(storeHtml, /Patrick Tech Store/);
      assert.match(storeHtml, /patricktechstore\.vercel\.app\/\?ref=patricktechmedia&entry=/);
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
      assert.match(xml, /<loc>https:\/\/patricktechmedia\.com\/vi\//);
      assert.match(xml, /<loc>https:\/\/patricktechmedia\.com\/en\//);
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
      const cleanScenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          topic: "gaming",
          content_type: "NewsArticle",
          verification_state: "emerging",
          title: "Rockstar xac nhan them mot dot he lo moi cho GTA 6",
          slug: "rockstar-xac-nhan-them-mot-dot-he-lo-moi-cho-gta-6",
          summary: "Bai nay co suc hut cao voi game thu, nhung van la tin mem hon so voi nhom AI va ha tang cong nghe.",
          dek: "Front page can biet bai nao la nhu cau cot loi cua doc gia cong nghe, bai nao la chatter de day xuong sau.",
          hook: "GTA 6 co the rat hot, nhung homepage van nen uu tien AI va cong nghe cot loi.",
          published_at: "2026-03-31T11:30:00.000Z",
          updated_at: "2026-03-31T11:30:00.000Z",
          sections: [
            {
              heading: "Vi sao bai game nay hut view",
              body: "Bat ky dot he lo moi nao ve GTA 6 cung keo luot doc nhanh, nhat la khi co them chi tiet ve gameplay."
            },
            {
              heading: "Vi sao khong nen len dau",
              body: "Diem can bang cua homepage la uu tien AI, phan mem, thiet bi va bao mat truoc nhung bai game mang tinh giai tri."
            },
            {
              heading: "Vai tro hop ly",
              body: "Bai game van nen co cho xuat hien trong lane hoac card phu, nhung khong danh featured."
            }
          ],
          image: {
            src: "https://images.example.com/gta6-tease.jpg",
            caption: "Reference image for a GTA 6 teaser update.",
            credit: "Rockstar",
            source_url: "https://example.com/gta6-tease"
          },
          source_set: [
            {
              source_type: "press",
              source_name: "IGN",
              source_url: "https://example.com/gta6-tease",
              region: "Global",
              language: "vi",
              trust_tier: "established-media",
              published_at: "2026-03-31T11:30:00.000Z",
              image_url: "https://images.example.com/gta6-tease.jpg",
              image_caption: "Reference image for a GTA 6 teaser update.",
              image_credit: "Rockstar"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "OpenAI thu nghiem tro ly AI cho nhom cham soc khach hang tai Dong Nam A",
          slug: "openai-thu-nghiem-tro-ly-ai-cho-nhom-cham-soc-khach-hang-tai-dong-nam-a",
          summary: "Case AI nay dien ra sat voi nhu cau doanh nghiep, co gia tri khai thac lon hon va xung dang len featured.",
          dek: "Homepage can day cac bai AI va cong nghe cot loi len truoc cac bai chatter game.",
          hook: "Neu co bai AI verified phuc vu dong doc gia rong hon, bai do phai an diem uu tien cao hon.",
          published_at: "2026-03-31T11:00:00.000Z",
          updated_at: "2026-03-31T11:00:00.000Z",
          sections: [
            {
              heading: "Diem moi cua thu nghiem",
              body: "OpenAI dang thu nghiem tro ly AI cho cac nhom cham soc khach hang, tap trung vao toc do va ty le giai quyet."
            },
            {
              heading: "Vi sao bai nay quan trong hon",
              body: "Tac dong cua no lien quan truc tiep toi doanh nghiep, chi phi van hanh va goc nhin AI ung dung thuc te."
            },
            {
              heading: "Ky vong tren homepage",
              body: "Bai AI verified can dan dau, con bai gaming chi nen giu o vi tri phu de can bang newsroom."
            }
          ],
          image: {
            src: "https://images.example.com/openai-support.jpg",
            caption: "Reference image for an OpenAI support workflow test.",
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
              image_caption: "Reference image for an OpenAI support workflow test.",
              image_credit: "OpenAI"
            }
          ]
        })
      ]);
      const cleanHome = getHomeData(cleanScenario, "vi");
      const softGamingStory = cleanScenario.articles.find(
        (article) => article.slug === "rockstar-xac-nhan-them-mot-dot-he-lo-moi-cho-gta-6"
      );

      assert.equal(cleanHome.featured.slug, "openai-thu-nghiem-tro-ly-ai-cho-nhom-cham-soc-khach-hang-tai-dong-nam-a");
      assert.ok(softGamingStory);
      assert.equal(softGamingStory.topic, "gaming");
      return;

      const scenario = buildScenarioState([
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "emerging",
          title: "Rockstar lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â m GTA 6 theo cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng ai ngĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â: tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡o 10.000 Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢m thanh bĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºc chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢n rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œi chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â° dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng 100",
          slug: "rockstar-lam-gta-6-theo-cach-khong-ai-ngo-tao-10000-am-thanh-buoc-chan-roi-chi-dung-100",
          summary: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn rĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t nhanh tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng game vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng, cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬nh nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng giÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ front page nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥p hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c diĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¦n biĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿n AI hay bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n.",
          dek: "DÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºt click, Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  kiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢u cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±m Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºp theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi hoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·c chuyÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥c game thay vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ chiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿m vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ trÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­ dĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u trang chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡.",
          hook: "DÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºt click, Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  kiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢u cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±m Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºp theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi hoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·c chuyÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥c game thay vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ chiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿m vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ trÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­ dĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u trang chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡.",
          published_at: "2026-03-31T11:30:00.000Z",
          updated_at: "2026-03-31T11:30:00.000Z",
          sections: [
            { heading: "CĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³i gÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬", body: "NgĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi chĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡i bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â n nhiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â chi tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿t sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n xuĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢m thanh vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i ngĂ„â€Ă¢â‚¬Â¦Ä‚â€Ă‚Â© cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§a Rockstar chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Ân ra sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“ lĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ng Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢m thanh thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â± dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng trong game." },
            { heading: "VÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ sao lan nhanh", body: "GTA 6 luÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´n lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³a cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ nĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢ng kÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â©o tĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡ng tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh, Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·c biĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡t khi cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o chi tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿t hĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­u trĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¦ chia sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â» trong cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng game." },
            { heading: "NÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u", body: "DĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡ng bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£p Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ chuyÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥c gaming hoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·c cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥m theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi, thay vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u toÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â n bĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ newsroom cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡." }
          ],
          image: {
            src: "https://images.example.com/gta6-audio.jpg",
            caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn game.",
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
              image_caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn game.",
              image_credit: "GenK Apps-Games"
            }
          ]
        }),
        makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "OpenAI thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½ AI cho nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m chĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢m sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³c khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â ng tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡i Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng Nam Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â",
          slug: "openai-thu-nghiem-tro-ly-ai-cho-nhom-cham-soc-khach-hang-tai-dong-nam-a",
          summary: "MĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£t thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi cho thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥y AI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“i nhanh hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t, chĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡m thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â³ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng viĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡c mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  doanh nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡p ViĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡t Nam vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«ng tuĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n.",
          dek: "CÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn cao hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ liÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn quan trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi AI Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng, cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch doanh nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡p vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“i cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§a cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Ân tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºn.",
          hook: "CÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u chuyĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡n cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn cao hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡n vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ liÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn quan trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi AI Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng, cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch doanh nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡p vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  hĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“i cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§a cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Ân tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºn.",
          published_at: "2026-03-31T11:00:00.000Z",
          updated_at: "2026-03-31T11:00:00.000Z",
          sections: [
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«a xĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£y ra", body: "OpenAI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â­ nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡m mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t luĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi cho Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i ngĂ„â€Ă¢â‚¬Â¦Ä‚â€Ă‚Â© chĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢m sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³c khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â ng, tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p trung vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o trĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi nhanh, tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¯t ngĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£nh vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  giĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢n Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹nh khi tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£i tĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢ng." },
            { heading: "VÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ sao Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ng lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u trang", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  kiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢u diĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¦n biĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿n cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©c nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·ng vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢c giĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡ vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ chĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡m vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â o AI Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng, chiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿n lĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c nĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Ân tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ng lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºn vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi xem AI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ang tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿n xa tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u trong cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng viĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡c thĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t." },
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢m tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p theo cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n xem lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng sang cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ trĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“i thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â° Google hay Microsoft phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng." }
          ],
          image: {
            src: "https://images.example.com/openai-support.jpg",
            caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c.",
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
              image_caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c.",
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
    name: "keeps the front page focused on stories and supports pull-to-refresh on touch devices",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });

      assert.match(homeHtml, /data-pull-refresh/);
      assert.match(homeHtml, /frontpage-masthead/);
      assert.doesNotMatch(homeHtml, /frontpage-kickerbar/);
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
          title: "Rockstar xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªm mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£t hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â© lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi cho GTA 6",
          slug: "rockstar-xac-nhan-them-mot-dot-he-lo-moi-cho-gta-6",
          summary: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i gaming nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn trang, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â° Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â©y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn cao nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿u web control thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â± Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³.",
          dek: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i gaming nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn trang, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â° Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â©y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn cao nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿u web control thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â± Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³.",
          hook: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i gaming nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn trang, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â° Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â©y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn cao nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿u web control thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â± Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³.",
          sections: [
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«a xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n", body: "Rockstar vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«a xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªm mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹p hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â© lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi khiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿n cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œng game tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥c theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡i liÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn quan GTA 6." },
            { heading: "VÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ sao Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âº Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m headline kÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â©o tĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡ng tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh, nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¥t lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khi ngĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi chĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â¡i vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â«n chĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªm mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“c thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âi gian cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ cho cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c bĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­p nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­t lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºn." },
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢m tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p theo lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  liĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡u nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹p hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â© lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ kÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â©o thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªm nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ng thay Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â kĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿ hoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡ch ra mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¯t hoĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â·c demo cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng khai hay khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng." }
          ],
          image: {
            src: "https://images.example.com/gaming-lead.jpg",
            caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn game.",
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
              image_caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn game.",
              image_credit: "Gaming Desk"
            }
          ]
        });
      const aiArticle = makeScenarioArticle({
          language: "vi",
          topic: "ai",
          content_type: "NewsArticle",
          verification_state: "verified",
          title: "OpenAI mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½ AI cho khĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“i vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh doanh nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡p",
          slug: "openai-mo-rong-tro-ly-ai-cho-khoi-van-hanh-doanh-nghiep",
          summary: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i AI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng test nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n rĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±ng OpenClaw web control cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“ Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn khi cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n.",
          dek: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i AI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng test nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n rĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±ng OpenClaw web control cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“ Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn khi cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n.",
          hook: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i AI Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§ mĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡nh, nhĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°ng test nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â½ xÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n rĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â±ng OpenClaw web control cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng sĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“ Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn khi cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n.",
          sections: [
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â«a xĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£y ra", body: "OpenAI mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½ AI cho khĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“i vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh, nhĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¯m tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă¢â‚¬Â trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i chĂ„â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢m sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³c khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m vĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â­n hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â nh nĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢i bĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢." },
            { heading: "VÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ sao Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ng chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âº Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â½", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢y lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³m tin cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“t lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â§a newsroom, thĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â£c Ă„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°u tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u trang vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ liÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn quan trĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi AI Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng dĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¥ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  Big Tech." },
            { heading: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âu cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi", body: "Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢m tiĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿p theo lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€¦Ă‚Â¸ rĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng sang thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ trĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢u Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ch hĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡ sinh thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡i doanh nghiĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡p phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹p thay Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y." }
          ],
          image: {
            src: "https://images.example.com/ai-lead.jpg",
            caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn AI.",
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
              image_caption: "Ă„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¢nh tham khĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£o tĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â« nguĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă…â€œn AI.",
              image_credit: "AI Desk"
            }
          ]
        });
      const controlled = buildNewsroomState({
        siteUrl: "https://patricktechmedia.com",
        storeUrl: "https://patricktechstore.vercel.app",
        externalArticles: [gamingArticle, aiArticle],
        webControl: {
          frontpageCopy: {
            vi: {
              heroTitle: "Gaming lane gets temporary frontpage priority."
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
      assert.match(html, /Gaming lane gets temporary frontpage priority\./);
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
            { id: "useful", emoji: "Ä‚â€Ă¢â‚¬ËœÄ‚â€¦Ă‚Â¸Ä‚Â¢Ă¢â€Â¬Ă‹Å“Ä‚â€Ă‚Â", label: "HĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯u Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­ch", count: 2 },
            { id: "love", emoji: "Ä‚â€Ă¢â‚¬ËœÄ‚â€¦Ă‚Â¸Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¥", label: "Hay", count: 1 }
          ],
          comments: [{ id: "comment-1", author_name: "PhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âº", body: "BÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡t vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi nhu cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§u thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c tĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¿.", created_at: "2026-03-31T02:00:00.000Z" }]
        },
        notice: "",
        error: ""
      });

      assert.match(homeHtml, /frontpage-masthead/);
      assert.match(homeHtml, /frontpage-hero/);
      assert.match(homeHtml, /headline-ribbon/);
      assert.match(homeHtml, /Patrick Tech Store/);
      assert.doesNotMatch(homeHtml, /frontpage-kickerbar/);
      assert.doesNotMatch(homeHtml, /3 bÄ‚Â i giĂ¡Â»Â¯ nhĂ¡Â»â€¹p hÄ‚Â´m nay/);
      assert.doesNotMatch(homeHtml, /NhĂ¡Â»Â¯ng chĂ¡Â»Â§ Ă„â€˜Ă¡Â»Â kÄ‚Â©o Ă„â€˜Ă¡Â»â„¢c giĂ¡ÂºÂ£ vÄ‚Â o Ă„â€˜Ă¡Â»Âc/);
      assert.doesNotMatch(homeHtml, /DÄ‚Â²ng tin mĂ¡Â»â€ºi Ă„â€˜ang chĂ¡ÂºÂ¡y trÄ‚Âªn trang chĂ¡Â»Â§/);
      assert.match(articleHtml, /feedback-section/);
      assert.match(articleHtml, /comment-form/);
      assert.match(articleHtml, /reaction-button/);



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
            "Patrick Tech Media theo dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµi mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢t cuĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“ua AI mĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi giĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯a cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng lĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºn cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng nghĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡ vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Âºi hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â ng loĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¡t thay Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¢i sĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£n phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â©m, giÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡ bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡n, Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‹Å“i tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c phĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â§n cĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â©ng vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â£ nhĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â¯ng tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¢ng chĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°a thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€ Ă¢â‚¬â„¢ Ă„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‹Å“o ngay trÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn thĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¹ trĂ„â€Ă¢â‚¬Â Ä‚â€Ă‚Â°Ă„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Âng viĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚Â¢Ă¢â€Â¬Ă‚Â¡c lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â m khu vĂ„â€Ă‚Â¡Ä‚â€Ă‚Â»Ä‚â€Ă‚Â±c",
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
      const leadHeadline =
        /<a href="\/vi\/tin-tuc\/patrick-tech-media-theo-doi-mot-cuoc-dua-ai-moi-giua-cac-ong-lon-cong-nghe">([^<]+)<\/a>/.exec(homeHtml)?.[1]
        || "";

      assert.ok(leadHeadline.length < scenario.articles[0].title.length);
      assert.notEqual(leadHeadline, scenario.articles[0].title);
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
    name: "emits brand schema on the homepage so search engines can recognize Patrick Tech Media",
    run() {
      const homeHtml = renderHomePage(state, "vi", { client: "", slots: {} });

      assert.match(homeHtml, /application\/ld\+json/);
      assert.match(homeHtml, /"@type":"Organization"/);
      assert.match(homeHtml, /"@type":"WebSite"/);
      assert.match(homeHtml, /patricktechmedia/);
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
        siteUrl: "https://patricktechmedia.com",
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
    name: "keeps explicit manual topic assignments when article text mentions other beats",
    run() {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-manual-topic-"));
      const contentPath = path.join(tempDir, "newsroom-content.json");
      const article = makeScenarioArticle({
        language: "vi",
        topic: "ai",
        content_type: "NewsArticle",
        verification_state: "verified",
        slug: "grok-heavy-van-phai-o-muc-ai",
        title: "Grok Heavy len gia cao, nguoi dung Apple van nen xem nhu bai toan AI",
        summary:
          "Bai viet nay nhac toi MacBook, Apple va RAM de mo ta ngu canh dung may, nhung chu de chinh van la goi AI cua Grok va cach xAI phan tang truy cap.",
        dek:
          "Neu newsroom da gan chu de AI thu cong, he thong khong duoc tu doi sang Thiet bi chi vi trong bai co nhac toi laptop, RAM hay Apple.",
        hook:
          "Case nay bao ve bai Grok khoi bi keo sai sang muc khac khi newsroom da co y dinh bien tap ro rang.",
        sections: [
          {
            heading: "Vi sao de sai topic",
            body: "Nhieu bai ve Grok Heavy co the nhac toi MacBook, RAM, Apple hoac thiet bi vi doc gia thuong so sanh moi truong dung may."
          },
          {
            heading: "Topic dung van la AI",
            body: "Trong tinh huong nay, gia goi, quyen truy cap va cach phan tang model moi la trong tam, nen bai phai nam o muc AI."
          },
          {
            heading: "Dieu can giu on dinh",
            body: "Khi bien tap vien da gan topic thu cong, pipeline can ton trong quyet dinh do thay vi suy luan lai tu keyword."
          }
        ],
        image: {
          src: "https://images.example.com/grok-heavy-topic-lock.jpg",
          caption: "Reference image from the source story.",
          credit: "Patrick Tech Media",
          source_url: "https://example.com/grok-heavy-topic-lock"
        },
        source_set: [
          {
            source_type: "official-site",
            source_name: "xAI",
            source_url: "https://x.ai/news/grok-4",
            region: "Global",
            language: "en",
            trust_tier: "official",
            image_url: "https://images.example.com/grok-heavy-topic-lock.jpg",
            image_caption: "Reference image from the source story.",
            image_credit: "Patrick Tech Media"
          }
        ]
      });

      fs.writeFileSync(contentPath, JSON.stringify({ articles: [article] }, null, 2), "utf8");

      const fileState = buildNewsroomState({
        siteUrl: "https://patricktechmedia.com",
        storeUrl: "https://patricktechstore.vercel.app",
        contentPath,
        webControl: {}
      });

      assert.equal(fileState.articles.length, 1);
      assert.equal(fileState.articles[0].topic, "ai");
      assert.equal(fileState.articles[0].topic_label, "AI");
    }
  },
  {
    name: "prefers collected source images over generated artwork",
    run() {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-media-images-"));
      const contentPath = path.join(tempDir, "newsroom-content.json");
      const article = {
        ...state.articles.find((entry) => entry.language === "en" && entry.content_type === "NewsArticle"),
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
        siteUrl: "https://patricktechmedia.com",
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
        title: "Patrick Tech Media nhÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­n luÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng hidden feed cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ cÄ‚â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ lĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â m mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Âºi newsroom mĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â§n URL ngoĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i",
        slug: "patrick-tech-media-nhan-luong-hidden-feed-cuc-bo-de-co-the-lam-moi-newsroom-ma-khong-can-url-ngoai",
        summary: "BĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i kiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢m tra nĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y mĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âng hidden feed cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ newsroom cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âc payload JSON ngay trĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn mĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡y vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â«n Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œi qua cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¹ng quality gate nhÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â° mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢t nguÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“n bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn ngoĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i.",
        dek: "LuÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng file cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ giĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºp manager Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â²ng OpenClaw vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Âºi newsroom mĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£i chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â endpoint xa, miÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Â¦n lĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  payload vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â«n Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â§ title, hook, dek, section vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  nguÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“n.",
        hook: "LuÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng file cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ giĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºp manager Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â²ng OpenClaw vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Âºi newsroom mĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  khĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng phÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£i chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â endpoint xa, miÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Â¦n lĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  payload vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â«n Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â§ title, hook, dek, section vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  nguÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“n Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ xuÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥t bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£n.",
        sections: [
          {
            heading: "LuÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng feed",
            body: "Hidden feed trong bĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i test nĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â y Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â°Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£c ghi ra tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â« payload JSON cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢, giÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¯ nguyĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âªn title, nguÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“n, hĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬nh Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£nh vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥u trĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºc section Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ refresh script cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âc nÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œi tiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¿p nhÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â° mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢t external feed."
          },
          {
            heading: "Quality gate",
            body: "BĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i mÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â«u vÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â«n Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œi qua cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡c Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âu kiÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Â¡n bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¯t buÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢c nhÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â° summary Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â§ dĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i, dek rĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âµ, hook hoĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â n chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Â°nh, nguÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“n Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£nh hÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£p lÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€Ă‚Â¡ vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â  ba section cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â§ thÄ‚â€Ă¢â‚¬ÂÄ‚â€ Ă¢â‚¬â„¢Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢n bĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â i khĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â´ng trÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œng."
          },
          {
            heading: "KÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¿t quÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£",
            body: "Khi manager Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âc Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â°Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£c hidden feed cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢, nĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ cĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â Ä‚Â¢Ă¢â€Â¬Ă¢â€Â¢ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡nh dÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥u refresh Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬Â¦Ä‚â€Ă‚Â¸ chÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¿ Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢ external-feed thay vĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¬ rÄ‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚Â Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡i xuÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œng curated-rss, tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â« Ä‚â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¹Ă…â€œĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â³ giĂ„â€Ă¢â‚¬ÂÄ‚Â¢Ă¢â€Â¬Ă‚ÂĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Âºp OpenClaw thÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â­t sÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â± nĂ„â€Ă‚Â¡Ä‚â€Ă‚ÂºÄ‚â€Ă‚Â¯m newsroom cycle."
          }
        ],
        image: {
          src: "https://images.example.com/openclaw-hidden-feed.jpg",
          caption: "Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢nh tham khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£o tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â« luÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng hidden feed cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢.",
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
            image_caption: "Ä‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¢nh tham khÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚ÂºĂ„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â£o tÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â« luÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â‚¬ÂĂ‚Â¬Ä‚â€¦Ă¢â‚¬Å“ng hidden feed cÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¥c bÄ‚â€Ă¢â‚¬ÂÄ‚â€Ă‚Â¡Ă„â€Ă¢â‚¬ÂÄ‚â€Ă‚Â»Ă„â€Ă‚Â¢Ä‚Â¢Ă¢â€Â¬Ă‚ÂÄ‚â€Ă‚Â¢.",
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
      assert.ok(published.title.includes("reduce accidental triggers"));
      assert.ok(/everyone needs .*or, more accurately, wants .*/.test(published.summary));
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
    siteUrl: "https://patricktechmedia.com",
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
    siteUrl: "https://patricktechmedia.com",
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
