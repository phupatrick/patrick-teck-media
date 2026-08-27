import { repairEncodingArtifacts } from "./text-repair.mjs";

const NAVIGATION_PATTERNS = [
  /\bcorporate people\s*&\s*culture\b.*\bmore stories\b.*\bproducts\b.*\bmobile\b/i,
  /\bopen menu\b.*\b(?:close main menu|main menu)\b/i,
  /\btech radar\b.*\bopen menu\b.*\b(?:us edition|asia|europe)\b/i,
  /\bapple store\s+mac\s+ipad\s+iphone\s+watch\s+vision\s+airpods\b.*\bnewsroom\b/i,
  /\b(?:toggle dark mode|toggle search form|search for:|home page switch site)\b/i,
  /\b(?:get full access to premium articles|all search results|search results for)\b/i,
  /\b(?:privacy policy|cookie policy|terms of use)\b.*\b(?:newsletter|sign up|all rights reserved)\b/i,
  /\bwhen you purchase through links on our site\b.*\baffiliate commission\b/i,
  /^\s*\(?image credit:[^)]+\)?\s*/i,
  /đặt báo đăng nhập.*thông tin tài khoản.*đăng xuất/i,
  /mobile ai tin ict internet.*apps[- ]game.*đồ chơi số/i
];

const VIETNAMESE_NAVIGATION_PATTERNS = [
  /bình luận mới được duyệt.*thông tin tài khoản.*đăng xuất/i,
  /chính trị.*thời sự.*thế giới.*kinh tế.*đời sống/i,
  /chào ngày mới.*tin 24h.*tin thị trường.*tin 360/i,
  /chọn .* làm nguồn ưu tiên trên google.*xem hướng dẫn/i,
  /bước 1.*bước 2.*thêm .* trên google/i
];

const NAVIGATION_TOKENS = /\b(?:open|close|toggle|menu|search|home|products|support|resources|stories|login|sign\s+up|privacy|cookie|terms)\b/gi;

export function isSourceTextContaminated(value) {
  const text = normalizeSourceText(value);

  if (!text) {
    return false;
  }

  if (NAVIGATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (VIETNAMESE_NAVIGATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  const navigationHits = text.match(NAVIGATION_TOKENS) || [];
  const sentenceCount = text.split(/[.!?]+/).filter((sentence) => sentence.trim()).length;
  return text.length >= 140 && navigationHits.length >= 7 && sentenceCount <= 2;
}

export function hasSourceTextContamination(values) {
  return (Array.isArray(values) ? values : [values])
    .flat(Infinity)
    .filter((value) => value !== null && value !== undefined)
    .some((value) => isSourceTextContaminated(value));
}

export function normalizeSourceText(value) {
  return repairEncodingArtifacts(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&(?:zwnj|zwj);/gi, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
  );
}
