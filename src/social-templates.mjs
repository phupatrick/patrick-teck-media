export const CONTENT_PILLARS = {
  AI_NEWS: "ai_news",
  WORKFLOW_TIPS: "workflow_tips",
  PRODUCT_OFFER: "product_offer",
  TRUST_SUPPORT: "trust_support"
};

const DEFAULT_CTA = "Nhan tin cho Patrick Tech de duoc tu van goi phu hop va ho tro cai dat 1-1.";
const DEFAULT_COMMENT = [
  "Thong tin va ho tro chinh thuc cua Patrick Tech Co.:",
  "Website: https://patricktechmedia.com/vi/",
  "Store: https://patricktechmedia.store/",
  "Zalo / Hotline: 0933 684 560"
].join("\n");

export function generateOfflinePost({ topic, pillar = CONTENT_PILLARS.AI_NEWS, notes = "", customCTA = "" } = {}) {
  const title = normalizeText(topic, "Cong nghe va giai phap so dang chu y");
  const detail = normalizeText(notes, "Lam ro loi ich, gioi han va cach ap dung phu hop voi nhu cau thuc te.");
  const cta = normalizeText(customCTA, DEFAULT_CTA);

  const contentByPillar = {
    [CONTENT_PILLARS.AI_NEWS]: [
      `[DIEM TIN CONG NGHE] ${title.toUpperCase()}`,
      "Cong nghe chi co gia tri khi nguoi dung hieu no thay doi dieu gi trong cong viec va chi phi hang ngay.",
      `Dieu can biet: ${detail}`,
      "Goc nhin Patrick Tech: hay kiem tra nguon cong bo, dieu kien su dung va chi phi truoc khi dua vao quy trinh.",
      cta,
      "#PatrickTechCo #AI #CongNghe #TechNews"
    ],
    [CONTENT_PILLARS.WORKFLOW_TIPS]: [
      `[MEO LAM VIEC SO] ${title.toUpperCase()}`,
      "Mot workflow tot nen bat dau tu viec nho, do duoc ket qua va mo rong khi da on dinh.",
      `Buoc nen thu: ${detail}`,
      "Goi y: dat dau ra ro rang, luu mau prompt va kiem tra lai ket qua truoc khi su dung.",
      cta,
      "#PatrickTechCo #Workflow #AIProductivity"
    ],
    [CONTENT_PILLARS.PRODUCT_OFFER]: [
      `[TAI KHOAN SO VA API] ${title.toUpperCase()}`,
      "Patrick Tech tu van dung nhu cau, minh bach pham vi goi va ho tro trong suot qua trinh su dung.",
      `Diem can luu y: ${detail}`,
      "Nen doi chieu tinh nang, gioi han va chinh sach bao hanh truoc khi chon goi.",
      cta,
      "#PatrickTechCo #TaiKhoanAI #APIKey"
    ],
    [CONTENT_PILLARS.TRUST_SUPPORT]: [
      `[HO TRO KY THUAT] ${title.toUpperCase()}`,
      "Uy tin den tu thong tin ro rang, ho tro dung luc va trach nhiem sau khi ban giao.",
      `Thong tin them: ${detail}`,
      "Patrick Tech uu tien huong dan de hieu, kiem tra loi cung khach hang va thong bao ro cach xu ly.",
      cta,
      "#PatrickTechCo #HoTroTanTam #DichVuSo"
    ]
  };

  return {
    caption: (contentByPillar[pillar] || contentByPillar[CONTENT_PILLARS.AI_NEWS]).join("\n\n"),
    first_comment: DEFAULT_COMMENT
  };
}

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}
