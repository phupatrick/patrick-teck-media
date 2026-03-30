import {
  formatPublishDate,
  getFooterLinks,
  getPrimaryNav,
  getVerificationMeta
} from "./newsroom-service.mjs";

export function renderHomePage(state, language, adsConfig) {
  const home = state.home[language];
  const copy = getCopy(language);
  const path = `/${language}/`;

  return renderLayout({
    state,
    language,
    path,
    adsConfig,
    title: `${state.site.name} | ${copy.homeTitle}`,
    description: state.site.description[language],
    content: `
      <section class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h1>${escapeHtml(copy.heroTitle)}</h1>
          <p class="hero-text">${escapeHtml(copy.heroText)}</p>
          <div class="hero-badges">
            <span>${copy.badgeSignals}</span>
            <span>${copy.badgeAds}</span>
            <span>${copy.badgeBilingual}</span>
          </div>
        </div>
        ${renderHeroReaderAside(home, language, copy)}
      </section>

      <section class="featured-split">
        <article class="featured-story topic-${home.featured.topic}">
          ${renderStoryImage(home.featured, "featured-media", true)}
          <div class="featured-copy">
            <div class="story-meta-line">
              <span class="pill">${escapeHtml(home.featured.content_type_label)}</span>
              <span>${escapeHtml(home.featured.topic_label)}</span>
              <span>${escapeHtml(formatPublishDate(language, home.featured.published_at))}</span>
            </div>
            <h2><a href="${home.featured.href}">${escapeHtml(home.featured.title)}</a></h2>
            <p class="story-hook">${escapeHtml(home.featured.hook || home.featured.dek)}</p>
            ${shouldRenderSeparateDek(home.featured) ? `<p class="story-dek">${escapeHtml(home.featured.dek)}</p>` : ""}
            <p class="story-summary">${escapeHtml(home.featured.summary)}</p>
            <a class="read-link" href="${home.featured.href}">${copy.readStory}</a>
          </div>
        </article>

        <aside class="briefing-rail">
          <div class="rail-card">
            <p class="rail-label">${copy.briefingLabel}</p>
            <h3><a href="${home.briefing.href}">${escapeHtml(home.briefing.title)}</a></h3>
            <p>${escapeHtml(home.briefing.summary)}</p>
          </div>
          <div class="rail-card">
            <p class="rail-label">${copy.policyLabel}</p>
            <p>${copy.policyText}</p>
            <a class="text-link" href="/${language}/editorial-policy">${copy.viewPolicy}</a>
          </div>
        </aside>
      </section>

      <section class="newsroom-strip">
        <a class="newsroom-card radar" href="${home.featured.href}">
          <p class="eyebrow">${copy.homeSpotlightLabel}</p>
          <h2>${copy.homeSpotlightTitle}</h2>
          <p>${escapeHtml(home.featured.hook || home.featured.summary)}</p>
        </a>
        <a class="newsroom-card workflow" href="${home.briefing.href}">
          <p class="eyebrow">${copy.homeBriefLabel}</p>
          <h2>${copy.homeBriefTitle}</h2>
          <p>${escapeHtml(home.briefing.summary)}</p>
        </a>
        <a class="newsroom-card feed" href="/${language}/authors">
          <p class="eyebrow">${copy.homeAuthorsLabel}</p>
          <h2>${copy.homeAuthorsTitle}</h2>
          <p>${copy.homeAuthorsText}</p>
        </a>
      </section>

      ${renderSlot(adsConfig, { language, pageAllowsAds: true, placement: "hero" })}

      <section class="section-grid">
        <div class="section-block">
          <div class="section-head">
            <p class="eyebrow">${copy.latestLabel}</p>
            <h2>${copy.latestTitle}</h2>
          </div>
          <div class="story-grid">
            ${home.latest.map((article) => renderStoryCard(article, language)).join("")}
          </div>
        </div>
        <aside class="section-block trending-block">
          <div class="section-head">
            <p class="eyebrow">${copy.trendingLabel}</p>
            <h2>${copy.trendingTitle}</h2>
          </div>
          <div class="stack-list">
            ${home.trending.map((article) => renderStackItem(article, language, true)).join("")}
          </div>
        </aside>
      </section>

      <section class="section-grid secondary-grid">
        <div class="section-block">
          <div class="section-head">
            <p class="eyebrow">${copy.evergreenLabel}</p>
            <h2>${copy.evergreenTitle}</h2>
          </div>
          <div class="story-grid compact-grid">
            ${home.evergreen.map((article) => renderStoryCard(article, language)).join("")}
          </div>
        </div>
        <aside class="section-block ecosystem-block">
          <div class="section-head">
            <p class="eyebrow">${copy.ecosystemLabel}</p>
            <h2>${copy.ecosystemTitle}</h2>
          </div>
          <p>${copy.ecosystemText}</p>
          <a class="text-link" href="${state.site.storeUrl}">${copy.visitStore}</a>
        </aside>
      </section>

      <section class="section-block browser-block" data-story-browser>
        <div class="section-head">
          <div>
            <p class="eyebrow">${copy.browserLabel}</p>
            <h2>${copy.browserTitle}</h2>
          </div>
          <p class="browser-caption">${copy.browserText}</p>
        </div>
        <div class="browser-controls">
          <input
            class="search-input"
            type="search"
            placeholder="${escapeHtml(copy.browserPlaceholder)}"
            data-story-search
          />
          <div class="chip-row">
            <button class="filter-chip is-active" type="button" data-story-filter="all">${copy.filterAll}</button>
            <button class="filter-chip" type="button" data-story-filter="verified">${copy.filterVerified}</button>
            <button class="filter-chip" type="button" data-story-filter="emerging">${copy.filterEmerging}</button>
            <button class="filter-chip" type="button" data-story-filter="trend">${copy.filterTrend}</button>
          </div>
        </div>
        <div class="story-grid compact-grid" data-story-grid>
          ${home.browserStories.map((article) => renderStoryCard(article, language)).join("")}
        </div>
        <p class="result-count" data-story-count></p>
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
  const copy = getCopy(language);

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
  const copy = getCopy(language);

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
  const copy = getCopy(language);

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
  const copy = getCopy(language);
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

export function renderArticlePage(state, language, article, relatedStories, adsConfig) {
  const copy = getCopy(language);
  const verification = getVerificationMeta(article.verification_state, language);
  const shouldShowBadge = Boolean(article.editorial_label);
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
  const copy = getCopy(language);
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
  const copy = getCopy(language);
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
  const copy = getCopy(language);
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
  const copy = getCopy(language);
  const alternatePath =
    alternateHref || path.replace(/^\/(vi|en)\//, (_, current) => `/${current === "vi" ? "en" : "vi"}/`);
  const nav = getPrimaryNav(state, language);
  const footerLinks = getFooterLinks(language);
  const homePath = `/${language}/`;
  const headTags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${state.site.siteUrl}${path}" />`,
    `<link rel="alternate" hreflang="${language}" href="${state.site.siteUrl}${path}" />`,
    `<link rel="alternate" hreflang="${language === "vi" ? "en" : "vi"}" href="${state.site.siteUrl}${alternatePath}" />`,
    `<link rel="stylesheet" href="/site.css" />`,
    `<script defer src="/site.js"></script>`
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
          <span class="brand-kicker">Patrick Tech</span>
          <strong>${state.site.name}</strong>
        </a>
        <nav class="nav-strip" aria-label="Primary">
          ${nav.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
        </nav>
        <div class="topbar-actions">
          <a class="lang-pill" href="/${language}/portal">${language === "vi" ? "Viết bài" : "Write"}</a>
          <a class="lang-pill" href="/${language}/login">${language === "vi" ? "Đăng nhập" : "Login"}</a>
          <a class="lang-pill" href="${alternatePath}">${language === "vi" ? "EN" : "VI"}</a>
          <a class="lang-pill subtle" href="${state.site.storeUrl}">${copy.storeLabel}</a>
        </div>
      </header>

      <main class="page-body">
        ${content}
      </main>

      <footer class="site-footer">
        <div class="footer-brand">
          <strong>${state.site.name}</strong>
          <p>${escapeHtml(state.site.description[language])}</p>
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
  return `
    <article class="story-card topic-${article.topic}" data-story-card data-status="${article.verification_state}" data-topic="${article.topic}" data-search="${escapeHtml(searchIndex)}">
      ${renderStoryImage(article, "story-media")}
      <div class="story-meta-line">
        <span class="pill">${escapeHtml(article.content_type_label)}</span>
        <span>${escapeHtml(article.topic_label)}</span>
      </div>
      ${article.editorial_label ? `<div class="story-flag">${escapeHtml(article.editorial_label)}</div>` : ""}
      <h3><a href="${article.href}">${escapeHtml(article.title)}</a></h3>
      <p class="story-hook">${escapeHtml(article.hook || article.summary)}</p>
      <p>${escapeHtml(renderStoryExcerpt(article))}</p>
      <div class="story-footer">
        <span>${escapeHtml(formatPublishDate(language, article.published_at))}</span>
        <a class="mini-link" href="${article.href}">${language === "vi" ? "Đọc" : "Read"}</a>
      </div>
    </article>
  `;
}

function renderStackItem(article, language, withBadge) {
  return `
    <article class="stack-item">
      <div class="stack-row">
        ${renderStoryImage(article, "stack-media")}
        <div class="stack-copy">
          <div class="stack-topline">
            <span>${escapeHtml(article.topic_label)}</span>
            ${withBadge && article.editorial_label ? `<span>${escapeHtml(article.editorial_label)}</span>` : ""}
          </div>
          <a href="${article.href}">${escapeHtml(article.title)}</a>
          <p class="story-hook">${escapeHtml(article.hook || article.summary)}</p>
          <p>${escapeHtml(renderStoryExcerpt(article))}</p>
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

function renderHeroReaderAside(home, language, copy) {
  const quickReads = dedupeStories([home.featured, home.briefing, ...home.latest]).slice(0, 3);
  const hotReads = home.trending.slice(0, 3);

  return `
    <aside class="hero-aside hero-reader-aside">
      <article class="reader-card accent">
        <p class="eyebrow">${copy.readerDeskLabel}</p>
        <h2>${copy.readerDeskTitle}</h2>
        <p>${copy.readerDeskText}</p>
        <a class="text-link" href="${home.featured.href}">${copy.readStory}</a>
      </article>

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

function shouldRenderSeparateDek(article) {
  if (!article.dek) {
    return false;
  }

  const hook = String(article.hook || "").toLowerCase();
  const dek = String(article.dek || "").toLowerCase();
  return Boolean(dek) && (!hook || !hook.includes(dek));
}

function renderStoryImage(article, className, eager = false) {
  if (article.hero_image.kind !== "source") {
    return `
      <figure class="${className} story-placeholder">
        ${renderImagePlaceholder(article, className === "stack-media" ? "stack-placeholder-card" : "story-placeholder-card")}
      </figure>
    `;
  }

  return `
    <figure class="${className}">
      <img src="${article.hero_image.src}" alt="${escapeHtml(article.hero_image.alt)}" loading="${eager ? "eager" : "lazy"}" referrerpolicy="no-referrer" />
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
    <figure class="article-hero-media">
      <img src="${article.hero_image.src}" alt="${escapeHtml(article.hero_image.alt)}" loading="eager" referrerpolicy="no-referrer" />
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

function renderStorePanel(state, article, language) {
  const copy = getCopy(language);
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
    <section class="ad-shell placeholder">
      <p class="ad-label">${label}</p>
      <div class="ad-slot placeholder-slot">${language === "vi" ? "Reserved for Google AdSense" : "Reserved for Google AdSense"}</div>
    </section>
  `;
}

function getCopy(language) {
  if (language === "vi") {
    return {
      homeTitle: "Patrick Tech Media | Tin công nghệ Việt Nam và thế giới",
      eyebrow: "Toà soạn song ngữ",
      heroTitle: "Tin công nghệ đáng đọc, mở ra là có thứ giữ bạn lại.",
      heroText:
        "Patrick Tech Media không xếp headline cho đủ nhịp tin. Mỗi bài được mở bằng một hook rõ, đi nhanh vào bối cảnh quan trọng và giữ nhịp đọc gọn để người xem biết ngay vì sao câu chuyện này đáng dừng lại lâu hơn một lượt lướt.",
      badgeSignals: "Việt Nam + thế giới",
      badgeAds: "Hook rõ, đọc cuốn",
      badgeBilingual: "Song ngữ VI/EN",
      readerDeskLabel: "Cho người đọc",
      readerDeskTitle: "Vào trang chủ là biết nên đọc gì trước.",
      readerDeskText: "Mục này giờ được giữ cho độc giả: chọn nhanh bài nên mở trước, bản tổng hợp nên đọc sau, và những chủ đề đang nóng thật sự.",
      readerStartLabel: "Bắt đầu từ đây",
      readerStartTitle: "3 bài nên mở trước",
      readerWatchLabel: "Đang nóng",
      readerWatchTitle: "Những chủ đề đang kéo người đọc vào",
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
      latestTitle: "Bài vừa lên sóng",
      trendingLabel: "Đang được bàn tán",
      trendingTitle: "Những chủ đề kéo độc giả vào đọc",
      evergreenLabel: "Evergreen & compare",
      evergreenTitle: "Bài còn giá trị sau nhịp tin nóng",
      ecosystemLabel: "Hệ sinh thái",
      ecosystemTitle: "Liên kết nhẹ với Patrick Tech Store",
      ecosystemText: "Các gợi ý sản phẩm chỉ xuất hiện khi có ngữ cảnh phù hợp, không chiếm phần đầu bài và không bật trên trend pages.",
      visitStore: "Mở Patrick Tech Store",
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
      authorsLabel: "Tác giả",
      authorsTitle: "Đội biên tập",
      authorsText: "Mỗi bài đều gắn một biên tập viên phụ trách mảng để giữ góc nhìn nhất quán giữa các đợt cập nhật.",
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
      storeLabel: "Store"
    };
  }

  return {
    homeTitle: "Patrick Tech Media | Technology from Vietnam and the wider web",
    eyebrow: "Bilingual newsroom",
    heroTitle: "Technology stories worth opening, and strong enough to keep you reading.",
    heroText:
      "Patrick Tech Media is not trying to stack headlines for the sake of volume. Each story opens with a clean hook, moves fast into the useful context, and keeps the reading rhythm tight enough that the important angle is clear before attention drifts.",
    badgeSignals: "Vietnam + world",
    badgeAds: "Hooks that read human",
    badgeBilingual: "VI/EN bilingual",
    readerDeskLabel: "For readers",
    readerDeskTitle: "Open the homepage and know what to read first.",
    readerDeskText: "This area is now built for readers: a quick first read, a briefing worth opening next, and the themes genuinely heating up.",
    readerStartLabel: "Start here",
    readerStartTitle: "3 pieces worth opening first",
    readerWatchLabel: "Heating up",
    readerWatchTitle: "Themes pulling readers in right now",
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
    latestTitle: "Stories now live",
    trendingLabel: "People are talking about",
    trendingTitle: "The themes pulling readers in",
    evergreenLabel: "Evergreen and compare",
    evergreenTitle: "Pieces with value beyond the news cycle",
    ecosystemLabel: "Ecosystem",
    ecosystemTitle: "Soft links into Patrick Tech Store",
      ecosystemText: "Product suggestions appear only when the context fits. They stay away from the top of trend pages and never override the editorial frame.",
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
    authorsLabel: "Authors",
    authorsTitle: "Editorial team",
    authorsText: "Each story is tied to an editor covering the beat so the newsroom keeps a consistent lens across updates.",
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
    storeLabel: "Store"
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
