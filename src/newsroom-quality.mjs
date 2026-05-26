import { repairEncodingArtifacts } from "./text-repair.mjs";

export function evaluateArticleReadiness(article) {
  const title = normalizeText(article?.title);
  const summary = normalizeText(article?.summary);
  const dek = normalizeText(article?.dek);
  const hook = normalizeText(article?.hook);
  const topic = String(article?.topic || "").trim();
  const sections = Array.isArray(article?.sections) ? article.sections : [];
  const sectionBodies = sections.map((section) => normalizeText(section?.body)).filter(Boolean);
  const totalSectionLength = sectionBodies.reduce((sum, body) => sum + body.length, 0);
  const distinctSectionBodies = new Set(sectionBodies.map(makeBodySignature));
  const leadFieldVariety = new Set([summary, dek, hook].map(makeBodySignature).filter(Boolean));
  const sourceCount = Array.isArray(article?.source_set) ? article.source_set.length : 0;
  const reliableSingleSource = hasReliableSingleSource(article);
  const verificationState = String(article?.verification_state || "trend").trim();
  const verifiedReliableSingleSource = reliableSingleSource && verificationState === "verified";
  const editorialFocus = Array.isArray(article?.editorial_focus) ? article.editorial_focus : [];
  const isComparison = String(article?.content_type || "").trim() === "ComparisonPage";
  const isAiPackageComparison =
    isComparison
    && editorialFocus.some((entry) => /ai-package|comparison|provider-/i.test(String(entry || "")));
  const isHighScrutinyArticle =
    topic === "ai" ||
    isComparison ||
    String(article?.content_type || "").trim() === "EvergreenGuide" ||
    editorialFocus.some((entry) => /ai-package|comparison|provider-|workspace|pricing/i.test(String(entry || "")));
  const minimumSectionCount = isHighScrutinyArticle ? 5 : 4;
  const minimumSectionBodyLength = isHighScrutinyArticle ? 140 : 120;
  const minimumTotalDepth = isHighScrutinyArticle ? 1200 : 900;
  const checks = {
    title: title.length >= 28,
    summary: summary.length >= 120,
    dek: dek.length >= 110,
    hook: hook.length >= 110,
    sourceImage: hasSourceImage(article),
    sourceAttribution: hasSourceAttribution(article),
    sourceBreadth:
      (isAiPackageComparison && (sourceCount >= 3 || (sourceCount >= 2 && hasOfficialSource(article))))
      || (
        isHighScrutinyArticle
        && !isAiPackageComparison
        && (sourceCount >= 2 || (sourceCount >= 1 && (hasOfficialSource(article) || verifiedReliableSingleSource)))
      )
      || (!isHighScrutinyArticle && (sourceCount >= 2 || (sourceCount >= 1 && (reliableSingleSource || verificationState === "trend")))),
    sourceVariety: !isHighScrutinyArticle || hasSourceVariety(article) || verifiedReliableSingleSource,
    sectionCount: sections.length >= minimumSectionCount,
    sectionBodies: sectionBodies.length >= minimumSectionCount && sectionBodies.every((body) => body.length >= minimumSectionBodyLength),
    totalDepth: totalSectionLength >= minimumTotalDepth,
    distinctSections: distinctSectionBodies.size >= Math.min(minimumSectionCount, sectionBodies.length),
    leadFieldVariety: leadFieldVariety.size >= 1,
    valueDensity: hasReaderValueDensity({ title, summary, dek, hook, sectionBodies, isHighScrutinyArticle }),
    noPlaceholderCopy: !containsPlaceholderCopy([summary, dek, hook, ...sectionBodies]),
    cleanEncoding: !containsEncodingArtifacts([title, summary, dek, hook, ...sectionBodies])
  };

  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);
  const onlyEncodingNeedsRepair = missing.length === 1 && missing[0] === "cleanEncoding";

  return {
    ready: missing.length === 0 || onlyEncodingNeedsRepair,
    missing,
    checks
  };
}

export function isArticlePublishReady(article) {
  return evaluateArticleReadiness(article).ready;
}

