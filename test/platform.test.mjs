import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildNewsroomState, getArticleByRoute } from "../src/newsroom-service.mjs";
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
    run() {
      const writer = service.registerWriter({
        name: "Nguyen Hoang Phu",
        email: "writer@example.com",
        password: "strong-pass-123",
        language: "vi"
      });

      const submission = service.createSubmission({
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
        storeUrl: "https://store.patricktech.media",
        injectedArticles: service.listPublishedArticles()
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
    run() {
      const submission = service.getAdminDashboard("en").submissions[0];
      service.updateRevenue({
        submissionId: submission.id,
        grossUsd: 125.5,
        language: "en"
      });

      const writer = service.getPortalData(submission.author_id, "en").user;
      const withdrawal = service.createWithdrawal({
        userId: writer.id,
        amount: 50,
        binanceAccount: "writer-binance-uid",
        walletAddress: "",
        network: "BSC",
        note: "First payout",
        language: "en"
      });

      assert.equal(withdrawal.status, "pending");

      const portal = service.getPortalData(writer.id, "en");
      assert.equal(portal.totals.grossUsd, 125.5);
      assert.equal(portal.totals.writerEarnedUsd, 100.4);
      assert.equal(portal.totals.platformUsd, 25.1);
      assert.equal(portal.totals.pendingWithdrawalUsd, 50);
      assert.equal(portal.totals.availableUsd, 50.4);

      const updated = service.updateWithdrawalStatus({
        withdrawalId: withdrawal.id,
        status: "paid",
        language: "en"
      });

      assert.equal(updated.status, "paid");
    }
  },
  {
    name: "limits Google admin access to the approved email list",
    run() {
      const admin = service.upsertAdminFromGoogle(
        {
          email: "hphumail@gmail.com",
          name: "Patrick Admin",
          picture: "https://images.example.com/admin.png"
        },
        "en"
      );

      assert.equal(admin.role, "admin");

      assert.throws(
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
  console.log(`All ${tests.length} platform checks passed.`);
}
