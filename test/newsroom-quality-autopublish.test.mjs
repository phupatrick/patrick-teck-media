import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { publishArticles } from "../scripts/newsroom-publish.mjs";
import { evaluateArticleAutopublishReadiness, isArticleAutopublishReady } from "../src/newsroom-quality.mjs";

const readyArticle = buildReadyArticle();

assert.equal(isArticleAutopublishReady(readyArticle), true, "baseline article should pass the stricter publish gate");

const repeatedArticle = {
  ...readyArticle,
  sections: readyArticle.sections.map((section) => ({
    ...section,
    body: readyArticle.sections[0].body
  }))
};
assert.equal(isArticleAutopublishReady(repeatedArticle), false, "repeated section bodies should not publish");
assert.ok(evaluateArticleAutopublishReadiness(repeatedArticle).missing.includes("distinctSections"));

const genericPaddingArticle = {
  ...readyArticle,
  sections: [
    ...readyArticle.sections.slice(0, 4),
    {
      heading: "Editorial filler",
      body: "The useful part is the context, the practical impact, the likely workflow cost, and what readers should check before acting. Reader value is a clearer checklist: what changed, who feels it first, what risk remains, and what should be watched next."
    }
  ]
};
assert.equal(isArticleAutopublishReady(genericPaddingArticle), false, "generic padding should not publish");
assert.ok(evaluateArticleAutopublishReadiness(genericPaddingArticle).missing.includes("noGenericPadding"));

const flatNarrativeArticle = {
  ...readyArticle,
  sections: readyArticle.sections.map((section, index) => ({
    ...section,
    heading: `Detail ${index + 1}`
  }))
};
assert.equal(isArticleAutopublishReady(flatNarrativeArticle), false, "articles without a reader-oriented narrative flow should not publish");
assert.ok(evaluateArticleAutopublishReadiness(flatNarrativeArticle).missing.includes("narrativeFlow"));

const thinArticle = {
  ...readyArticle,
  sections: readyArticle.sections.slice(0, 2)
};
assert.equal(isArticleAutopublishReady(thinArticle), false, "thin articles should not publish");
assert.ok(evaluateArticleAutopublishReadiness(thinArticle).missing.includes("sectionCount"));

const tempDir = await mkdtemp(path.join(os.tmpdir(), "ptm-quality-"));
try {
  const outputPath = path.join(tempDir, "newsroom-content.json");
  const result = await publishArticles({
    incomingArticles: [readyArticle, thinArticle],
    outputPath,
    replaceMode: true,
    now: "2026-07-10T00:00:00.000Z",
    strictQualityGate: true
  });

  assert.equal(result.publishedCount, 1, "publish count should only include articles that passed readiness");
  assert.equal(result.rejectedCount, 1, "rejected count should report filtered articles");
  assert.equal(result.totalArticles, 1);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("newsroom-quality-autopublish tests passed");

function buildReadyArticle() {
  return {
    id: "openai-workflow-rollout-2026",
    slug: "openai-workflow-rollout-2026",
    href: "/en/news/openai-workflow-rollout-2026",
    language: "en",
    title: "OpenAI workflow rollout gives teams a clearer reason to review AI costs",
    summary:
      "OpenAI is rolling out a workflow update for team accounts, with admins checking model access, usage limits, and budget impact before the July deployment window.",
    dek:
      "The useful detail is not only that a new AI feature exists; it is how the rollout changes account controls, monthly spend, and the review process for teams.",
    hook:
      "For readers managing AI tools, the practical question is whether this update reduces daily context switching or simply adds another control surface to audit.",
    topic: "ai",
    topic_label: "AI",
    content_type: "NewsArticle",
    verification_state: "verified",
    quality_score: 94,
    ad_eligible: true,
    editorial_focus: ["ai", "workflow", "pricing"],
    image: {
      src: "https://example.com/openai-workflow.jpg",
      caption: "OpenAI workflow controls shown in a product dashboard.",
      credit: "OpenAI",
      source_url: "https://openai.com/news/"
    },
    source_set: [
      {
        source_name: "OpenAI",
        source_url: "https://openai.com/news/",
        source_type: "official-site",
        image_url: "https://example.com/openai-workflow.jpg"
      },
      {
        source_name: "The Verge",
        source_url: "https://www.theverge.com/",
        source_type: "press"
      }
    ],
    sections: [
      section(
        "What changed",
        "OpenAI said the new workflow controls will reach team accounts in July 2026, giving admins a clearer place to review model access, shared projects, and usage limits. That matters because AI subscriptions are moving from individual experiments into managed software budgets with owners, thresholds, and approval steps."
      ),
      section(
        "Why it matters",
        "The change gives operations teams a concrete checkpoint before they expand AI access across support, sales, research, and content work. Instead of only asking whether a model is powerful, teams can compare the monthly cost, the risk of uncontrolled usage, and the time saved in repeat workflows."
      ),
      section(
        "What teams should check",
        "Admins should review which groups need advanced models, which tasks justify higher limits, and whether audit logs cover sensitive documents. A practical rollout checklist should include permission groups, expected monthly spend in USD, data handling rules, and a fallback plan if a workflow breaks."
      ),
      section(
        "Limitations",
        "The update does not automatically prove that every team should upgrade, because value depends on adoption depth and the number of repeat tasks replaced. Smaller teams may see the strongest benefit only when the feature removes a daily handoff, shortens research, or reduces duplicated writing work."
      ),
      section(
        "What to watch next",
        "The next signal is whether OpenAI connects these controls with clearer reporting for managers and finance teams. If usage reports become easier to compare by project, buyers will have a stronger basis for deciding which AI seats stay active after the first 30 days."
      )
    ],
    published_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z"
  };
}

function section(heading, body) {
  return { heading, body };
}
