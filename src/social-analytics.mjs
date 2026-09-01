export async function fetchFacebookPostMetrics({ pageToken = "", fbPostId = "", fetchImpl = fetch } = {}) {
  if (!pageToken || !fbPostId || fbPostId === "sample_id") return emptyMetrics();

  const fields = "shares,reactions.summary(true),comments.summary(true)";
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(fbPostId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`;
  try {
    const response = await fetchImpl(url);
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(payload?.error?.message || `Facebook metrics failed with HTTP ${response.status}.`);
    const reactions = Number(payload?.reactions?.summary?.total_count || 0);
    const comments = Number(payload?.comments?.summary?.total_count || 0);
    const shares = Number(payload?.shares?.count || 0);
    return { reactions, comments, shares, score: reactions + comments * 3 + shares * 5 };
  } catch {
    return emptyMetrics();
  }
}

function emptyMetrics() { return { reactions: 0, comments: 0, shares: 0, score: 0 }; }

async function readResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
