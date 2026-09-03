const DEFAULT_SLOTS = [
  [8, 0, "information"], [9, 30, "product_promotion"],
  [11, 0, "information"], [12, 30, "ai_selected"],
  [14, 0, "information"], [15, 30, "product_promotion"],
  [17, 0, "information"], [18, 30, "ai_selected"],
  [20, 0, "information"], [21, 30, "product_promotion"],
  [22, 30, "web_digest"], [22, 45, "web_digest"], [23, 0, "web_digest"],
  [23, 15, "web_digest"], [23, 30, "web_digest"]
];

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
