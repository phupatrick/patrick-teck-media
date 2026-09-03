export const CONTENT_PILLARS = {
  AI_NEWS: "ai_news",
  WORKFLOW_TIPS: "workflow_tips",
  PRODUCT_OFFER: "product_offer",
  TRUST_SUPPORT: "trust_support"
};

const DEFAULT_CTA = "📩 Xem tin công nghệ: https://patricktechmedia.com/vi/ | Xem giải pháp: https://patricktechmedia.store/ | Zalo/Hotline 0933 684 560 để được hỗ trợ và bảo hành 1-1.";
const BRAND_HEADER = "🌟 PATRICK TECH CO. | CÔNG NGHỆ DỄ HIỂU, GIÁ TRỊ RÕ RÀNG";
const BRAND_TAGLINE = "Công nghệ dễ tiếp cận hơn – Giá hợp lý hơn – Hỗ trợ tận tâm hơn.";
const DISCUSSION_PROMPT = "💬 Bạn đang dùng công cụ nào cho nhu cầu này? Chia sẻ trải nghiệm để mọi người cùng tham khảo.";
const DEFAULT_COMMENT = [
  "📌 Tòa soạn Patrick Tech Media: https://patricktechmedia.com/vi/",
  "🛒 Cửa hàng Patrick Tech: https://patricktechmedia.store/",
  "📞 Zalo / Hotline: 0933 684 560",
  "🛡️ Hỗ trợ cài đặt và bảo hành 1-1 theo điều kiện sản phẩm."
].join("\n");

export function generateOfflinePost({ topic, pillar = CONTENT_PILLARS.AI_NEWS, notes = "", customCTA = "", isProductPromotion = false } = {}) {
  const title = normalizeText(topic, "Công nghệ và giải pháp số đáng chú ý");
  const detail = normalizeText(notes, "Làm rõ lợi ích, giới hạn và cách áp dụng phù hợp với nhu cầu thực tế.");
  const cta = normalizeText(customCTA, DEFAULT_CTA);

  const contentByPillar = {
    [CONTENT_PILLARS.AI_NEWS]: [
      `Hook: ${title.slice(0, 100)}`,
      `⚡ Công nghệ: ${detail}`,
      "📌 Cân nhắc chi phí: Đối chiếu khả năng xử lý, mức tương thích và chi phí vận hành trước khi đưa công cụ vào công việc.",
      "💡 Quyết định thực tế: Thử ở quy mô nhỏ, kiểm tra giới hạn, quyền riêng tư và chính sách cập nhật.",
      `✅ Kết luận: ${cta}`,
      "#PatrickTechCo #AI #CôngNghệ #TechNews"
    ],
    [CONTENT_PILLARS.WORKFLOW_TIPS]: [
      `Hook: ${title.slice(0, 100)}`,
      `⚡ Đầu ra cần rõ: ${detail}`,
      "📌 Quy trình gọn: Chia việc thành bước nhỏ, lưu mẫu thao tác và kiểm tra dữ liệu trước khi gửi.",
      "💡 Đo hiệu quả: So sánh thời gian, chi phí và tỷ lệ lỗi trước khi mở rộng.",
      `✅ Kết luận: ${cta}`,
      "#PatrickTechCo #Workflow #AIProductivity"
    ],
    [CONTENT_PILLARS.PRODUCT_OFFER]: [
      `Hook: ${title.slice(0, 100)}`,
      `⚡ Tính năng: ${detail}`,
      "📌 Chi phí rõ ràng: So sánh giá, thời hạn, hạn mức và thiết bị hỗ trợ với nhu cầu thực tế.",
      "💡 Hậu mãi: Xác nhận phạm vi bảo hành, thời gian phản hồi và cách xử lý khi lỗi trước khi thanh toán.",
      `✅ Lý do nên cân nhắc: ${cta}`,
      "#PatrickTechCo #TàiKhoảnAI #APIKey"
    ],
    [CONTENT_PILLARS.TRUST_SUPPORT]: [
      `Hook: ${title.slice(0, 100)}`,
      `⚡ Minh bạch: ${detail}`,
      "📌 Xử lý thực tế: Patrick Tech kiểm tra nguyên nhân, hướng dẫn từng bước và ưu tiên giải pháp phù hợp.",
      "💡 Đồng hành sau bàn giao: Có kênh liên hệ rõ ràng, cập nhật tiến độ và phạm vi bảo hành.",
      `🌟 Cam kết: ${cta}`,
      "#PatrickTechCo #HỗTrợTậnTâm #DịchVụSố"
    ]
  };

  const disclosure = isProductPromotion ? "📣 Bài viết giới thiệu sản phẩm của Patrick Tech Co. Thông tin, giá và tình trạng được tham khảo từ catalog tại thời điểm đăng; vui lòng kiểm tra lại trước khi mua." : "";
  return {
    caption: [BRAND_HEADER, BRAND_TAGLINE, disclosure, ...(contentByPillar[pillar] || contentByPillar[CONTENT_PILLARS.AI_NEWS]), DISCUSSION_PROMPT].filter(Boolean).join("\n\n"),
    first_comment: DEFAULT_COMMENT
  };
}

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
