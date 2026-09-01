const DEFAULT_MODEL = "gemini-1.5-flash";

export async function enrichArticleWithGemini(article, { apiKey, model, fetchImpl = fetch } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return article;
  const selectedModel = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const source = JSON.stringify({
    title: article?.title || "",
    summary: article?.summary || article?.dek || "",
    source: article?.source_set?.[0]?.source_name || "",
    source_url: article?.source_set?.[0]?.source_url || article?.href || article?.url || "",
    facts: article?.draft_context?.description || article?.draft_context?.paragraphs || article?.sections || []
  });
  const prompt = [
    "Bạn là biên tập viên Patrick Tech Media.",
    "Hãy hoàn thiện bài viết công nghệ bằng tiếng Việt có dấu, chỉ sử dụng dữ kiện trong nguồn.",
    "Không bịa số liệu, giá, phát ngôn, tính năng hoặc kết luận ngoài nguồn.",
    "Trả về JSON duy nhất với title, summary, dek, hook và sections.",
    "sections phải có đúng 5 mục, mỗi mục gồm heading và body, phân tích bối cảnh, thay đổi kỹ thuật, tác động thực tế, giới hạn/rủi ro và điều cần theo dõi.",
    `Nguồn đã thu thập: ${source}`
  ].join("\n");
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.25 }
      })
    }
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`Newsroom Gemini failed (HTTP ${response.status}): ${payload?.error?.message || payload?.raw || "Google returned an unknown error."}`);
  }
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  const value = parseJson(text);
  const sections = Array.isArray(value?.sections) ? value.sections : [];
  if (!String(value?.title || "").trim() || sections.length < 5) {
    throw new Error("Newsroom Gemini returned incomplete article fields.");
  }
  return {
    ...article,
    title: String(value.title).trim(),
    summary: String(value.summary || "").trim(),
    dek: String(value.dek || "").trim(),
    hook: String(value.hook || "").trim(),
    sections: sections.slice(0, 5).map((section) => ({
      heading: String(section?.heading || "").trim(),
      body: String(section?.body || "").trim()
    }))
  };
}

export function getNewsroomGeminiConfig(env = process.env) {
  return {
    apiKey: String(env.NEWSROOM_GEMINI_API_KEY || env.GEMINI_API_KEY || "").trim(),
    model: String(env.NEWSROOM_GEMINI_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL
  };
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function parseJson(value) {
  const cleaned = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Newsroom Gemini returned invalid JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
