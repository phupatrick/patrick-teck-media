import {
  formatPublishDate,
  getFooterLinks,
  getPrimaryNav,
  getVerificationMeta
} from "./newsroom-service.mjs";

export function renderHomePage(state, language, adsConfig) {
  const home = state.home[language];
  const copy = getRenderCopy(state, language);
  const path = `/${language}/`;
  const tips = home.tips?.length ? home.tips : home.evergreen;
  const leadStories = dedupeStories([home.featured, ...home.latest, ...home.trending, home.briefing, ...tips]);
  const leadFeature = leadStories[0];
  const leadSideStories = excludeStories(leadStories.slice(1), [leadFeature]).slice(0, 2);
  const ribbonStories = excludeStories(dedupeStories([...home.latest, ...home.trending, home.briefing]), [leadFeature, ...leadSideStories]).slice(0, 5);
  const latestStories = excludeStories(dedupeStories(home.latest), [leadFeature, ...leadSideStories]).slice(0, 4);
  const watchStories = excludeStories(dedupeStories([...home.trending, home.briefing, ...home.latest]), [leadFeature, ...leadSideStories]).slice(0, 4);
  const guideLead = excludeStories(dedupeStories([...tips, home.briefing]), [leadFeature, ...leadSideStories])[0] || home.briefing;
  const guideStories = excludeStories(dedupeStories([...tips, home.briefing, ...home.latest]), [leadFeature, ...leadSideStories, guideLead]).slice(0, 3);

  return renderLayout({
    state,
    language,
    path,
    adsConfig,
    title: copy.homeTitle,
    description: state.site.description[language],
    content: `
      <section class="frontpage-masthead">
        <div class="frontpage-masthead-copy">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h1>${escapeHtml(copy.heroTitle)}</h1>
        </div>
        <div class="hero-badges">
          <span>${copy.badgeSignals}</span>
          <span>${copy.badgeAds}</span>
          <span>${copy.badgeBilingual}</span>
        </div>
      </section>

      <section class="frontpage-hero">
        ${renderLeadFeature(leadFeature, language, copy)}
        <aside class="frontpage-rail">
          <div class="lead-mini-grid">
            ${leadSideStories.map((article) => renderLeadMini(article, language)).join("")}
          </div>
          <article class="rail-card hot-card">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">${copy.hotLabel}</p>
                <h2>${copy.hotTitle}</h2>
              </div>
            </div>
            <div class="headline-list">
              ${watchStories.map((article, index) => renderHeadlineItem(article, language, index + 1)).join("")}
            </div>
          </article>
          <article class="rail-card company-flash-card">
            <p class="rail-label">${copy.ecosystemLabel}</p>
            <h3>${copy.ecosystemTitle}</h3>
            <div class="company-links">
              <a class="text-link" href="/${language}/store">${copy.visitStore}</a>
              <a class="text-link" href="/${language}/about">${copy.aboutLabel}</a>
            </div>
          </article>
        </aside>
      </section>

      <section class="headline-ribbon" id="latest">
        <div class="headline-ribbon-head">
          <p class="eyebrow">${copy.ribbonLabel}</p>
          <h2>${copy.ribbonTitle}</h2>
        </div>
        <div class="headline-ribbon-track">
          ${ribbonStories.map((article) => renderRibbonItem(article, language)).join("")}
        </div>
      </section>

      ${renderSlot(adsConfig, { language, pageAllowsAds: true, placement: "hero" })}

      <section class="frontpage-grid">
        <div class="section-block">
          <div class="section-head">
            <p class="eyebrow">${copy.latestLabel}</p>
            <h2>${copy.latestTitle}</h2>
          </div>
          <div class="story-grid">
            ${latestStories.map((article) => renderStoryCard(article, language)).join("")}
          </div>
        </div>
        <aside class="section-block editors-block">
          <div class="section-head">
            <p class="eyebrow">${copy.editorsLabel}</p>
            <h2>${copy.editorsTitle}</h2>
          </div>
          <div class="stack-list">
            ${watchStories.map((article) => renderStackItem(article, language, true)).join("")}
          </div>
          <div class="newsroom-brief">
            <p class="rail-label">${copy.briefingLabel}</p>
            <h3><a href="${home.briefing.href}">${escapeHtml(home.briefing.title)}</a></h3>
            <a class="text-link" href="${home.briefing.href}">${copy.readStory}</a>
          </div>
        </aside>
      </section>

      <section class="guide-showcase" id="tips">
        <article class="guide-showcase-lead topic-${guideLead.topic}">
          ${renderStoryImage(guideLead, "guide-showcase-media")}
          <div class="guide-showcase-copy">
            <div class="story-meta-line">
              <span class="pill">${escapeHtml(guideLead.content_type_label)}</span>
              <span>${escapeHtml(guideLead.topic_label)}</span>
              <span>${escapeHtml(formatPublishDate(language, guideLead.published_at))}</span>
            </div>
            <h2><a href="${guideLead.href}">${escapeHtml(guideLead.title)}</a></h2>
            <a class="read-link" href="${guideLead.href}">${copy.readStory}</a>
          </div>
        </article>
        <aside class="section-block guide-showcase-side">
          <div class="section-head">
            <p class="eyebrow">${copy.tipsLabel}</p>
            <h2>${copy.tipsTitle}</h2>
          </div>
          <div class="stack-list">
            ${guideStories.map((article) => renderStackItem(article, language, false)).join("")}
          </div>
        </aside>
      </section>

      <section class="topic-band">
        ${home.topicSections
          .map(
            (topic) => `
              <article class="topic-column" style="--topic-accent:${topic.accent}">
                <div class="topic-title-row">
                  <h3><a href="/${language}/topics/${topic.slug}">${escapeHtml(topic.label)}</a></h3>
                  <a class="mini-link" href="/${language}/topics/${topic.slug}">${copy.moreLabel}</a>
                </div>
                <div class="stack-list">
                  ${topic.stories.map((article) => renderStackItem(article, language, false)).join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `
  });
}

export function renderRadarPage(state, language, radar, adsConfig) {
  const copy = getRenderCopy(state, language);

  return renderLayout({
    state,
    language,
    path: `/${language}/radar`,
    adsConfig,
    title: `${copy.radarTitle} | ${state.site.name}`,
    description: copy.radarText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.radarLabel}</p>
        <h1>${copy.radarTitle}</h1>
        <p>${copy.radarText}</p>
      </section>

      <section class="newsroom-strip metrics-strip">
        ${radar.scorecards
          .map(
            (card) => `
              <article class="newsroom-card stat">
                <p class="eyebrow">${escapeHtml(card.label)}</p>
                <h2>${card.value}</h2>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="lane-grid">
        ${radar.lanes
          .map(
            (lane) => `
              <article class="lane-card lane-${lane.status}">
                <div class="section-head">
                  <div>
                    <p class="eyebrow">${escapeHtml(lane.label)}</p>
                    <h2>${escapeHtml(lane.description)}</h2>
                  </div>
                </div>
                <div class="stack-list">
                  ${lane.stories.map((article) => renderStackItem(article, language, true)).join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="section-grid">
        <div class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.radarQueueLabel}</p>
              <h2>${copy.radarQueueTitle}</h2>
            </div>
          </div>
          <div class="queue-table">
            ${radar.queue
              .map(
                (entry) => `
                  <a class="queue-row" href="${entry.href}">
                    <strong>#${entry.rank}</strong>
                    <span>${escapeHtml(entry.title)}</span>
                    <span>${escapeHtml(entry.verification_label)}</span>
                    <span>${entry.source_count} ${copy.sourcesShort}</span>
                    <span>${escapeHtml(entry.readiness_label)}</span>
                  </a>
                `
              )
              .join("")}
          </div>
        </div>
        <aside class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.radarSourceMixLabel}</p>
              <h2>${copy.radarSourceMixTitle}</h2>
            </div>
          </div>
          <div class="source-bars">
            ${radar.sourceMix
              .map(
                (source) => `
                  <div class="source-bar-row">
                    <div class="source-bar-head">
                      <span>${escapeHtml(source.label)}</span>
                      <strong>${source.count}</strong>
                    </div>
                    <div class="source-bar-track"><div class="source-bar-fill" style="width:${Math.max(18, source.count * 12)}%"></div></div>
                  </div>
                `
              )
              .join("")}
          </div>
        </aside>
      </section>
    `
  });
}

export function renderWorkflowPage(state, language, workflow, adsConfig) {
  const copy = getRenderCopy(state, language);

  return renderLayout({
    state,
    language,
    path: `/${language}/workflow`,
    adsConfig,
    title: `${copy.workflowTitle} | ${state.site.name}`,
    description: copy.workflowText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.workflowLabel}</p>
        <h1>${copy.workflowTitle}</h1>
        <p>${copy.workflowText}</p>
      </section>

      <section class="lane-grid workflow-grid">
        ${workflow.steps
          .map(
            (step) => `
              <article class="lane-card workflow-step">
                <h2>${escapeHtml(step.title)}</h2>
                <p>${escapeHtml(step.body)}</p>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="section-grid">
        <div class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.workflowMatrixLabel}</p>
              <h2>${escapeHtml(workflow.matrixLabel)}</h2>
            </div>
          </div>
          <div class="newsroom-strip metrics-strip">
            ${workflow.contentMatrix
              .map(
                (entry) => `
                  <article class="newsroom-card stat">
                    <p class="eyebrow">${escapeHtml(entry.label)}</p>
                    <h2>${entry.count}</h2>
                  </article>
                `
              )
              .join("")}
          </div>
        </div>
        <aside class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.workflowGuardrailsLabel}</p>
              <h2>${copy.workflowGuardrailsTitle}</h2>
            </div>
          </div>
          <ul class="guardrail-list">
            ${workflow.guardrails.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
          </ul>
        </aside>
      </section>

      <section class="section-block">
        <div class="section-head">
          <div>
            <p class="eyebrow">${copy.workflowEndpointsLabel}</p>
            <h2>${escapeHtml(workflow.endpointsLabel)}</h2>
          </div>
        </div>
        <div class="endpoint-grid">
          ${workflow.endpoints.map((entry) => `<a class="endpoint-chip" href="${entry}">${escapeHtml(entry)}</a>`).join("")}
        </div>
      </section>
    `
  });
}

export function renderDashboardPage(state, language, dashboard, adsConfig) {
  const copy = getRenderCopy(state, language);

  return renderLayout({
    state,
    language,
    path: `/${language}/dashboard`,
    adsConfig,
    title: `${copy.dashboardTitle} | ${state.site.name}`,
    description: copy.dashboardText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.dashboardLabel}</p>
        <h1>${copy.dashboardTitle}</h1>
        <p>${copy.dashboardText}</p>
      </section>

      <section class="newsroom-strip metrics-strip">
        ${dashboard.headlineCards
          .map(
            (card) => `
              <article class="newsroom-card stat">
                <p class="eyebrow">${escapeHtml(card.label)}</p>
                <h2>${card.value}</h2>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="section-grid">
        <div class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.dashboardStreamLabel}</p>
              <h2>${copy.dashboardStreamTitle}</h2>
            </div>
          </div>
          <div class="queue-table">
            ${dashboard.signalStream
              .map(
                (entry) => `
                  <a class="queue-row" href="${entry.href}">
                    <strong>${escapeHtml(entry.topic)}</strong>
                    <span>${escapeHtml(entry.title)}</span>
                    <span>${escapeHtml(entry.verification_label)}</span>
                    <span>${escapeHtml(entry.source_label)}</span>
                    <span>${escapeHtml(entry.action)}</span>
                  </a>
                `
              )
              .join("")}
          </div>
        </div>
        <aside class="section-block">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.dashboardHeatLabel}</p>
              <h2>${copy.dashboardHeatTitle}</h2>
            </div>
          </div>
          <div class="source-bars">
            ${dashboard.topicHeat
              .map(
                (topic) => `
                  <div class="source-bar-row">
                    <div class="source-bar-head">
                      <span>${escapeHtml(topic.label)}</span>
                      <strong>${topic.count}</strong>
                    </div>
                    <div class="source-bar-track"><div class="source-bar-fill" style="width:${Math.max(18, topic.count * 18)}%; background:linear-gradient(90deg, ${topic.accent}, var(--accent));"></div></div>
                  </div>
                `
              )
              .join("")}
          </div>
        </aside>
      </section>

      <section class="lane-grid workflow-grid">
        ${dashboard.statusBoard
          .map(
            (lane) => `
              <article class="lane-card lane-${lane.status}">
                <div class="section-head">
                  <div>
                    <p class="eyebrow">${escapeHtml(lane.label)}</p>
                    <h2>${copy.dashboardLaneTitle}</h2>
                  </div>
                </div>
                <div class="stack-list">
                  ${lane.stories.map((article) => renderStackItem(article, language, true)).join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="section-block">
        <div class="section-head">
          <div>
            <p class="eyebrow">${copy.dashboardRepoLabel}</p>
            <h2>${copy.dashboardRepoTitle}</h2>
          </div>
        </div>
        <ul class="guardrail-list">
          ${dashboard.repoChecklist.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}
        </ul>
      </section>
    `
  });
}

export function renderTopicPage(state, language, topicPage, adsConfig) {
  const copy = getRenderCopy(state, language);
  return renderLayout({
    state,
    language,
    path: `/${language}/topics/${topicPage.slug}`,
    adsConfig,
    title: `${topicPage.label} | ${state.site.name}`,
    description: language === "vi" ? `Chuyên mục ${topicPage.label} của Patrick Tech Media.` : `${topicPage.label} coverage from Patrick Tech Media.`,
    content: `
      <section class="simple-hero" style="--topic-accent:${topicPage.accent}">
        <p class="eyebrow">${copy.topicLabel}</p>
        <h1>${escapeHtml(topicPage.label)}</h1>
        <p>${copy.topicIntro}</p>
      </section>
      ${renderSlot(adsConfig, { language, pageAllowsAds: true, placement: "inline" })}
      <section class="story-grid">
        ${topicPage.stories.map((article) => renderStoryCard(article, language)).join("")}
      </section>
    `
  });
}

export function renderArticlePage(state, language, article, relatedStories, adsConfig, options = {}) {
  const copy = getRenderCopy(state, language);
  const verification = getVerificationMeta(article.verification_state, language);
  const shouldShowBadge = Boolean(article.editorial_label);
  const feedback = options.feedback || { reactions: [], comments: [], totalComments: 0, totalReactions: 0 };
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.summary,
    inLanguage: language,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    mainEntityOfPage: article.canonicalUrl,
    image: article.hero_image?.url,
    author: { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: state.site.name,
      url: state.site.siteUrl
    }
  };

  return renderLayout({
    state,
    language,
    path: article.href,
    alternateHref: article.alternates[0]?.href || null,
    adsConfig,
    title: `${article.title} | ${state.site.name}`,
    description: article.summary,
    schema: articleSchema,
    content: `
      <article class="article-shell">
        <header class="article-header">
          <div class="story-meta-line">
            <span class="pill">${escapeHtml(article.content_type_label)}</span>
            <a href="/${language}/topics/${article.topic_slug}">${escapeHtml(article.topic_label)}</a>
            <span>${escapeHtml(formatPublishDate(language, article.published_at))}</span>
          </div>
          ${shouldShowBadge ? `<div class="story-flag">${escapeHtml(article.editorial_label)}</div>` : ""}
          <h1>${escapeHtml(article.title)}</h1>
          <p class="article-hook">${escapeHtml(article.hook || article.dek)}</p>
          ${shouldRenderSeparateDek(article) ? `<p class="article-dek">${escapeHtml(article.dek)}</p>` : ""}
          <div class="article-byline">
            <span>${escapeHtml(article.author.name)}</span>
            <span>${escapeHtml(article.author.role[language])}</span>
          </div>
          <div class="verification-note">
            <strong>${escapeHtml(verification.label)}</strong>
            <span>${escapeHtml(verification.description)}</span>
          </div>
        </header>

        ${renderArticleHero(article)}

        <div class="article-layout">
          <div class="article-content">
            <p class="article-summary">${escapeHtml(article.summary)}</p>
            ${renderSlot(adsConfig, { language, pageAllowsAds: article.ad_eligible, placement: "inline" })}
            ${article.sections
              .map(
                (section, index) => `
                  <section class="article-section">
                    <h2>${escapeHtml(section.heading)}</h2>
                    <p>${escapeHtml(section.body)}</p>
                  </section>
                  ${index === 1 ? renderSlot(adsConfig, { language, pageAllowsAds: article.ad_eligible, placement: "mid" }) : ""}
                `
              )
              .join("")}
            <section class="article-section note-surface">
              <h2>${copy.sourceBoxTitle}</h2>
              <ul class="source-list">
                ${article.source_set
                  .map(
                    (source) => `
                      <li>
                        <a href="${source.source_url}">${escapeHtml(source.source_name)}</a>
                        <span>${escapeHtml(source.source_type)}</span>
                        <span>${escapeHtml(source.region)}</span>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            </section>

            ${
              article.store_link_mode !== "off"
                ? renderStorePanel(state, article, language)
                : ""
            }

            ${renderArticleCommunity(article, feedback, language, options.viewer, {
              notice: options.notice || "",
              error: options.error || "",
              csrf: options.csrf || {}
            })}

            <section class="article-section">
              <h2>${copy.relatedLabel}</h2>
              <div class="story-grid compact-grid">
                ${relatedStories.map((story) => renderStoryCard(story, language)).join("")}
              </div>
            </section>
          </div>

          <aside class="article-rail">
            <div class="rail-card">
              <p class="rail-label">${copy.articleRailLabel}</p>
              <p>${escapeHtml(article.ad_eligible ? copy.adsOn : copy.adsOff)}</p>
            </div>
            <div class="rail-card">
              <p class="rail-label">${copy.languageSwitchLabel}</p>
              ${article.alternates
                .map((alternate) => `<a class="text-link" href="${alternate.href}">${alternate.language.toUpperCase()}</a>`)
                .join("")}
            </div>
          </aside>
        </div>
      </article>
    `
  });
}

export function renderPolicyPage(state, language, page, adsConfig) {
  return renderLayout({
    state,
    language,
    path: `/${language}/${page.key}`,
    adsConfig,
    title: `${page.titles[language]} | ${state.site.name}`,
    description: page.intros[language],
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${language === "vi" ? "Chính sách" : "Policy"}</p>
        <h1>${escapeHtml(page.titles[language])}</h1>
        <p>${escapeHtml(page.intros[language])}</p>
      </section>
      <section class="policy-stack">
        ${page.sections[language]
          .map(
            (section) => `
              <article class="policy-card">
                <h2>${escapeHtml(section.heading)}</h2>
                <p>${escapeHtml(section.body)}</p>
              </article>
            `
          )
          .join("")}
      </section>
    `
  });
}

export function renderAuthorsPage(state, language, authors, adsConfig) {
  const copy = getRenderCopy(state, language);
  return renderLayout({
    state,
    language,
    path: `/${language}/authors`,
    adsConfig,
    title: `${copy.authorsTitle} | ${state.site.name}`,
    description: copy.authorsText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.authorsLabel}</p>
        <h1>${copy.authorsTitle}</h1>
        <p>${copy.authorsText}</p>
      </section>
      <section class="author-grid">
        ${authors
          .map(
            (author) => `
              <article class="author-card" id="${author.id}">
                <h2>${escapeHtml(author.name)}</h2>
                <p class="author-role">${escapeHtml(author.role[language])}</p>
                <p>${escapeHtml(author.bio[language])}</p>
              </article>
            `
          )
          .join("")}
      </section>
    `
  });
}

export function renderHumanSitemapPage(state, language, groups, adsConfig) {
  const copy = getRenderCopy(state, language);
  return renderLayout({
    state,
    language,
    path: `/${language}/sitemap`,
    adsConfig,
    title: `${copy.sitemapTitle} | ${state.site.name}`,
    description: copy.sitemapText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.sitemapLabel}</p>
        <h1>${copy.sitemapTitle}</h1>
        <p>${copy.sitemapText}</p>
      </section>
      <section class="topic-band">
        ${groups
          .map(
            (group) => `
              <article class="topic-column">
                <div class="topic-title-row">
                  <h2>${escapeHtml(group.label)}</h2>
                </div>
                <div class="stack-list">
                  ${group.links
                    .map(
                      (link) => `
                        <article class="stack-item">
                          <a href="${link.href}">${escapeHtml(link.label)}</a>
                        </article>
                      `
                    )
                    .join("")}
                </div>
              </article>
            `
          )
          .join("")}
      </section>
    `
  });
}

export function renderNotFoundPage(state, language, adsConfig) {
  const copy = getRenderCopy(state, language);
  return renderLayout({
    state,
    language,
    path: `/${language}/404`,
    adsConfig,
    title: `404 | ${state.site.name}`,
    description: copy.notFoundText,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">404</p>
        <h1>${copy.notFoundTitle}</h1>
        <p>${copy.notFoundText}</p>
        <a class="read-link" href="/${language}/">${copy.backHome}</a>
      </section>
    `
  });
}

function renderLayout({ state, language, path, alternateHref = null, adsConfig, title, description, content, schema = null }) {
  const copy = getRenderCopy(state, language);
  const alternatePath =
    alternateHref || path.replace(/^\/(vi|en)\//, (_, current) => `/${current === "vi" ? "en" : "vi"}/`);
  const nav = getPrimaryNav(state, language);
  const footerLinks = getFooterLinks(language);
  const homePath = `/${language}/`;
  const canonicalUrl = `${state.site.siteUrl}${path}`;
  const assetVersion = encodeURIComponent(state.site.assetVersion || "patrick-tech-media");
  const logoPath = `/patrick-tech-media-mark.svg?v=${assetVersion}`;
  const iconPath = `/patrick-tech-media-icon.svg?v=${assetVersion}`;
  const stylesheetPath = `/site.css?v=${assetVersion}`;
  const scriptPath = `/site.js?v=${assetVersion}`;
  const ogImageUrl = `${state.site.siteUrl}${logoPath}`;
  const headTags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
    `<link rel="icon" href="${iconPath}" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="${iconPath}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<link rel="alternate" hreflang="${language}" href="${canonicalUrl}" />`,
    `<link rel="alternate" hreflang="${language === "vi" ? "en" : "vi"}" href="${state.site.siteUrl}${alternatePath}" />`,
    `<meta property="og:site_name" content="${escapeHtml(state.site.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${ogImageUrl}" />`,
    `<meta property="og:type" content="${schema?.["@type"] === "NewsArticle" ? "article" : "website"}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${ogImageUrl}" />`,
    `<link rel="stylesheet" href="${stylesheetPath}" />`,
    `<script defer src="${scriptPath}"></script>`
  ];

  if (adsConfig.client) {
    headTags.push(
      `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsConfig.client}" crossorigin="anonymous"></script>`
    );
  }

  if (schema) {
    headTags.push(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`);
  }

  return `<!doctype html>
<html lang="${language}">
  <head>
    ${headTags.join("\n    ")}
  </head>
  <body>
    <div class="backdrop"></div>
    <div class="site-shell">
      <header class="topbar">
        <a class="brand-lockup" href="${homePath}">
          <img class="brand-logo" src="${logoPath}" alt="${escapeHtml(state.site.name)}" />
        </a>
        <nav class="nav-strip" aria-label="Primary">
          ${nav.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
        </nav>
        <div class="topbar-actions">
          <a class="lang-pill" href="/${language}/portal">${language === "vi" ? "Viết bài" : "Write"}</a>
          <a class="lang-pill" href="/${language}/login">${language === "vi" ? "Đăng nhập" : "Login"}</a>
          <a class="lang-pill" href="${alternatePath}">${language === "vi" ? "EN" : "VI"}</a>
          <a class="lang-pill subtle" href="/${language}/store">${copy.storeLabel}</a>
        </div>
      </header>

      <main class="page-body">
        ${content}
      </main>

      <footer class="site-footer">
        <div class="footer-brand">
          <strong>${state.site.name}</strong>
          <p>${escapeHtml(copy.footerBlurb || state.site.shortDescription?.[language] || state.site.description[language])}</p>
        </div>
        <div class="footer-links">
          ${footerLinks.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join("")}
          <a href="/${language}/sitemap">${copy.humanSitemapLabel}</a>
        </div>
      </footer>
    </div>
  </body>
</html>`;
}

function renderStoryCard(article, language) {
  const searchIndex = [article.title, article.hook || "", article.summary, article.topic_label, article.verification_state].join(" ").toLowerCase();
  const displayTitle = getDisplayHeadline(article.title, 82);
  return `
    <article class="story-card topic-${article.topic}" data-story-card data-status="${article.verification_state}" data-topic="${article.topic}" data-search="${escapeHtml(searchIndex)}">
      ${renderStoryImage(article, "story-media")}
      <div class="story-meta-line">
        <span class="pill">${escapeHtml(article.content_type_label)}</span>
        <span>${escapeHtml(article.topic_label)}</span>
      </div>
      ${article.editorial_label ? `<div class="story-flag">${escapeHtml(article.editorial_label)}</div>` : ""}
      <h3><a href="${article.href}">${escapeHtml(displayTitle)}</a></h3>
      <div class="story-footer">
        <span>${escapeHtml(formatPublishDate(language, article.published_at))}</span>
        <a class="mini-link" href="${article.href}">${language === "vi" ? "Đọc" : "Read"}</a>
      </div>
    </article>
  `;
}

function renderStackItem(article, language, withBadge) {
  const displayTitle = getDisplayHeadline(article.title, 76);
  return `
    <article class="stack-item">
      <div class="stack-row">
        ${renderStoryImage(article, "stack-media")}
        <div class="stack-copy">
          <div class="stack-topline">
            <span>${escapeHtml(article.topic_label)}</span>
            ${withBadge && article.editorial_label ? `<span>${escapeHtml(article.editorial_label)}</span>` : ""}
          </div>
          <a href="${article.href}">${escapeHtml(displayTitle)}</a>
          <span class="stack-date">${escapeHtml(formatPublishDate(language, article.published_at))}</span>
        </div>
      </div>
    </article>
  `;
}

function renderStoryExcerpt(article) {
  if (article.summary && article.hook && article.summary !== article.hook) {
    return article.summary;
  }

  if (article.dek && article.dek !== article.hook) {
    return article.dek;
  }

  return article.summary || article.dek || "";
}

function renderLeadFeature(article, language, copy) {
  const displayTitle = getDisplayHeadline(article.title, 74);
  return `
    <article class="lead-feature topic-${article.topic}">
      ${renderStoryImage(article, "lead-feature-media", true)}
      <div class="lead-feature-overlay"></div>
      <div class="lead-feature-copy">
        <div class="lead-feature-topline">
          <span class="pill hot-pill">${copy.hotLabel}</span>
          <span>${escapeHtml(article.topic_label)}</span>
          <span>${escapeHtml(formatPublishDate(language, article.published_at))}</span>
        </div>
        ${article.editorial_label ? `<div class="story-flag lead-flag">${escapeHtml(article.editorial_label)}</div>` : ""}
        <h2><a href="${article.href}">${escapeHtml(displayTitle)}</a></h2>
        <div class="lead-feature-actions">
          <a class="read-link inverted" href="${article.href}">${copy.readStory}</a>
          <span class="lead-feature-source">${escapeHtml(article.content_type_label)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderLeadMini(article, language) {
  const displayTitle = getDisplayHeadline(article.title, 64);
  return `
    <article class="lead-mini topic-${article.topic}">
      ${renderStoryImage(article, "lead-mini-media")}
      <div class="lead-mini-copy">
        <div class="stack-topline">
          <span>${escapeHtml(article.topic_label)}</span>
          <span>${escapeHtml(formatPublishDate(language, article.published_at))}</span>
        </div>
        <h3><a href="${article.href}">${escapeHtml(displayTitle)}</a></h3>
      </div>
    </article>
  `;
}

function renderHeadlineItem(article, language, index) {
  const displayTitle = getDisplayHeadline(article.title, 74);
  return `
    <a class="headline-item" href="${article.href}">
      <span class="headline-index">${String(index).padStart(2, "0")}</span>
      <div>
        <strong>${escapeHtml(displayTitle)}</strong>
        <span>${escapeHtml(article.topic_label)} · ${escapeHtml(formatPublishDate(language, article.published_at))}</span>
      </div>
    </a>
  `;
}

function renderRibbonItem(article, language) {
  const displayTitle = getDisplayHeadline(article.title, 68);
  return `
    <a class="ribbon-item" href="${article.href}">
      <span>${escapeHtml(article.topic_label)}</span>
      <strong>${escapeHtml(displayTitle)}</strong>
      <em>${escapeHtml(formatPublishDate(language, article.published_at))}</em>
    </a>
  `;
}

function renderHeroReaderAside(home, language, copy) {
  const quickReads = dedupeStories(home.latest).slice(0, 3);
  const hotReads = dedupeStories(home.trending).slice(0, 2);

  return `
    <aside class="hero-aside hero-reader-aside">
      <article class="reader-card">
        <div class="reader-card-head">
          <div>
            <p class="eyebrow">${copy.readerStartLabel}</p>
            <h3>${copy.readerStartTitle}</h3>
          </div>
        </div>
        <div class="reader-list">
          ${quickReads
            .map(
              (article, index) => `
                <a class="reader-list-item" href="${article.href}">
                  <span class="reader-index">0${index + 1}</span>
                  <div>
                    <strong>${escapeHtml(article.title)}</strong>
                    <span>${escapeHtml(article.topic_label)} · ${escapeHtml(formatPublishDate(language, article.published_at))}</span>
                  </div>
                </a>
              `
            )
            .join("")}
        </div>
      </article>

      <article class="reader-card">
        <div class="reader-card-head">
          <div>
            <p class="eyebrow">${copy.readerWatchLabel}</p>
            <h3>${copy.readerWatchTitle}</h3>
          </div>
        </div>
        <div class="reader-list compact">
          ${hotReads
            .map(
              (article) => `
                <a class="reader-list-item compact" href="${article.href}">
                  <div>
                    <strong>${escapeHtml(article.title)}</strong>
                    <span>${escapeHtml(article.editorial_label || article.topic_label)}</span>
                  </div>
                </a>
              `
            )
            .join("")}
        </div>
      </article>
    </aside>
  `;
}

function renderHeroNotebook(home, language, copy) {
  const spotlightStories = dedupeStories([home.featured, ...home.latest, ...home.trending]).slice(0, 3);

  return `
    <section class="hero-notebook">
      <div class="hero-notebook-head">
        <div>
          <p class="eyebrow">${copy.heroNotebookLabel}</p>
          <h2>${copy.heroNotebookTitle}</h2>
        </div>
        <a class="mini-link" href="#latest">${copy.heroNotebookCta}</a>
      </div>
      <div class="hero-notebook-list">
        ${spotlightStories
          .map(
            (article) => `
              <a class="hero-notebook-item" href="${article.href}">
                <div>
                  <strong>${escapeHtml(article.title)}</strong>
                  <p>${escapeHtml(article.hook || article.summary)}</p>
                </div>
                <span>${escapeHtml(article.topic_label)}</span>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function dedupeStories(stories) {
  const seen = new Set();
  const output = [];

  for (const story of stories) {
    if (!story || seen.has(story.href)) {
      continue;
    }

    seen.add(story.href);
    output.push(story);
  }

  return output;
}

function excludeStories(stories, excluded) {
  const blocked = new Set((excluded || []).filter(Boolean).map((story) => story.href));
  return (stories || []).filter((story) => story && !blocked.has(story.href));
}

function shouldRenderSeparateDek(article) {
  if (!article.dek) {
    return false;
  }

  const hook = String(article.hook || "").toLowerCase();
  const dek = String(article.dek || "").toLowerCase();
  return Boolean(dek) && (!hook || !hook.includes(dek));
}

function renderStoryImage(article, className, eager = false) {
  const placeholderClass = className === "stack-media" ? "stack-placeholder-card" : "story-placeholder-card";

  if (article.hero_image.kind !== "source") {
    return `
      <figure class="${className} story-placeholder">
        ${renderImagePlaceholder(article, placeholderClass)}
      </figure>
    `;
  }

  return `
    <figure class="${className}" data-story-image>
      <img src="${article.hero_image.src}" alt="${escapeHtml(article.hero_image.alt)}" loading="${eager ? "eager" : "lazy"}" decoding="async" />
      <div class="story-image-fallback" aria-hidden="true">
        ${renderImagePlaceholder(article, placeholderClass)}
      </div>
    </figure>
  `;
}

function renderArticleHero(article) {
  if (article.hero_image.kind !== "source") {
    return `
      <figure class="article-hero-media article-hero-media-placeholder">
        ${renderImagePlaceholder(article, "article-placeholder-card")}
        <figcaption>${escapeHtml(article.hero_image.caption)}</figcaption>
      </figure>
    `;
  }

  return `
    <figure class="article-hero-media" data-story-image>
      <img src="${article.hero_image.src}" alt="${escapeHtml(article.hero_image.alt)}" loading="eager" decoding="async" />
      <div class="story-image-fallback article-image-fallback" aria-hidden="true">
        ${renderImagePlaceholder(article, "article-placeholder-card")}
      </div>
      <figcaption>${escapeHtml(article.hero_image.caption)}${article.hero_image.credit ? ` <span>${escapeHtml(article.hero_image.credit)}</span>` : ""}</figcaption>
    </figure>
  `;
}

function renderImagePlaceholder(article, className) {
  return `
    <div class="${className}">
      <span>${escapeHtml(article.topic_label)}</span>
      <strong>${escapeHtml(article.hero_image.label)}</strong>
      <p>${escapeHtml(article.hero_image.caption)}</p>
    </div>
  `;
}

function renderLiveDesk(liveDesk, language, copy) {
  return `
    <section class="live-desk" data-live-desk data-lang="${language}">
      <div class="live-desk-head">
        <div>
          <p class="rail-label">${copy.liveLabel}</p>
          <h3>${copy.liveTitle}</h3>
        </div>
        <span class="live-ping"></span>
      </div>
      <p class="live-refresh-line">
        <strong>${copy.liveRefreshLabel}</strong>
        <span data-live-refreshed>${escapeHtml(liveDesk.cards[0].value)}</span>
        <span class="live-separator">•</span>
        <strong>${copy.liveNextLabel}</strong>
        <span data-live-next>${escapeHtml(new Date(liveDesk.nextRefreshAt).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" }))}</span>
      </p>
      <div class="live-grid">
        ${liveDesk.cards
          .map(
            (card) => `
              <article class="live-card">
                <span>${escapeHtml(card.label)}</span>
                <strong data-live-card="${card.id}">${escapeHtml(card.value)}</strong>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="live-ticker" data-live-ticker>
        ${liveDesk.ticker
          .map(
            (item) => `
              <a class="live-item" href="${item.href}">
                <span>${escapeHtml(item.topic)}</span>
                <strong>${escapeHtml(item.title)}</strong>
                <em>${escapeHtml(item.updated_text)}</em>
              </a>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderArticleCommunity(article, feedback, language, viewer, { notice = "", error = "", csrf = {} }) {
  const copy = getRenderCopy({ site: { frontpageCopy: {} } }, language);
  const viewerName = viewer?.name || "";

  return `
    <section class="article-section feedback-section" id="community">
      <div class="feedback-head">
        <div>
          <p class="eyebrow">${copy.communityLabel}</p>
          <h2>${copy.communityTitle}</h2>
        </div>
        <p>${copy.communityText}</p>
      </div>

      ${notice ? `<p class="feedback-notice is-success">${escapeHtml(notice)}</p>` : ""}
      ${error ? `<p class="feedback-notice is-error">${escapeHtml(error)}</p>` : ""}

      <form class="reaction-bar" method="post" action="/article/reactions">
        <input type="hidden" name="lang" value="${language}" />
        ${renderCsrfInput(csrf.articleReactions)}
        <input type="hidden" name="article_id" value="${escapeHtml(article.id)}" />
        <input type="hidden" name="article_href" value="${escapeHtml(article.href)}" />
        <input type="hidden" name="return_to" value="${escapeHtml(article.href)}" />
        ${feedback.reactions
          .map(
            (reaction) => `
              <button class="reaction-button" type="submit" name="reaction" value="${reaction.id}">
                <span>${reaction.emoji}</span>
                <strong>${escapeHtml(reaction.label)}</strong>
                <em>${reaction.count}</em>
              </button>
            `
          )
          .join("")}
      </form>

      <div class="comment-shell">
        <form class="comment-form" method="post" action="/article/comments">
          <input type="hidden" name="lang" value="${language}" />
          ${renderCsrfInput(csrf.articleComments)}
          <input type="hidden" name="article_id" value="${escapeHtml(article.id)}" />
          <input type="hidden" name="article_href" value="${escapeHtml(article.href)}" />
          <input type="hidden" name="return_to" value="${escapeHtml(article.href)}" />
          <label class="field">
            <span>${copy.commentNameLabel}</span>
            <input name="name" type="text" value="${escapeHtml(viewerName)}" ${viewerName ? `readonly` : `placeholder="${escapeHtml(copy.commentNamePlaceholder)}"`} />
          </label>
          <label class="field">
            <span>${copy.commentBodyLabel}</span>
            <textarea name="comment" rows="4" required placeholder="${escapeHtml(copy.commentBodyPlaceholder)}"></textarea>
          </label>
          <button class="action-button" type="submit">${copy.commentSubmitLabel}</button>
        </form>

        <div class="comment-list">
          <div class="comment-list-head">
            <p class="eyebrow">${copy.commentListLabel}</p>
            <strong>${feedback.totalComments}</strong>
          </div>
          ${
            feedback.comments.length
              ? feedback.comments
                  .map(
                    (comment) => `
                      <article class="comment-card">
                        <div class="comment-card-head">
                          <strong>${escapeHtml(comment.author_name)}</strong>
                          <span>${escapeHtml(formatPublishDate(language, comment.created_at))}</span>
                        </div>
                        <p>${escapeHtml(comment.body)}</p>
                      </article>
                    `
                  )
                  .join("")
              : `<p class="comment-empty">${copy.commentEmpty}</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderStorePanel(state, article, language) {
  const copy = getRenderCopy(state, language);
  const cards = article.related_store_cards.slice(0, article.store_link_mode === "full" ? 2 : 1);

  return `
    <section class="article-section store-panel ${article.store_link_mode}">
      <div class="store-panel-head">
        <p class="eyebrow">${copy.storePanelLabel}</p>
        <h2>${copy.storePanelTitle}</h2>
      </div>
      <div class="story-grid compact-grid">
        ${cards
          .map(
            (item) => `
              <article class="story-card store-card">
                <h3><a href="${item.url}">${escapeHtml(item.title[language])}</a></h3>
                <p>${escapeHtml(item.description[language])}</p>
                <a class="mini-link" href="${item.url}">${copy.visitStore}</a>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSlot(adsConfig, { language, pageAllowsAds, placement }) {
  if (!pageAllowsAds) {
    return "";
  }

  const label = language === "vi" ? "Khu vực quảng cáo" : "Advertising slot";
  const slotId = adsConfig.slots[placement];
  const storeUrl = "https://patricktechstore.vercel.app";

  if (adsConfig.client && slotId) {
    return `
      <section class="ad-shell">
        <p class="ad-label">${label}</p>
        <ins class="adsbygoogle ad-slot" style="display:block" data-ad-client="${adsConfig.client}" data-ad-slot="${slotId}" data-ad-format="auto" data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      </section>
    `;
  }

  return `
    <section class="ad-shell placeholder store-promo-shell">
      <p class="ad-label">${label}</p>
      <a class="ad-slot placeholder-slot store-promo-slot" href="${storeUrl}" target="_blank" rel="noreferrer">
        <span class="store-promo-kicker">${language === "vi" ? "Patrick Tech Store" : "Patrick Tech Store"}</span>
        <strong>${language === "vi" ? "Tài khoản, tool và phần mềm đang bán tại store" : "Accounts, tools, and software now available in the store"}</strong>
        <span>${language === "vi" ? "Tạm thời vị trí này ưu tiên cho hệ sinh thái Patrick Tech." : "This slot is temporarily dedicated to the Patrick Tech ecosystem."}</span>
      </a>
    </section>
  `;
}

function renderCsrfInput(token) {
  return token ? `<input type="hidden" name="csrf_token" value="${escapeHtml(token)}" />` : "";
}

function getRenderCopy(state, language) {
  return {
    ...getCopy(language),
    ...(state?.site?.frontpageCopy?.[language] || {})
  };
}

function getCopy(language) {
  if (language === "vi") {
    return {
      homeTitle: "Patrick Tech Media | Tin công nghệ Việt Nam và thế giới",
      eyebrow: "Toà soạn song ngữ",
      heroTitle: "Tin AI, Big Tech và công nghệ đáng mở đầu ngày.",
      heroText:
        "Patrick Tech Media theo sát AI, nền tảng lớn, mạng xã hội, phần mềm, thiết bị và những mẹo công nghệ đáng giữ lại.",
      badgeSignals: "Việt Nam + thế giới",
      badgeAds: "AI, Big Tech, social",
      badgeBilingual: "Tin mới + thủ thuật",
      heroNotebookLabel: "Điểm đáng đọc",
      heroNotebookTitle: "Mở vào là thấy ngay những gì đáng bấm trước.",
      heroNotebookCta: "Xem thêm tin mới",
      readerStartLabel: "Vừa lên",
      readerStartTitle: "3 bài mới để bắt nhịp",
      readerWatchLabel: "Được chú ý",
      readerWatchTitle: "2 câu chuyện đang được bàn tán",
      liveLabel: "Live desk",
      liveTitle: "Nhịp cập nhật newsroom",
      liveRefreshLabel: "Làm mới",
      liveNextLabel: "Tiếp theo",
      clusters: "cụm chủ đề đang hoạt động",
      sourceFamilies: "nhóm nguồn",
      verifiedStories: "bài verified",
      emergingStories: "bài emerging",
      trendStories: "bài trend",
      readStory: "Đọc bài nổi bật",
      briefingLabel: "Đọc nhanh",
      policyLabel: "Nhịp biên tập",
      policyText: "Tòa soạn vẫn lên bài nhanh, nhưng chỉ bật quảng cáo ở những trang đã đủ ngưỡng kiểm chứng và trình bày.",
      viewPolicy: "Xem chính sách biên tập",
      latestLabel: "Mới nhất",
      latestTitle: "Tin mới nhất",
      trendingLabel: "Đang theo dõi",
      trendingTitle: "Những câu chuyện cần để mắt",
      evergreenLabel: "Thủ thuật & hướng dẫn",
      evergreenTitle: "Bài đọc xong dùng được ngay",
      tipsLabel: "Thủ thuật",
      tipsTitle: "Hướng dẫn và mẹo đáng lưu",
      updateLabel: "Vừa lên",
      updateTitle: "3 tin mới để bắt nhịp",
      updateText: "Mở nhanh những bài mới nhất nếu bạn muốn nắm nhịp ngay từ đầu.",
      ecosystemLabel: "Công ty",
      ecosystemTitle: "Patrick Tech Co. VN",
      ecosystemText: "Patrick Tech Media nằm trong hệ sinh thái Patrick Tech Co. VN, nối newsroom với Patrick Tech Store theo một mạch công nghệ thống nhất.",
      visitStore: "Đi tới Patrick Tech Store",
      radarLabel: "Newsroom radar",
      radarTitle: "Xem newsroom radar hoạt động",
      radarText: "Bảng này gom lane trend, emerging và verified để bạn thấy rõ newsroom đang ưu tiên câu chuyện nào và vì sao.",
      workflowLabel: "Quy trình xuất bản",
      workflowTitle: "Mở quy trình xuất bản",
      workflowText: "Trang workflow giải thích cách bàn tin gom nguồn, xếp hàng chờ biên tập, gắn trạng thái và đưa bài lên site với guardrail quảng cáo.",
      feedLabel: "Feed",
      feedTitle: "Xuất JSON và RSS",
      feedText: "Feed máy đọc được đã sẵn sàng cho phân phối, subscriber inbox hoặc các lớp theo dõi cập nhật về sau.",
      browserLabel: "Lọc theo nhịp đọc",
      browserTitle: "Chọn đúng tuyến bài bạn muốn đọc",
      browserText: "Lọc nhanh theo headline, chủ đề hoặc mức độ kiểm chứng để đi thẳng tới nhóm bài phù hợp với mối quan tâm của bạn.",
      browserPlaceholder: "Tìm theo tiêu đề, topic hoặc trạng thái...",
      filterAll: "Tất cả",
      filterVerified: "Verified",
      filterEmerging: "Emerging",
      filterTrend: "Trend",
      homeSpotlightLabel: "Tiêu điểm",
      homeSpotlightTitle: "Mở bài nổi bật hôm nay",
      homeBriefLabel: "Bản tổng hợp",
      homeBriefTitle: "Đọc nhanh để nắm cả nhịp ngày",
      homeAuthorsLabel: "Đội biên tập",
      homeAuthorsTitle: "Gặp những người đang giữ giọng điệu của newsroom",
      homeAuthorsText: "Mỗi tuyến bài đều có người theo dõi riêng để headline, hook và góc nhìn không bị loãng.",
      moreLabel: "Xem thêm",
      topicLabel: "Chuyên mục",
      topicIntro: "Toàn bộ stories trong chuyên mục này được giữ cùng một cấu trúc xác minh, attribution và tiêu chí bật quảng cáo.",
      radarQueueLabel: "Queue newsroom",
      radarQueueTitle: "Những story đang nổi trong pipeline",
      radarSourceMixLabel: "Source mix",
      radarSourceMixTitle: "Tỉ trọng nguồn đang đi vào newsroom",
      workflowMatrixLabel: "Matrix",
      workflowGuardrailsLabel: "Guardrails",
      workflowGuardrailsTitle: "Những nguyên tắc bảo vệ ads và editorial",
      workflowEndpointsLabel: "Endpoints",
      sourcesShort: "nguồn",
      sourceBoxTitle: "Nguồn tham khảo",
      relatedLabel: "Bài liên quan",
      articleRailLabel: "Biên tập & quảng cáo",
      adsOn: "Trang này đủ điều kiện hiển thị quảng cáo mà vẫn giữ bố cục đọc.",
      adsOff: "Trang này ưu tiên trải nghiệm đọc và không hiển thị quảng cáo.",
      languageSwitchLabel: "Phiên bản ngôn ngữ",
      storePanelLabel: "Từ hệ Patrick Tech",
      storePanelTitle: "Công cụ liên quan theo ngữ cảnh",
      communityLabel: "Cộng đồng",
      communityTitle: "Bạn thấy bài này thế nào?",
      communityText: "Thả cảm xúc hoặc để lại bình luận ngay dưới bài viết.",
      commentNameLabel: "Tên hiển thị",
      commentNamePlaceholder: "Nhập tên của bạn",
      commentBodyLabel: "Bình luận",
      commentBodyPlaceholder: "Viết cảm nhận, góp ý hoặc bổ sung thông tin...",
      commentSubmitLabel: "Gửi bình luận",
      commentListLabel: "Bình luận mới",
      commentEmpty: "Chưa có bình luận nào. Bạn có thể là người mở đầu cuộc trò chuyện.",
      authorsLabel: "Tác giả",
      authorsTitle: "Đội biên tập",
      authorsText: "Mỗi bài đều gắn một biên tập viên phụ trách mảng để giữ góc nhìn nhất quán giữa các đợt cập nhật.",
      footerBlurb: "Tin công nghệ, AI, Big Tech, mạng xã hội và thủ thuật đáng lưu.",
      sitemapLabel: "Sitemap",
      sitemapTitle: "Sơ đồ điều hướng site",
      sitemapText: "Trang này gom các điểm vào chính của site dành cho người đọc và kiểm tra vận hành.",
      notFoundTitle: "Không tìm thấy trang",
      notFoundText: "Route này chưa có nội dung hoặc đã đổi slug.",
      backHome: "Quay về trang chủ",
      dashboardLabel: "Dashboard",
      dashboardTitle: "Bảng điều khiển newsroom",
      dashboardText: "Trang này gom các chỉ số xuất bản, dòng tín hiệu và checklist repo để bạn nhìn site theo góc độ vận hành thay vì chỉ bề mặt public.",
      dashboardStreamLabel: "Signal stream",
      dashboardStreamTitle: "Dòng tín hiệu mới nhất đang đi qua newsroom",
      dashboardHeatLabel: "Topic heat",
      dashboardHeatTitle: "Chủ đề nào đang chiếm ưu tiên",
      dashboardLaneTitle: "Các story đang nằm trong lane này",
      dashboardRepoLabel: "Repo",
      dashboardRepoTitle: "Checklist để đẩy lên GitHub",
      humanSitemapLabel: "Sitemap người đọc",
      storeLabel: "Store",
      heroTitle: "Tin công nghệ mới nhất từ Việt Nam và thế giới.",
      heroText:
        "Patrick Tech Media bám sát AI, Big Tech, mạng xã hội, phần mềm, thiết bị và những thủ thuật đáng lưu, với ưu tiên rõ cho ảnh đẹp và headline đủ lực kéo người đọc vào ngay từ cái nhìn đầu tiên.",
      hotLabel: "Nóng lúc này",
      hotTitle: "Những headline đang kéo lượt đọc",
      editorsLabel: "Biên tập chọn",
      editorsTitle: "Đáng đọc tiếp theo",
      ribbonLabel: "Đường dây nóng",
      ribbonTitle: "Các tin vừa bật lên",
      companyBrief: "Tòa soạn công nghệ của Patrick Tech Co. VN.",
      aboutLabel: "Về Patrick Tech Media"
    };
  }

  return {
    homeTitle: "Patrick Tech Media | Technology from Vietnam and the wider web",
    eyebrow: "Bilingual newsroom",
      heroTitle: "AI, Big Tech, and the technology stories worth opening first.",
      heroText:
        "Patrick Tech Media tracks AI, major platforms, software, devices, and practical how-tos with a cleaner editorial voice.",
    badgeSignals: "Vietnam + world",
    badgeAds: "AI, Big Tech, social",
    badgeBilingual: "News + how-tos",
    heroNotebookLabel: "Worth opening",
    heroNotebookTitle: "The first stories that tell you what matters right now.",
    heroNotebookCta: "More fresh stories",
    readerStartLabel: "Just in",
    readerStartTitle: "3 fresh stories to start with",
    readerWatchLabel: "Getting attention",
    readerWatchTitle: "2 stories readers keep opening",
    liveLabel: "Live desk",
    liveTitle: "Continuous desk updates",
    liveRefreshLabel: "Refreshed",
    liveNextLabel: "Next",
    clusters: "active clusters",
    sourceFamilies: "source families",
    verifiedStories: "verified stories",
    emergingStories: "emerging stories",
    trendStories: "trend stories",
    readStory: "Read the featured piece",
    briefingLabel: "Quick read",
    policyLabel: "Editorial rhythm",
    policyText: "The desk moves quickly, but ads only appear on pages that meet the stronger verification and presentation bar.",
    viewPolicy: "Read the editorial policy",
    latestLabel: "Latest",
    latestTitle: "Latest stories",
    trendingLabel: "Under watch",
    trendingTitle: "The stories worth watching next",
    evergreenLabel: "How-tos and guides",
    evergreenTitle: "Pieces readers can use right away",
    tipsLabel: "How-tos",
    tipsTitle: "Practical guides worth saving",
    updateLabel: "Just in",
    updateTitle: "3 fresh stories to catch the pace",
    updateText: "Open these first if you want the newest turns on the site.",
    ecosystemLabel: "Company",
    ecosystemTitle: "Patrick Tech Co. VN",
    ecosystemText: "Patrick Tech Media sits inside the Patrick Tech Co. VN ecosystem, linking coverage, useful guides, and Patrick Tech Store without splitting the experience.",
    visitStore: "Open Patrick Tech Store",
      radarLabel: "Newsroom radar",
      radarTitle: "See the newsroom radar in motion",
      radarText: "This board groups trend, emerging, and verified lanes so you can quickly see what the newsroom is prioritizing and why.",
      workflowLabel: "Publishing workflow",
      workflowTitle: "Open the publishing workflow",
      workflowText: "The workflow page explains how the desk gathers sources, groups story lines, assigns states, and publishes pages with ad guardrails.",
      feedLabel: "Feed",
      feedTitle: "Export JSON and RSS",
      feedText: "Machine-readable feeds are already available for distribution, inbox digests, or future monitoring layers.",
      browserLabel: "Read by lane",
      browserTitle: "Filter the stream the way you want to read it",
      browserText: "Jump straight to the stories that match the headline style, topic, or level of verification you care about most.",
      browserPlaceholder: "Search by title, topic, or state...",
      filterAll: "All",
      filterVerified: "Verified",
      filterEmerging: "Emerging",
      filterTrend: "Trend",
      homeSpotlightLabel: "Spotlight",
      homeSpotlightTitle: "Start with the strongest lead today",
      homeBriefLabel: "Briefing",
      homeBriefTitle: "Catch the day’s rhythm in one pass",
      homeAuthorsLabel: "Editorial team",
      homeAuthorsTitle: "Meet the people shaping the newsroom voice",
      homeAuthorsText: "Each coverage lane has a real editorial owner so headlines, hooks, and angle do not drift into the same flat tone.",
      moreLabel: "More",
      topicLabel: "Topic",
      topicIntro: "Every story in this section follows the same verification structure, attribution rules, and ad-eligibility logic.",
      radarQueueLabel: "Newsroom queue",
      radarQueueTitle: "Stories now moving through the pipeline",
      radarSourceMixLabel: "Source mix",
      radarSourceMixTitle: "What kinds of sources are entering the newsroom",
      workflowMatrixLabel: "Matrix",
      workflowGuardrailsLabel: "Guardrails",
      workflowGuardrailsTitle: "Rules protecting ads and editorial quality",
      workflowEndpointsLabel: "Endpoints",
      sourcesShort: "sources",
      sourceBoxTitle: "Source notes",
    relatedLabel: "Related stories",
    articleRailLabel: "Editorial and ads",
    adsOn: "This page is eligible to show ads while keeping a clean reading layout.",
    adsOff: "This page stays ad-free to protect the reading experience.",
    languageSwitchLabel: "Language versions",
    storePanelLabel: "From Patrick Tech",
    storePanelTitle: "Contextual tools",
    communityLabel: "Community",
    communityTitle: "What did you think of this story?",
    communityText: "Drop a reaction or leave a comment right below the article.",
    commentNameLabel: "Display name",
    commentNamePlaceholder: "Enter your name",
    commentBodyLabel: "Comment",
    commentBodyPlaceholder: "Share your take, feedback, or extra context...",
    commentSubmitLabel: "Post comment",
    commentListLabel: "Latest comments",
    commentEmpty: "No comments yet. You can start the conversation.",
    authorsLabel: "Authors",
    authorsTitle: "Editorial team",
    authorsText: "Each story is tied to an editor covering the beat so the newsroom keeps a consistent lens across updates.",
    footerBlurb: "Technology, AI, Big Tech, social platforms, and useful how-tos.",
    sitemapLabel: "Sitemap",
    sitemapTitle: "Site navigation map",
    sitemapText: "This page collects the main entry points for readers and operational review.",
    notFoundTitle: "Page not found",
    notFoundText: "This route does not exist yet or the slug has changed.",
    backHome: "Back to home",
    dashboardLabel: "Dashboard",
    dashboardTitle: "The newsroom dashboard",
    dashboardText: "This page collects publishing metrics, live signal flow, and repo-readiness checks so you can review the site as an operating system, not just a front end.",
    dashboardStreamLabel: "Signal stream",
    dashboardStreamTitle: "The latest items moving through the newsroom",
    dashboardHeatLabel: "Topic heat",
    dashboardHeatTitle: "Which topics are winning priority",
    dashboardLaneTitle: "Stories currently sitting in this lane",
    dashboardRepoLabel: "Repo",
    dashboardRepoTitle: "Checklist for pushing to GitHub",
    humanSitemapLabel: "Reader sitemap",
    storeLabel: "Store",
    heroTitle: "Fresh technology news from Vietnam and the wider web.",
    heroText:
      "Patrick Tech Media tracks AI, Big Tech, social platforms, software, devices, and practical how-tos with a front page that gives priority to visual stories and headlines that make people stop scrolling.",
    hotLabel: "Hot now",
    hotTitle: "Headlines pulling readers in",
    editorsLabel: "Editors' picks",
    editorsTitle: "What to open next",
    ribbonLabel: "Fast line",
    ribbonTitle: "Stories that just moved",
    companyBrief: "The technology desk of Patrick Tech Co. VN.",
    aboutLabel: "About Patrick Tech Media"
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDisplayHeadline(value, maxLength) {
  const headline = String(value || "").replace(/\s+/g, " ").trim();

  if (!headline || headline.length <= maxLength) {
    return headline;
  }

  const candidate = headline.slice(0, maxLength + 1);
  const boundary = Math.max(
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf(" — "),
    candidate.lastIndexOf(": "),
    candidate.lastIndexOf(", ")
  );
  const clipped = boundary > Math.floor(maxLength * 0.55) ? candidate.slice(0, boundary) : candidate.slice(0, maxLength);

  return `${clipped.trim().replace(/[,:;.!?\-'"“”‘’]+$/u, "")}…`;
}
