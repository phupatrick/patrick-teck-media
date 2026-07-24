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

export function evaluateArticleAutopublishReadiness(article) {
  const base = evaluateArticleReadiness(article);
  const title = normalizeText(article?.title);
  const summary = normalizeText(article?.summary);
  const dek = normalizeText(article?.dek);
  const hook = normalizeText(article?.hook);
  const sections = Array.isArray(article?.sections) ? article.sections : [];
  const sectionHeadings = sections.map((section) => normalizeText(section?.heading)).filter(Boolean);
  const sectionBodies = sections.map((section) => normalizeText(section?.body)).filter(Boolean);
  const allCopy = [title, summary, dek, hook, ...sectionHeadings, ...sectionBodies];
  const leadFieldVariety = new Set([summary, dek, hook].map(makeBodySignature).filter(Boolean));
  const sourceCount = Array.isArray(article?.source_set) ? article.source_set.length : 0;
  const topic = String(article?.topic || "").trim();
  const editorialFocus = Array.isArray(article?.editorial_focus) ? article.editorial_focus : [];
  const isHighScrutinyArticle =
    topic === "ai" ||
    String(article?.content_type || "").trim() === "ComparisonPage" ||
    String(article?.content_type || "").trim() === "EvergreenGuide" ||
    editorialFocus.some((entry) => /ai-package|comparison|provider-|workspace|pricing/i.test(String(entry || "")));
  const checks = {
    ...base.checks,
    sectionHeadings: sectionHeadings.length >= Math.min(4, sections.length) && new Set(sectionHeadings.map(makeBodySignature)).size >= Math.min(3, sectionHeadings.length),
    narrativeFlow: hasEditorialNarrativeFlow(sectionHeadings),
    leadFieldVariety: leadFieldVariety.size >= 1,
    paragraphShape: hasReadableParagraphShape(sectionBodies),
    noRepeatedSentences: !hasRepeatedSentences([summary, dek, hook, ...sectionBodies]),
    noRepeatedPhrases: !hasRepeatedPhraseClusters([summary, dek, hook, ...sectionBodies]),
    noGenericPadding: !containsGenericPadding(allCopy),
    sourceNameBalance: hasSourceNameBalance(article, allCopy),
    specificInformation: hasSpecificInformationDensity({ allCopy, sourceCount, isHighScrutinyArticle })
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

export function isArticleAutopublishReady(article) {
  return evaluateArticleAutopublishReadiness(article).ready;
}

// Official announcements can be timely and well sourced while still using the
// publisher's own section structure. Keep the baseline editorial safeguards,
// but do not discard those reports solely for the stricter house-style checks.
export function evaluateVerifiedOfficialSourceFallbackReadiness(article) {
  const base = evaluateArticleReadiness(article);
  const sourceSet = Array.isArray(article?.source_set) ? article.source_set : [];
  const hasOfficialSource = sourceSet.some(
    (source) => String(source?.source_type || "").trim() === "official-site"
  );
  const checks = {
    ...base.checks,
    verified: String(article?.verification_state || "").trim() === "verified",
    officialSource: hasOfficialSource
  };
  const missing = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  return {
    ready: missing.length === 0,
    missing,
    checks
  };
}

export function isVerifiedOfficialSourceFallbackReady(article) {
  return evaluateVerifiedOfficialSourceFallbackReadiness(article).ready;
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

function containsGenericPadding(values) {
  const patterns = [
    /payload nguon ban dau/i,
    /source payload is thin/i,
    /the useful part is the context/i,
    /reader value is a clearer checklist/i,
    /what readers should check before acting/i,
    /what changed, who feels it first/i,
    /boi canh, tac dong thuc te, chi phi workflow/i,
    /gia tri nguoi doc nhan duoc la mot checklist/i,
    /giu bai co ich ngay ca khi/i,
    /phan huu ich nam o boi canh/i
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

function hasReadableParagraphShape(sectionBodies) {
  if (!sectionBodies.length) {
    return false;
  }

  return sectionBodies.every((body) => {
    const sentences = splitSentences(body).filter((sentence) => sentence.length >= 28);
    return sentences.length >= 2 || body.length >= 220;
  });
}

function hasEditorialNarrativeFlow(sectionHeadings) {
  const headings = sectionHeadings.map((heading) => normalizeText(heading).toLowerCase());
  const text = headings.join(" | ");

  const hasContext = /(context|background|what changed|updates? worth|b.{0,5}i c.{0,5}nh|di.{0,5}m m.{0,5}i)/i.test(text);
  const hasImpact = /(impact|why it matters|changes? in practice|t.{0,5}c .{0,5}ng|th.{0,5}c t.{0,5})/i.test(text);
  const hasReaderAction = /(watch|who should|readers?|checklist|next step|action|decision|ai n.{0,5}n|theo d.{0,5}i|gia tr.{0,5} ngu.{0,5}i d.{0,5}c)/i.test(text);

  return hasContext && hasImpact && hasReaderAction;
}

function hasRepeatedSentences(values) {
  const counts = new Map();

  for (const value of values) {
    for (const sentence of splitSentences(value)) {
      const key = makeSentenceSignature(sentence);
      if (!key || key.length < 70 || isLowInformationSentence(key)) {
        continue;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
      if (counts.get(key) >= 3) {
        return true;
      }
    }
  }

  return false;
}

function hasRepeatedPhraseClusters(values) {
  const counts = new Map();
  const text = normalizeText(values.join(" ")).toLowerCase();
  const words = text
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !isBoilerplateWord(word));

  for (let index = 0; index <= words.length - 9; index += 1) {
    const phraseWords = words.slice(index, index + 9);
    const uniqueWords = new Set(phraseWords);
    if (uniqueWords.size < 7) {
      continue;
    }
    const phrase = phraseWords.join(" ");
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
    if (counts.get(phrase) >= 4) {
      return true;
    }
  }

  return false;
}

function hasSourceNameBalance(article, values) {
  const sourceNames = Array.isArray(article?.source_set)
    ? article.source_set.map((source) => normalizeText(source?.source_name)).filter((name) => name.length >= 3)
    : [];

  if (!sourceNames.length) {
    return true;
  }

  const text = normalizeText(values.join(" ")).toLowerCase();
  return sourceNames.every((name) => {
    const escaped = escapeRegExp(name.toLowerCase());
    const mentions = (text.match(new RegExp(`\\b${escaped}\\b`, "g")) || []).length;
    return mentions <= 6;
  });
}

function hasSpecificInformationDensity({ allCopy, sourceCount, isHighScrutinyArticle }) {
  const text = normalizeText(allCopy.join(" "));
  const lower = text.toLowerCase();
  const numbers = (text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|gb|tb|mb|usd|vnd|triá»‡u|trieu|tá»·|ty|ngay|thang|hours?|days?|users?|countries|quoc gia)?\b/gi) || []).length;
  const namedEntities = new Set(text.match(/\b[A-Z][A-Za-z0-9+.-]{2,}(?:\s+[A-Z][A-Za-z0-9+.-]{2,}){0,3}\b/g) || []);
  const concreteSignals = [
    /\b(price|pricing|cost|launch|rollout|availability|limitation|risk|benchmark|security|privacy|subscription|release|update)\b/g,
    /\b(gia|chi phi|ra mat|trien khai|gioi han|rui ro|bao mat|quyen rieng tu|goi cuoc|cap nhat|phat hanh)\b/g,
    /\b(according to|said|announced|confirmed|reported|official|nguon|cho biet|cong bo|xac nhan)\b/g
  ].reduce((sum, pattern) => sum + (lower.match(pattern) || []).length, 0);
  const required = isHighScrutinyArticle ? 10 : 7;

  return numbers + namedEntities.size + concreteSignals + sourceCount >= required;
}

function splitSentences(value) {
  return normalizeText(value)
    .split(/(?<=[.!?])\s+|[;\n]+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countDistinctLeadFields(values) {
  const signatures = values
    .map((value) => makeSentenceSignature(value).slice(0, 140))
    .filter((value) => value.length >= 50);
  const distinct = [];

  for (const signature of signatures) {
    if (!distinct.some((existing) => areSimilarSignatures(existing, signature))) {
      distinct.push(signature);
    }
  }

  return distinct.length;
}

function areSimilarSignatures(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.includes(right) || right.includes(left);
}

function makeSentenceSignature(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/gi, " ")
    .trim();
}

function isLowInformationSentence(value) {
  return /^(patrick tech media|the piece|this story|the update|the change|nguoi doc|bai viet|cau chuyen)/i.test(value);
}

function isBoilerplateWord(value) {
  return [
    "patrick",
    "tech",
    "media",
    "google",
    "openai",
    "microsoft",
    "anthropic",
    "nguoi",
    "dung",
    "trong",
    "dang",
    "with",
    "that",
    "this",
    "from",
    "will",
    "more"
  ].includes(value);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
