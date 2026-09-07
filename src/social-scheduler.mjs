const DEFAULT_SLOTS = [
  [8, 0, "information"], [9, 30, "product_promotion"],
  [11, 0, "information"], [12, 30, "ai_selected"],
  [14, 0, "information"], [15, 30, "product_promotion"],
  [17, 0, "information"], [18, 30, "ai_selected"],
  [20, 0, "information"], [21, 30, "product_promotion"],
  [22, 30, "web_digest"], [22, 45, "web_digest"], [23, 0, "web_digest"],
  [23, 15, "web_digest"], [23, 30, "web_digest"]
];

const CATALOG_ITEMS = [
  { id: "chatgpt_plus", name: "Tài khoản ChatGPT Plus chính hãng", pillar: "Gói tài khoản & API Key", notes: "Kích hoạt nhanh, hỗ trợ workflow AI thực tế" },
  { id: "claude_team", name: "Gói Claude Team / Pro bản quyền", pillar: "Gói tài khoản & API Key", notes: "Xử lý ngữ cảnh dài và hỗ trợ nhóm" },
  { id: "cursor_ultra", name: "Tài khoản Cursor Pro / Ultra lập trình", pillar: "Gói tài khoản & API Key", notes: "Tối ưu quy trình code với AI Composer" },
  { id: "deepseek_api", name: "Hạn ngạch API DeepSeek V3 / R1", pillar: "Gói tài khoản & API Key", notes: "Tối ưu chi phí cho backend tự động" },
  { id: "canva_pro", name: "Nâng cấp Canva Pro chính hãng", pillar: "Gói tài khoản & API Key", notes: "Mở khóa tính năng đồ họa cao cấp" }
];

export async function pickNextPostPlan({ posts = [], articles = [], now = new Date(), random = Math.random } = {}) {
  const today = getLocalDay(now);
  const published = (Array.isArray(posts) ? posts : []).filter((post) => post?.status === "published");
  const todayPosts = published.filter((post) => getLocalDay(post.created_at) === today);
  if (todayPosts.filter((post) => post.category === "news").length < 5) {
    const article = (Array.isArray(articles) ? articles : []).find((item) => !published.some((post) => post.source_url === item.url || post.topic === item.title));
    if (article) return { category: "news", topic: article.title, pillar: "Tin tức & Xu hướng AI", notes: article.summary || "", imageUrl: article.image_url || article.source_image, sourceUrl: article.url || article.href || "" };
  }
  if (todayPosts.filter((post) => post.category === "product").length < 3) {
    const cutoff = now.getTime() - 72 * 60 * 60 * 1000;
    const available = CATALOG_ITEMS.filter((item) => !published.some((post) => post.product_id === item.id && Date.parse(post.created_at || 0) >= cutoff));
    if (available.length) {
      const item = available[Math.min(available.length - 1, Math.max(0, Math.floor(Number(random()) * available.length)))];
      return { category: "product", product_id: item.id, topic: item.name, pillar: item.pillar, notes: item.notes, sourceUrl: "https://patricktechmedia.store/" };
    }
  }
  if (todayPosts.filter((post) => post.category === "ai_discovery").length < 2) {
    return { category: "ai_discovery", topic: "Xu hướng ứng dụng AI và tự động hóa workflow", pillar: "Mẹo thực chiến & Workflow", notes: "Tối ưu thời gian và chi phí vận hành.", sourceUrl: "https://patricktechmedia.com/vi/" };
  }
  return null;
}

function getLocalDay(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export function getScheduledPostType({ now = new Date(), timeZone = "Asia/Ho_Chi_Minh", toleranceMinutes = 20, force = false } = {}) {
  if (force) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minuteOfDay = Number(values.hour) * 60 + Number(values.minute);
  const slot = DEFAULT_SLOTS.find(([hour, minute]) => {
    const slotMinute = hour * 60 + minute;
    return minuteOfDay >= slotMinute && minuteOfDay < slotMinute + toleranceMinutes;
  });
  return slot?.[2] || null;
}

export function isProductCooldownComplete(posts, sourceKey, { now = new Date(), cooldownHours = 72 } = {}) {
  const cutoff = now.getTime() - Math.max(1, Number(cooldownHours) || 72) * 60 * 60 * 1000;
  return !(Array.isArray(posts) ? posts : []).some((post) =>
    post?.status === "published" && post?.source_key === sourceKey && Date.parse(post.published_at || post.created_at || 0) >= cutoff
  );
}

export function selectScheduledCandidates(candidates, postType, limit = 1) {
  const source = Array.isArray(candidates) ? candidates : [];
  const filtered = postType ? source.filter((candidate) => candidate.post_type === postType) : source;
  return filtered.slice(0, Math.max(0, Number(limit) || 0));
}
