export const CONTENT_PILLARS = {
  AI_NEWS: "ai_news",
  WORKFLOW_TIPS: "workflow_tips",
  PRODUCT_OFFER: "product_offer",
  TRUST_SUPPORT: "trust_support"
};

const DEFAULT_CTA = "📩 Nhắn Zalo 0933 684 560 để được tư vấn gói phù hợp, hỗ trợ cài đặt và bảo hành 1-1 từ Patrick Tech. Xem bài viết tại patricktechmedia.com/vi/ hoặc sản phẩm tại patricktechmedia.store.";
const BRAND_HEADER = "⚡ PATRICK TECH CO. | Công nghệ thực tế, hỗ trợ rõ ràng";
const DISCUSSION_PROMPT = "💬 Bạn đang dùng công cụ nào cho nhu cầu này? Chia sẻ trải nghiệm để mọi người cùng tham khảo.";
const DEFAULT_COMMENT = [
  "📌 Thông tin và hỗ trợ chính thức của Patrick Tech Co.",
  "Website: https://patricktechmedia.com/vi/",
  "Store: https://patricktechmedia.store/",
  "Zalo / Hotline: 0933 684 560"
].join("\n");

export function generateOfflinePost({ topic, pillar = CONTENT_PILLARS.AI_NEWS, notes = "", customCTA = "", isProductPromotion = false } = {}) {
  const title = normalizeText(topic, "Công nghệ và giải pháp số đáng chú ý");
  const detail = normalizeText(notes, "Làm rõ lợi ích, giới hạn và cách áp dụng phù hợp với nhu cầu thực tế.");
  const cta = normalizeText(customCTA, DEFAULT_CTA);

  const contentByPillar = {
    [CONTENT_PILLARS.AI_NEWS]: [
      `🔥 ${title.toUpperCase()}: ĐIỀU GÌ ĐÁNG CHÚ Ý?`,
      `🔎 **Điểm 1 - Công nghệ hoạt động ra sao:** ${detail}`,
      "⚙️ **Điểm 2 - Tính năng và tác động thực tế:** Hãy đối chiếu khả năng xử lý, mức tương thích, độ ổn định và chi phí vận hành trước khi đưa công cụ vào công việc.",
      "💡 **Điểm 3 - Có đáng dùng không:** Lợi ích chỉ rõ ràng khi tính năng giải quyết đúng nhu cầu; hãy thử ở quy mô nhỏ và kiểm tra giới hạn, quyền riêng tư cùng chính sách cập nhật.",
      `✅ **Kết luận:** ${cta}`,
      "#PatrickTechCo #AI #CôngNghệ #TechNews"
    ],
    [CONTENT_PILLARS.WORKFLOW_TIPS]: [
      `🚀 ${title.toUpperCase()}: ÁP DỤNG THẾ NÀO CHO HIỆU QUẢ?`,
      `🧭 **Bước 1 - Xác định đầu ra:** ${detail}`,
      "🛠️ **Bước 2 - Thiết kế quy trình:** Chia việc thành các bước nhỏ, lưu mẫu thao tác, phân quyền dữ liệu và đặt điểm kiểm tra trước khi kết quả được gửi đi.",
      "📊 **Bước 3 - Đo hiệu quả:** So sánh thời gian, chi phí, tỷ lệ lỗi và chất lượng đầu ra trước và sau khi áp dụng; chỉ mở rộng khi kết quả ổn định.",
      `✅ **Kết luận:** ${cta}`,
      "#PatrickTechCo #Workflow #AIProductivity"
    ],
    [CONTENT_PILLARS.PRODUCT_OFFER]: [
      `🛒 ${title.toUpperCase()}: KIỂM TRA GÌ TRƯỚC KHI MUA?`,
      `📋 **Điểm 1 - Tính năng và thông số:** ${detail}`,
      "💰 **Điểm 2 - Giá trị và chi phí:** So sánh giá, thời hạn, hạn mức, thiết bị hỗ trợ và chi phí phát sinh với nhu cầu thực tế thay vì chỉ nhìn vào mức giá niêm yết.",
      "🛡️ **Điểm 3 - Hậu mãi:** Xác nhận phạm vi bảo hành, thời gian phản hồi, cách xử lý khi lỗi và kênh hỗ trợ trước khi thanh toán.",
      `✅ **Lý do nên cân nhắc:** ${cta}`,
      "#PatrickTechCo #TàiKhoảnAI #APIKey"
    ],
    [CONTENT_PILLARS.TRUST_SUPPORT]: [
      `🤝 ${title.toUpperCase()}: HỖ TRỢ KHÔNG DỪNG Ở BÁN HÀNG`,
      `✅ **Điểm 1 - Minh bạch:** ${detail}`,
      "🔧 **Điểm 2 - Xử lý thực tế:** Patrick Tech kiểm tra nguyên nhân, hướng dẫn từng bước và ưu tiên giải pháp phù hợp với thiết bị, tài khoản và quy trình của khách hàng.",
      "📞 **Điểm 3 - Đồng hành sau bàn giao:** Khách hàng có kênh liên hệ rõ ràng, được cập nhật tiến độ và biết trước phạm vi bảo hành cũng như thời gian hỗ trợ.",
      `🌟 **Cam kết:** ${cta}`,
      "#PatrickTechCo #HỗTrợTậnTâm #DịchVụSố"
    ]
  };

  const disclosure = isProductPromotion ? "📣 Bài viết giới thiệu sản phẩm của Patrick Tech Co. Thông tin, giá và tình trạng được tham khảo từ catalog tại thời điểm đăng; vui lòng kiểm tra lại trước khi mua." : "";
  return {
    caption: [BRAND_HEADER, disclosure, ...(contentByPillar[pillar] || contentByPillar[CONTENT_PILLARS.AI_NEWS]), DISCUSSION_PROMPT].filter(Boolean).join("\n\n"),
    first_comment: DEFAULT_COMMENT
  };
}

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
