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

export function generateOfflinePost({ topic, pillar = CONTENT_PILLARS.AI_NEWS, notes = "", customCTA = "", mediaUrl = "", storeUrl = "", isProductPromotion = false } = {}) {
  const title = normalizeText(topic, "Công nghệ và giải pháp số đáng chú ý");
  const detail = normalizeText(notes, "Ưu tiên kiểm tra đầu ra, quyền truy cập và chi phí trước khi đưa công cụ vào quy trình.");
  const defaultCta = storeUrl ? DEFAULT_CTA.replace("https://patricktechmedia.store/", String(storeUrl).trim()) : DEFAULT_CTA;
  const cta = normalizeText(customCTA, defaultCta);

  const contentByPillar = {
    [CONTENT_PILLARS.AI_NEWS]: buildCaptionParts(title, getKnowledgePoints(title, detail), DISCUSSION_PROMPT, cta, "#PatrickTechCo #AI #CôngNghệ #TechNews"),
    [CONTENT_PILLARS.WORKFLOW_TIPS]: buildCaptionParts(title, getKnowledgePoints(title, detail), DISCUSSION_PROMPT, cta, "#PatrickTechCo #Workflow #AIProductivity"),
    [CONTENT_PILLARS.PRODUCT_OFFER]: buildCaptionParts(title, getKnowledgePoints(title, detail), DISCUSSION_PROMPT, cta, "#PatrickTechCo #TàiKhoảnAI #APIKey"),
    [CONTENT_PILLARS.TRUST_SUPPORT]: buildCaptionParts(title, getKnowledgePoints(title, detail), DISCUSSION_PROMPT, cta, "#PatrickTechCo #HỗTrợTậnTâm #DịchVụSố")
  };

  const disclosure = isProductPromotion ? "📣 Bài viết giới thiệu sản phẩm của Patrick Tech Co. Thông tin, giá và tình trạng được tham khảo từ catalog tại thời điểm đăng; vui lòng kiểm tra lại trước khi mua." : "";
  const content = contentByPillar[pillar] || contentByPillar[CONTENT_PILLARS.AI_NEWS];
  const captionParts = [
    ...content.slice(0, 3),
    disclosure,
    ...content.slice(3)
  ].filter(Boolean);
  return {
    caption: captionParts.join("\n\n"),
    first_comment: DEFAULT_COMMENT
  };
}

function buildHook(title) {
  return title.slice(0, 120);
}

function buildCaptionParts(title, points, discussion, cta, hashtags) {
  return [buildHook(title), BRAND_HEADER, BRAND_TAGLINE, ...points, discussion, cta, hashtags];
}

function getKnowledgePoints(title, detail) {
  const topicKey = title.toLocaleLowerCase("vi-VN");
  if (/cursor|visual studio code|\bvs code\b|vscode/.test(topicKey)) {
    return [
      "⚡ Composer và chỉnh sửa đa tệp: Quét ngữ cảnh codebase, đề xuất thay đổi đồng bộ trên nhiều file và cho phép xem lại diff trước khi áp dụng.",
      "📌 Tab Autocomplete dự đoán đoạn code tiếp theo; hiệu quả thực tế phụ thuộc ngôn ngữ, cấu hình dự án và cách kiểm tra của lập trình viên.",
      "💡 Khi dùng Cursor Pro/Ultra, hãy xác minh đúng gói, quyền truy cập, hạn mức request và điều kiện hỗ trợ trước khi kích hoạt qua Patrick Tech Co."
    ];
  }
  if (/claude|anthropic|sonnet/.test(topicKey)) {
    return [
      "⚡ Claude hỗ trợ phân tích ngữ cảnh dài và Artifacts để xem bản nháp, code hoặc giao diện trong cùng một phiên làm việc.",
      "📌 Với dự án lớn, nên chia yêu cầu thành module, yêu cầu nêu giả định và kiểm tra diff để giảm lỗi khi refactor.",
      "💡 Khi chọn Claude Pro/Team, hãy đối chiếu quyền riêng tư, hạn mức, giá và phạm vi hỗ trợ theo đúng gói đang sử dụng."
    ];
  }
  if (/chatgpt|openai|gpt-4o|gpt-4|canvas/.test(topicKey)) {
    return [
      "⚡ ChatGPT và Canvas phù hợp cho viết, dịch, phân tích và lập trình khi người dùng cung cấp mục tiêu cùng dữ liệu rõ ràng.",
      "📌 Có thể nối vào quy trình văn phòng hoặc kinh doanh, nhưng cần kiểm tra quyền truy cập, dữ liệu đầu vào và đầu ra trước khi dùng.",
      "💡 Khi chọn ChatGPT Plus hoặc dịch vụ OpenAI, hãy xác minh đúng tài khoản, phương thức thanh toán và điều kiện hỗ trợ của gói."
    ];
  }
  if (/api\s*key|deepseek|openai-compatible|moe/.test(topicKey)) {
    return [
      "⚡ DeepSeek dùng API tương thích OpenAI ở nhiều thư viện, giúp chuyển đổi client bằng cách thay endpoint, model và khóa truy cập.",
      "📌 Chi phí và tốc độ phụ thuộc model, token, khu vực và bảng giá tại thời điểm gọi; nên đặt timeout, retry và giới hạn ngân sách.",
      "💡 Với API key, hãy dùng biến môi trường, phân quyền tối thiểu, theo dõi hạn mức và chỉ mua nguồn có hóa đơn cùng điều kiện hỗ trợ rõ ràng."
    ];
  }
  return [
    `⚡ Tự động hóa phần việc lặp lại: ${detail}`,
    "📌 Tối ưu vận hành bằng cách đo thời gian, chi phí, tỷ lệ lỗi và quyền truy cập trước/sau khi đưa công cụ vào quy trình.",
    "💡 Patrick Tech Co. tập trung hướng dẫn cấu hình, kiểm tra đầu ra và hỗ trợ xử lý sự cố theo điều kiện dịch vụ cụ thể."
  ];
}

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
