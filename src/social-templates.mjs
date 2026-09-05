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
const CONTENT_ARCHETYPES = [
  "So sánh trực diện: chọn công cụ theo tác vụ, không theo quảng cáo.",
  "Mẹo workflow: biến một tính năng thành quy trình có thể kiểm chứng.",
  "Chi phí và rủi ro: kiểm tra hạn mức, quyền truy cập và điều kiện hỗ trợ.",
  "Điểm tin công nghệ: xác định thay đổi mới ảnh hưởng gì đến công việc."
];
const DEFAULT_COMMENT = [
  "📌 Tòa soạn Patrick Tech Media: https://patricktechmedia.com/vi/",
  "🛒 Cửa hàng Patrick Tech: https://patricktechmedia.store/",
  "📞 Zalo / Hotline: 0933 684 560",
  "🛡️ Hỗ trợ cài đặt và bảo hành 1-1 theo điều kiện sản phẩm."
].join("\n");

export function generateOfflinePost({ topic, pillar = CONTENT_PILLARS.AI_NEWS, notes = "", customCTA = "", mediaUrl = "", storeUrl = "", isProductPromotion = false } = {}) {
  const title = normalizeText(topic, "Công nghệ và giải pháp số đáng chú ý");
  const detail = normalizeText(notes, "Ưu tiên kiểm tra đầu ra, quyền truy cập và chi phí trước khi đưa công cụ vào quy trình.");
  const archetype = CONTENT_ARCHETYPES[stableTopicIndex(title)];
  const defaultCta = storeUrl ? DEFAULT_CTA.replace("https://patricktechmedia.store/", String(storeUrl).trim()) : DEFAULT_CTA;
  const cta = normalizeText(customCTA, defaultCta);

  const contentByPillar = {
    [CONTENT_PILLARS.AI_NEWS]: buildCaptionParts(title, getKnowledgePoints(title, detail, archetype), DISCUSSION_PROMPT, cta, "#PatrickTechCo #AI #CôngNghệ #TechNews"),
    [CONTENT_PILLARS.WORKFLOW_TIPS]: buildCaptionParts(title, getKnowledgePoints(title, detail, archetype), DISCUSSION_PROMPT, cta, "#PatrickTechCo #Workflow #AIProductivity"),
    [CONTENT_PILLARS.PRODUCT_OFFER]: buildCaptionParts(title, getKnowledgePoints(title, detail, archetype), DISCUSSION_PROMPT, cta, "#PatrickTechCo #TàiKhoảnAI #APIKey"),
    [CONTENT_PILLARS.TRUST_SUPPORT]: buildCaptionParts(title, getKnowledgePoints(title, detail, archetype), DISCUSSION_PROMPT, cta, "#PatrickTechCo #HỗTrợTậnTâm #DịchVụSố")
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

function getKnowledgePoints(title, detail, archetype) {
  const topicKey = title.toLocaleLowerCase("vi-VN");
  if (/cursor|visual studio code|\bvs code\b|vscode/.test(topicKey)) {
    return [
      `⚡ Composer và Codebase Indexing: quét ngữ cảnh dự án, đề xuất thay đổi đồng bộ nhiều file và cho phép xem diff trước khi áp dụng. ${archetype}`,
      "📌 Tab Autocomplete dự đoán đoạn code tiếp theo; hãy đo thời gian viết boilerplate và tỷ lệ sửa lại theo từng ngôn ngữ thay vì mặc định một con số phần trăm.",
      "💡 Khi dùng Cursor Pro/Ultra, hãy xác minh đúng gói, quyền truy cập, hạn mức request và điều kiện hỗ trợ trước khi kích hoạt qua Patrick Tech Co."
    ];
  }
  if (/claude|anthropic|sonnet/.test(topicKey)) {
    return [
      "⚡ Claude hỗ trợ context window dài và Artifacts để xem bản nháp, code hoặc giao diện trong cùng một phiên làm việc; giới hạn thực tế phụ thuộc model và gói.",
      "📌 Với dự án lớn, chia yêu cầu theo module, yêu cầu nêu giả định và kiểm tra diff trước khi merge để kiểm soát lỗi refactor.",
      "💡 Khi chọn Claude Pro/Team, hãy đối chiếu quyền riêng tư, hạn mức, giá và phạm vi hỗ trợ theo đúng gói đang sử dụng."
    ];
  }
  if (/chatgpt|openai|gpt-4o|gpt-4|canvas/.test(topicKey)) {
    return [
      "⚡ ChatGPT và Canvas hỗ trợ viết, dịch, phân tích và lập trình; nên kiểm tra model, context window, quyền công cụ và dữ liệu đầu vào trước khi giao việc.",
      "📌 Có thể nối vào workflow văn phòng hoặc kinh doanh, nhưng cần đo thời gian xử lý, tỷ lệ đầu ra phải sửa và quyền truy cập dữ liệu.",
      "💡 Khi chọn ChatGPT Plus hoặc dịch vụ OpenAI, hãy xác minh đúng tài khoản, phương thức thanh toán và điều kiện hỗ trợ của gói."
    ];
  }
  if (/api\s*key|deepseek|openai-compatible|moe/.test(topicKey)) {
    return [
      "⚡ DeepSeek dùng API tương thích OpenAI ở nhiều thư viện; client thường chỉ cần đổi endpoint, model và khóa truy cập, nhưng vẫn phải kiểm tra response schema.",
      "📌 API latency, token throughput và chi phí phụ thuộc model, token, khu vực và bảng giá lúc gọi; nên đặt timeout, retry và giới hạn ngân sách.",
      "💡 Với API key, hãy dùng biến môi trường, phân quyền tối thiểu, theo dõi hạn mức và chỉ mua nguồn có hóa đơn cùng điều kiện hỗ trợ rõ ràng."
    ];
  }
  return [
    `⚡ Tự động hóa phần việc lặp lại bằng một tính năng cụ thể: ${detail}`,
    `📌 ${archetype} Đo thời gian, chi phí, tỷ lệ lỗi và quyền truy cập trước/sau khi đưa công cụ vào quy trình.`,
    "💡 Patrick Tech Co. tập trung hướng dẫn cấu hình, kiểm tra đầu ra và hỗ trợ xử lý sự cố theo điều kiện dịch vụ cụ thể."
  ];
}

function stableTopicIndex(value) {
  return [...String(value)].reduce((sum, character) => sum + character.codePointAt(0), 0) % CONTENT_ARCHETYPES.length;
}

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