export function normalizeText(value) {
  return repairEncodingArtifacts(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasSourceImage(article) {
  const imageCandidates = [
    article?.hero_image?.src,
    article?.hero_image?.display_src,
    article?.image?.src,
    article?.image?.url,
    ...(Array.isArray(article?.source_set)
      ? article.source_set.flatMap((source) => [source?.image_url, source?.image, source?.src, source?.url])
      : [])
  ];

  return imageCandidates.some((value) => isRemoteImageUrl(value));
}

export function hasSourceAttribution(article) {
  return Array.isArray(article?.source_set)
    && article.source_set.some(
      (source) => normalizeText(source?.source_name).length > 1 && /^https?:\/\//i.test(String(source?.source_url || "").trim())
    );
}

function hasOfficialSource(article) {
  return Array.isArray(article?.source_set)
    && article.source_set.some((source) => String(source?.source_type || "").trim() === "official-site");
}

function hasReliableSingleSource(article) {
  if (!Array.isArray(article?.source_set)) {
    return false;
  }

  return article.source_set.some((source) => {
    const type = String(source?.source_type || "").trim();
    return ["official-site", "press", "official-social", "editorial-research", "internal-roundup"].includes(type);
  });
}

function hasSourceVariety(article) {
  if (!Array.isArray(article?.source_set)) {
    return false;
  }

  const sourceTypes = new Set(
    article.source_set
      .map((source) => String(source?.source_type || "").trim())
      .filter(Boolean)
  );

  return sourceTypes.size >= 2 || article.source_set.length >= 3;
}

function containsPlaceholderCopy(values) {
  const patterns = [
    /source image pending/i,
    /ảnh nguồn đang cập nhật/i,
    /bài viết sẽ hiển thị ảnh gốc/i,
    /the current source trail comes from/i,
    /nguồn hiện tại được lấy từ/i,
    /desk sẽ tiếp tục theo dõi/i,
    /the desk will keep tracking/i
  ];

  return values.some((value) => {
    const text = normalizeText(value).toLowerCase();
    return patterns.some((pattern) => pattern.test(text));
  });
}

function isRemoteImageUrl(value) {
  return typeof value === "string" && /^https?:\/\/.+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?.*)?$/i.test(value.trim());
}

function isImageUrlLike(value) {
  return isRemoteImageUrl(value) || (typeof value === "string" && /^\/media\/source\?src=/i.test(value.trim()));
}

function containsEncodingArtifacts(values) {
  const patterns = [/(?:Ã.|Â.|â€|â€™|â€œ|â€)/];

  return values.some((value) => {
    const text = normalizeText(value);
    return patterns.some((pattern) => pattern.test(text));
  });
}

function hasReaderValueDensity({ title, summary, dek, hook, sectionBodies, isHighScrutinyArticle }) {
  const text = normalizeText([title, summary, dek, hook, ...sectionBodies].join(" ")).toLowerCase();
  const patterns = [
    /\b(context|background|why it matters|impact|risk|cost|price|workflow|rollout|limitation|trade[- ]?off|what to watch|who should|next step|checklist|practical|decision)\b/i,
    /\b(bối cảnh|boi canh|vì sao|vi sao|tác động|tac dong|rủi ro|rui ro|chi phí|chi phi|giá|gia|workflow|quy trình|quy trinh|triển khai|trien khai|giới hạn|gioi han|ai nên|ai nen|theo dõi|theo doi|checklist|quyết định|quyet dinh)\b/i
  ];
  const hits = patterns.reduce((sum, pattern) => sum + countMatches(text, pattern), 0);
  const numericSignals = (text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|gb|tb|mb|usd|vnd|triệu|trieu|tỷ|ty|ngày|ngay|tháng|thang|hours?|days?|users?|countries|quốc gia|quoc gia)\b/gi) || []).length;
  const sourceSignals = (text.match(/\b(according to|the company said|official|reported|nguồn|nguon|cho biết|cong bố|công bố|xac nhan|xác nhận)\b/gi) || []).length;
  const requiredHits = isHighScrutinyArticle ? 6 : 4;

  return hits + numericSignals + sourceSignals >= requiredHits;
}

function countMatches(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (String(text || "").match(new RegExp(pattern.source, flags)) || []).length;
}

function makeBodySignature(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .trim()
    .slice(0, 180);
}
