import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNewsroomState, getArticleByRoute } from "../src/newsroom-service.mjs";
import { renderAuthPage } from "../src/platform-render.mjs";
import { createPlatformService } from "../src/platform-service.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "patrick-tech-media-platform-"));
const statePath = path.join(tempDir, "platform-state.json");
const service = createPlatformService({
  statePath,
  siteUrl: "https://patricktechmedia.vercel.app"
});

const tests = [
  {
    name: "registers a writer and auto-publishes a strong submission into the newsroom",
    async run() {
      const writer = await service.registerWriter({
        name: "Nguyen Hoang Phu",
        email: "writer@example.com",
        password: "strong-pass-123",
        language: "vi"
      });

      const submission = await service.createSubmission({
        userId: writer.id,
        language: "vi",
        formData: {
          topic: "ai",
          content_type: "NewsArticle",
          title: "Startup Việt đưa trợ lý AI vào quy trình chăm sóc khách hàng đa kênh",
          dek: "Một nền tảng trong nước đang thử nghiệm trợ lý AI để giảm thời gian phản hồi và giữ trải nghiệm tư vấn thống nhất trên nhiều kênh.",
          summary:
            "Bài viết theo dõi thử nghiệm mới của một startup Việt khi đưa trợ lý AI vào khâu chăm sóc khách hàng, nhấn mạnh tác động tới tốc độ phản hồi, tiêu chuẩn hoá câu trả lời và chi phí vận hành.",
          sections: [
            {
              heading: "Bối cảnh",
              body:
                "Doanh nghiệp đang phải trả lời khách hàng qua website, fanpage và ứng dụng nhắn tin cùng lúc. Việc dùng trợ lý AI giúp giữ nhịp phản hồi ổn định, gom lại những câu hỏi lặp và giảm tải cho đội chăm sóc khách hàng ở ca cao điểm."
            },
            {
              heading: "Điểm mới",
              body:
                "Đợt thử nghiệm này tập trung vào việc kết nối dữ liệu sản phẩm, chính sách giao hàng và lịch sử hội thoại để AI đưa ra câu trả lời sát ngữ cảnh hơn. Nhóm vận hành vẫn duyệt các tình huống nhạy cảm trước khi cho bot phản hồi tự động."
            },
            {
              heading: "Vì sao đáng chú ý",
              body:
                "Nếu triển khai ổn định, mô hình này có thể mở ra cách dùng AI thực dụng hơn cho doanh nghiệp vừa và nhỏ tại Việt Nam: xử lý khối lượng hỏi đáp tăng nhanh nhưng vẫn giữ chất lượng hỗ trợ và dữ liệu kiểm soát tập trung."
            }
          ],
          sources: [
            {
              source_type: "official-site",
              source_name: "Patrick Tech Media Reference",
              source_url: "https://example.com/reference-1",
              region: "Vietnam",
              language: "vi",
              trust_tier: "official",
              image_url: "https://images.example.com/customer-ai.jpg",
              image_caption: "Nhóm vận hành đang theo dõi màn hình phản hồi.",
              image_credit: "Patrick Tech Media Reference"
            },
            {
              source_type: "press",
              source_name: "Tech News Vietnam",
              source_url: "https://example.com/reference-2",
              region: "Vietnam",
              language: "vi",
              trust_tier: "press"
            }
          ],
          image: {
            src: "https://images.example.com/customer-ai.jpg",
            caption: "Nhóm vận hành đang theo dõi màn hình phản hồi.",
            credit: "Patrick Tech Media Reference",
            source_url: "https://example.com/reference-1"
          }
        }
      });

      assert.equal(submission.status, "approved");
      assert.ok(submission.published_href);

      const state = buildNewsroomState({
        siteUrl: "https://patricktechmedia.vercel.app",
        storeUrl: "https://patricktechstore.vercel.app",
        injectedArticles: await service.listPublishedArticles(),
        webControl: {}
      });
      const article = getArticleByRoute(state, "vi", "tin-tuc", submission.slug);

      assert.ok(article);
      assert.equal(article.author_name, "Nguyen Hoang Phu");
      assert.equal(article.hero_image.kind, "source");
      assert.match(article.href, /\/vi\/tin-tuc\//);
    }
  },
  {
    name: "tracks revenue split and writer withdrawal requests",
    async run() {
      const submission = (await service.getAdminDashboard("en")).submissions[0];
      await service.updateRevenue({
        submissionId: submission.id,
        grossUsd: 125.5,
        language: "en"
      });

      const writer = (await service.getPortalData(submission.author_id, "en")).user;
      const withdrawal = await service.createWithdrawal({
        userId: writer.id,
        amount: 50,
        binanceAccount: "writer-binance-uid",
        walletAddress: "",
        network: "BSC",
        note: "First payout",
        language: "en"
      });

      assert.equal(withdrawal.status, "pending");

      const portal = await service.getPortalData(writer.id, "en");
      assert.equal(portal.totals.grossUsd, 125.5);
      assert.equal(portal.totals.writerEarnedUsd, 100.4);
      assert.equal(portal.totals.platformUsd, 25.1);
      assert.equal(portal.totals.pendingWithdrawalUsd, 50);
      assert.equal(portal.totals.availableUsd, 50.4);

      const updated = await service.updateWithdrawalStatus({
        withdrawalId: withdrawal.id,
        status: "paid",
        language: "en"
      });

      assert.equal(updated.status, "paid");
    }
  },
  {
    name: "rechecks incomplete writer drafts through the autonomous editorial gate",
    async run() {
      const writer = await service.registerWriter({
        name: "Le Thi Ngan",
        email: "writer-pending@example.com",
        password: "strong-pass-456",
        language: "vi"
      });

      const submission = await service.createSubmission({
        userId: writer.id,
        language: "vi",
        formData: {
          topic: "ai",
          content_type: "NewsArticle",
          title: "Startup Việt thử AI cho chăm sóc khách hàng",
          dek: "Nhóm nhỏ đang thử AI trong ca hỗ trợ khách hàng.",
          summary: "Một thử nghiệm nhỏ đang được theo dõi.",
          sections: [
            {
              heading: "Bối cảnh",
              body:
                "Nhóm vận hành thử một lớp AI để bớt câu hỏi lặp và giữ phản hồi đều hơn ở giờ đông."
            },
            {
              heading: "Điểm đang thử",
              body:
                "Mô hình hiện chỉ xử lý ca đơn giản, còn phần nhạy cảm vẫn chuyển cho người trực để tránh lệch ngữ cảnh."
            },
            {
              heading: "Vì sao nên theo dõi",
              body:
                "Nếu chạy ổn, nhóm nhỏ có thể chăm sóc khách hàng đều tay hơn mà không phải tăng ca trực."
            }
          ],
          sources: [
            {
              source_type: "press",
              source_name: "Tech Community Vietnam",
              source_url: "https://example.com/pending-reference-1",
              region: "Vietnam",
              language: "vi",
              trust_tier: "community"
            }
          ]
        }
      });

      assert.equal(submission.status, "pending_review");

      const cycle = await service.runAutonomousReviewCycle();
      const reviewed = (await service.getAdminDashboard("vi")).submissions.find((entry) => entry.id === submission.id);
      const autonomousActor = await service.getUserById("openclaw");

      assert.ok(cycle.reviewed >= 1);
      assert.equal(cycle.trustMode, "owner");
      assert.equal(reviewed.status, "pending_review");
      assert.equal(reviewed.review?.reviewed_by, "openclaw");
      assert.equal(reviewed.review?.review_mode, "owner-delegated");
      assert.equal(autonomousActor?.role, "owner");
      assert.match((reviewed.review?.notes || []).join(" "), /giữ lại để chờ nguồn|held until/i);
    }
  },
  {
    name: "stores article reactions and comments for public readers",
    async run() {
      const submission = (await service.getAdminDashboard("vi")).submissions.find((entry) => entry.status === "approved");

      await service.addArticleReaction({
        articleId: submission.published_article_id,
        href: submission.published_href,
        reaction: "useful",
        user: null,
        language: "vi"
      });

      await service.addArticleComment({
        articleId: submission.published_article_id,
        href: submission.published_href,
        name: "Patrick Reader",
        body: "Mình muốn thấy thêm các bài công nghệ Việt Nam cập nhật theo giờ.",
        user: null,
        language: "vi"
      });

      const feedback = await service.getArticleFeedback({
        articleId: submission.published_article_id,
        href: submission.published_href,
        language: "vi"
      });

      assert.equal(feedback.totalReactions, 1);
      assert.equal(feedback.totalComments, 1);
      assert.equal(feedback.reactions.find((entry) => entry.id === "useful")?.count, 1);
      assert.match(feedback.comments[0].body, /cập nhật theo giờ/i);
    }
  },
  {
    name: "limits Google admin access to the approved email list",
    async run() {
      const admin = await service.upsertAdminFromGoogle(
        {
          email: "hphumail@gmail.com",
          name: "Patrick Admin",
          picture: "https://images.example.com/admin.png"
        },
        "en"
      );

      assert.equal(admin.role, "admin");

      await assert.rejects(
        () =>
          service.upsertAdminFromGoogle(
            {
              email: "outsider@example.com",
              name: "No Access"
            },
            "en"
          ),
        /not allowed as admin/i
      );
    }
  },
  {
    name: "keeps the public login page focused on writer auth only",
    run() {
      const newsroom = buildNewsroomState({
        siteUrl: "https://patricktechmedia.vercel.app",
        storeUrl: "https://patricktechstore.vercel.app",
        webControl: {}
      });
      const html = renderAuthPage(newsroom, "vi", { notice: "", activeTab: "login" });

      assert.match(html, /data-auth-shell/);
      assert.match(html, /Đăng nhập/);
      assert.match(html, /Đăng ký/);
      assert.match(html, /password_confirm/);
      assert.doesNotMatch(html, /hphumail@gmail\.com/);
      assert.doesNotMatch(html, /phupunpin@gmail\.com/);
      assert.doesNotMatch(html, /hoangphupatrick@gmail\.com/);
      assert.doesNotMatch(html, /\/auth\/google\/start\?lang=vi/);
      assert.match(html, /\/site\.css\?v=/);
      assert.match(html, /\/site\.js\?v=/);
    }
  },
  {
    name: "renders a Google sign-in action when Google auth is enabled",
    run() {
      const newsroom = buildNewsroomState({
        siteUrl: "https://patricktechmedia.vercel.app",
        storeUrl: "https://patricktechstore.vercel.app",
        webControl: {}
      });
      const html = renderAuthPage(newsroom, "vi", { notice: "", activeTab: "login", googleConfigured: true });

      assert.match(html, /auth-provider-card/);
      assert.match(html, /google-auth-button/);
      assert.match(html, /\/auth\/google\/start\?lang=vi/);
      assert.doesNotMatch(html, /hphumail@gmail\.com/);
      assert.doesNotMatch(html, /phupunpin@gmail\.com/);
      assert.doesNotMatch(html, /hoangphupatrick@gmail\.com/);
    }
  }
];

let failed = 0;

for (const entry of tests) {
  try {
    await entry.run();
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
  console.log(`All ${tests.length} platform checks passed.`);
}
