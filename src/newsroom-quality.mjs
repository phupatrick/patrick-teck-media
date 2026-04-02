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
  const checks = {
    title: title.length >= 28,
    summary: summary.length >= 90,
    dek: dek.length >= 80,
    hook: hook.length >= 80,
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
    sectionCount: sections.length >= 3,
    sectionBodies: sectionBodies.length >= 3 && sectionBodies.every((body) => body.length >= 80),
    totalDepth: totalSectionLength >= (isAiPackageComparison ? 420 : 280),
    distinctSections: distinctSectionBodies.size >= Math.min(3, sectionBodies.length),
    leadFieldVariety: leadFieldVariety.size >= 1,
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

function makeBodySignature(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .trim()
    .slice(0, 180);
}
