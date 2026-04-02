import { getFooterLinks, getPrimaryNav } from "./newsroom-service.mjs";

export function renderAuthPage(state, language, { notice = "", activeTab = "login", csrf = {} }) {
  const copy = language === "vi" ? getVietnameseCopy() : getEnglishCopy();
  const ui =
    language === "vi"
      ? {
          authTabsLabel: "Biểu mẫu tài khoản",
          loginTitle: "Đăng nhập và đăng ký cộng tác",
          loginText: "Tạo tài khoản để gửi bài, theo dõi bài đã duyệt và quản lý phần doanh thu của bạn trên Patrick Tech Media.",
          signInTabLabel: "Đăng nhập",
          registerTabLabel: "Đăng ký",
          writerLoginText: "Đăng nhập để gửi bài, theo dõi trạng thái duyệt và xem doanh thu từng bài viết.",
          writerRegisterText: "Đăng ký để trở thành người viết bài và đưa bài vào hệ thống kiểm tra, chấm điểm và duyệt tự động của toà soạn.",
          emailPlaceholder: "Nhập email",
          passwordPlaceholder: "Nhập mật khẩu",
          namePlaceholder: "Nhập tên hiển thị",
          confirmPasswordLabel: "Xác nhận mật khẩu",
          confirmPasswordPlaceholder: "Nhập lại mật khẩu",
          registerTermsText: "Khi bấm đăng ký, bạn đồng ý với quy định biên tập và nguyên tắc cộng tác của Patrick Tech Media."
        }
      : {
          authTabsLabel: "Account forms",
          loginTitle: "Sign in or register",
          loginText: "Create an account to submit stories, track review status, and manage your writer revenue on Patrick Tech Media.",
          signInTabLabel: "Sign in",
          registerTabLabel: "Register",
          writerLoginText: "Sign in to submit stories, follow review decisions, and track article revenue.",
          writerRegisterText: "Register to become a writer and send stories into the newsroom’s automated review and publishing flow.",
          emailPlaceholder: "Enter your email",
          passwordPlaceholder: "Enter your password",
          namePlaceholder: "Enter your display name",
          confirmPasswordLabel: "Confirm password",
          confirmPasswordPlaceholder: "Enter your password again",
          registerTermsText: "By creating an account, you agree to the newsroom’s contributor and editorial standards."
        };

  return renderPlatformLayout({
    state,
    language,
    title: `${ui.loginTitle} | ${state.site.name}`,
    description: ui.loginText,
    path: `/${language}/login`,
    content: `
      <section class="simple-hero auth-hero">
        <p class="eyebrow">${copy.accountEyebrow}</p>
        <h1>${ui.loginTitle}</h1>
        <p>${ui.loginText}</p>
      </section>

      ${notice ? `<section class="notice-banner">${escapeHtml(notice)}</section>` : ""}

      <section class="auth-shell" data-auth-shell data-default-tab="${activeTab === "register" ? "register" : "login"}">
        <div class="auth-tabs" role="tablist" aria-label="${ui.authTabsLabel}">
          <button
            class="auth-tab ${activeTab === "register" ? "" : "is-active"}"
            type="button"
            role="tab"
            aria-selected="${activeTab === "register" ? "false" : "true"}"
            data-auth-tab="login"
          >${ui.signInTabLabel}</button>
          <button
            class="auth-tab ${activeTab === "register" ? "is-active" : ""}"
            type="button"
            role="tab"
            aria-selected="${activeTab === "register" ? "true" : "false"}"
            data-auth-tab="register"
          >${ui.registerTabLabel}</button>
        </div>

        <div class="auth-panels">
          <article class="account-card auth-panel ${activeTab === "register" ? "" : "is-active"}" data-auth-panel="login">
            <div class="auth-panel-head">
              <div>
                <p class="eyebrow">${copy.writerLoginLabel}</p>
                <h2>${copy.writerLoginTitle}</h2>
              </div>
              <p>${ui.writerLoginText}</p>
            </div>
            <form class="platform-form auth-form" method="post" action="/auth/login">
              <input type="hidden" name="lang" value="${language}" />
              ${renderCsrfInput(csrf.login)}
              ${renderInput("email", copy.emailLabel, "email", true, `placeholder="${escapeHtml(ui.emailPlaceholder)}" autocomplete="email"`)}
              ${renderInput("password", copy.passwordLabel, "password", true, `placeholder="${escapeHtml(ui.passwordPlaceholder)}" autocomplete="current-password"`)}
              <button class="action-button auth-submit" type="submit">${copy.signInLabel}</button>
            </form>
          </article>

          <article class="account-card auth-panel ${activeTab === "register" ? "is-active" : ""}" data-auth-panel="register">
            <div class="auth-panel-head">
              <div>
                <p class="eyebrow">${copy.writerRegisterLabel}</p>
                <h2>${copy.writerRegisterTitle}</h2>
              </div>
              <p>${ui.writerRegisterText}</p>
            </div>
            <form class="platform-form auth-form" method="post" action="/auth/register">
              <input type="hidden" name="lang" value="${language}" />
              ${renderCsrfInput(csrf.register)}
              ${renderInput("email", copy.emailLabel, "email", true, `placeholder="${escapeHtml(ui.emailPlaceholder)}" autocomplete="email"`)}
              ${renderInput("name", copy.nameLabel, "text", true, `placeholder="${escapeHtml(ui.namePlaceholder)}" autocomplete="name"`)}
              ${renderInput("password", copy.passwordLabel, "password", true, `placeholder="${escapeHtml(ui.passwordPlaceholder)}" autocomplete="new-password"`)}
              ${renderInput("password_confirm", ui.confirmPasswordLabel, "password", true, `placeholder="${escapeHtml(ui.confirmPasswordPlaceholder)}" autocomplete="new-password"`)}
              <p class="auth-terms">${ui.registerTermsText}</p>
              <button class="action-button auth-submit" type="submit">${copy.createWriterLabel}</button>
            </form>
          </article>
        </div>
      </section>
    `
  });
}

export function renderPortalPage(state, language, portal, { notice = "", csrf = {} }) {
  const copy = language === "vi" ? getVietnameseCopy() : getEnglishCopy();
  const totals = portal.totals;

  return renderPlatformLayout({
    state,
    language,
    title: `${copy.portalTitle} | ${state.site.name}`,
    description: copy.portalText,
    path: `/${language}/portal`,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.portalEyebrow}</p>
        <h1>${copy.portalTitle}</h1>
        <p>${copy.portalText}</p>
      </section>

      ${notice ? `<section class="notice-banner">${escapeHtml(notice)}</section>` : ""}

      <section class="account-grid metrics-grid">
        ${renderMetricCard(copy.grossRevenueLabel, formatCurrency(totals.grossUsd))}
        ${renderMetricCard(copy.writerRevenueLabel, formatCurrency(totals.writerEarnedUsd))}
        ${renderMetricCard(copy.platformRevenueLabel, formatCurrency(totals.platformUsd))}
        ${renderMetricCard(copy.availableRevenueLabel, formatCurrency(totals.availableUsd))}
      </section>

      <section class="account-grid">
        <article class="account-card wide-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.submitEyebrow}</p>
              <h2>${portal.labels.submitHeading}</h2>
            </div>
          </div>
          <p class="muted-text">${copy.submitHint}</p>
          <form class="platform-form" method="post" action="/portal/submissions">
            <input type="hidden" name="lang" value="${language}" />
            ${renderCsrfInput(csrf.portalSubmissions)}
            <div class="form-grid two-col">
              ${renderInput("title", copy.titleLabel, "text", true)}
              ${renderSelect("topic", copy.topicLabel, [
                { value: "ai", label: "AI" },
                { value: "apps-software", label: language === "vi" ? "Ứng dụng & Phần mềm" : "Apps & Software" },
                { value: "devices", label: language === "vi" ? "Thiết bị" : "Devices" },
                { value: "security", label: language === "vi" ? "Bảo mật" : "Security" },
                { value: "gaming", label: "Gaming" },
                { value: "internet-business-tech", label: language === "vi" ? "Internet & Doanh nghiệp số" : "Internet & Business Tech" }
              ])}
              ${renderSelect("content_type", copy.contentTypeLabel, [
                { value: "NewsArticle", label: language === "vi" ? "Tin nhanh" : "News" },
                { value: "EvergreenGuide", label: language === "vi" ? "Hướng dẫn" : "Guide" },
                { value: "ComparisonPage", label: language === "vi" ? "So sánh" : "Comparison" },
                { value: "Roundup", label: language === "vi" ? "Tổng hợp" : "Roundup" }
              ])}
              ${renderInput("dek", copy.dekLabel, "text", true)}
            </div>
            ${renderTextarea("hook", copy.hookLabel, false)}
            ${renderTextarea("summary", copy.summaryLabel, true)}
            <div class="form-grid three-col">
              ${renderInput("section_heading_1", copy.sectionOneLabel, "text", true)}
              ${renderInput("section_heading_2", copy.sectionTwoLabel, "text", true)}
              ${renderInput("section_heading_3", copy.sectionThreeLabel, "text", true)}
            </div>
            <div class="form-grid three-col">
              ${renderTextarea("section_body_1", copy.sectionBodyLabel, true)}
              ${renderTextarea("section_body_2", copy.sectionBodyLabel, true)}
              ${renderTextarea("section_body_3", copy.sectionBodyLabel, true)}
            </div>
            <div class="form-grid two-col">
              ${renderInput("source_name_1", copy.sourceNameLabel, "text", true)}
              ${renderInput("source_url_1", copy.sourceUrlLabel, "url", true)}
              ${renderInput("source_name_2", copy.sourceNameLabelTwo, "text", true)}
              ${renderInput("source_url_2", copy.sourceUrlLabelTwo, "url", true)}
              ${renderInput("image_src", copy.imageUrlLabel, "url", false)}
              ${renderInput("image_credit", copy.imageCreditLabel, "text", false)}
            </div>
            ${renderTextarea("image_caption", copy.imageCaptionLabel, false)}
            <button class="action-button" type="submit">${copy.submitStoryLabel}</button>
          </form>
        </article>

        <article class="account-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.withdrawEyebrow}</p>
              <h2>${portal.labels.withdrawHeading}</h2>
            </div>
          </div>
          <form class="platform-form" method="post" action="/portal/withdrawals">
            <input type="hidden" name="lang" value="${language}" />
            ${renderCsrfInput(csrf.portalWithdrawals)}
            ${renderInput("amount", copy.withdrawAmountLabel, "number", true, 'min="10" step="0.01"')}
            ${renderInput("binance_account", copy.binanceAccountLabel, "text", true)}
            ${renderInput("wallet_address", copy.walletLabel, "text", false)}
            ${renderInput("network", copy.networkLabel, "text", false)}
            ${renderTextarea("note", copy.noteLabel, false)}
            <button class="action-button" type="submit">${copy.requestWithdrawalLabel}</button>
          </form>
        </article>
      </section>

      <section class="account-grid">
        <article class="account-card wide-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.storyQueueEyebrow}</p>
              <h2>${portal.labels.submissionsHeading}</h2>
            </div>
          </div>
          <div class="platform-table">
            <div class="table-row head">
              <span>${copy.tableStoryLabel}</span>
              <span>${copy.tableStatusLabel}</span>
              <span>${copy.tableScoreLabel}</span>
              <span>${copy.tableRevenueLabel}</span>
              <span>${copy.tableRouteLabel}</span>
            </div>
            ${portal.submissions
              .map(
                (submission) => `
                  <div class="table-row">
                    <span>${escapeHtml(submission.title)}</span>
                    <span>${escapeHtml(statusLabel(submission.status, language))}</span>
                    <span>${submission.review?.score || 0}</span>
                    <span>${formatCurrency(Number(submission.revenue?.gross_usd || 0))}</span>
                    <span>${submission.published_href ? `<a href="${submission.published_href}">${escapeHtml(submission.published_href)}</a>` : "—"}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="account-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.withdrawHistoryEyebrow}</p>
              <h2>${copy.withdrawHistoryTitle}</h2>
            </div>
          </div>
          <div class="platform-table compact-table">
            ${portal.withdrawals.length === 0 ? `<p class="muted-text">${copy.noWithdrawalText}</p>` : ""}
            ${portal.withdrawals
              .map(
                (withdrawal) => `
                  <div class="table-row">
                    <span>${formatCurrency(withdrawal.amount_usd)}</span>
                    <span>${escapeHtml(statusLabel(withdrawal.status, language))}</span>
                    <span>${escapeHtml(withdrawal.binance_account || withdrawal.wallet_address || "Binance")}</span>
                  </div>
                `
              )
              .join("")}
          </div>
          <form method="post" action="/auth/logout">
            <input type="hidden" name="lang" value="${language}" />
            ${renderCsrfInput(csrf.logout)}
            <button class="ghost-button" type="submit">${copy.logoutLabel}</button>
          </form>
        </article>
      </section>
    `
  });
}

export function renderAdminPage(state, language, dashboard, { notice = "", csrf = {} }) {
  const copy = language === "vi" ? getVietnameseCopy() : getEnglishCopy();

  return renderPlatformLayout({
    state,
    language,
    title: `${copy.adminDeskTitle} | ${state.site.name}`,
    description: copy.adminDeskText,
    path: `/${language}/admin`,
    content: `
      <section class="simple-hero">
        <p class="eyebrow">${copy.adminDeskEyebrow}</p>
        <h1>${copy.adminDeskTitle}</h1>
        <p>${copy.adminDeskText}</p>
      </section>

      ${notice ? `<section class="notice-banner">${escapeHtml(notice)}</section>` : ""}

      <section class="account-grid metrics-grid">
        ${renderMetricCard(copy.totalWritersLabel, dashboard.metrics.totalWriters)}
        ${renderMetricCard(copy.pendingReviewLabel, dashboard.metrics.pendingReviews)}
        ${renderMetricCard(copy.approvedStoriesLabel, dashboard.metrics.approvedStories)}
        ${renderMetricCard(copy.pendingPayoutLabel, dashboard.metrics.pendingWithdrawals)}
      </section>

      <section class="account-grid">
        <article class="account-card wide-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.reviewQueueEyebrow}</p>
              <h2>${copy.reviewQueueTitle}</h2>
            </div>
          </div>
          ${dashboard.submissions
            .map(
              (submission) => `
                <article class="review-card">
                  <div class="review-head">
                    <div>
                      <h3>${escapeHtml(submission.title)}</h3>
                      <p>${escapeHtml(submission.author_name)} · ${escapeHtml(statusLabel(submission.status, language))} · ${submission.review?.score || 0}/100</p>
                    </div>
                    <div class="tag-list">
                      <span>${escapeHtml(submission.topic)}</span>
                      <span>${escapeHtml(submission.content_type)}</span>
                    </div>
                  </div>
                  <p>${escapeHtml(submission.summary)}</p>
                  <ul class="guardrail-list">
                    ${(submission.review?.notes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
                  </ul>
                  <div class="inline-forms">
                    <form method="post" action="/admin/review">
                      <input type="hidden" name="lang" value="${language}" />
                      ${renderCsrfInput(csrf.adminReview)}
                      <input type="hidden" name="submission_id" value="${submission.id}" />
                      <input type="hidden" name="decision" value="approve" />
                      <button class="action-button" type="submit">${copy.approveLabel}</button>
                    </form>
                    <form method="post" action="/admin/review">
                      <input type="hidden" name="lang" value="${language}" />
                      ${renderCsrfInput(csrf.adminReview)}
                      <input type="hidden" name="submission_id" value="${submission.id}" />
                      <input type="hidden" name="decision" value="reject" />
                      <button class="ghost-button danger" type="submit">${copy.rejectLabel}</button>
                    </form>
                    <form class="inline-form revenue-form" method="post" action="/admin/revenue">
                      <input type="hidden" name="lang" value="${language}" />
                      ${renderCsrfInput(csrf.adminRevenue)}
                      <input type="hidden" name="submission_id" value="${submission.id}" />
                      <label>
                        <span>${copy.revenueInputLabel}</span>
                        <input type="number" name="gross_usd" min="0" step="0.01" value="${Number(submission.revenue?.gross_usd || 0)}" />
                      </label>
                      <button class="ghost-button" type="submit">${copy.updateRevenueLabel}</button>
                    </form>
                  </div>
                </article>
              `
            )
            .join("")}
        </article>

        <article class="account-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">${copy.withdrawQueueEyebrow}</p>
              <h2>${copy.withdrawQueueTitle}</h2>
            </div>
          </div>
          <div class="platform-table compact-table">
            ${dashboard.withdrawals.length === 0 ? `<p class="muted-text">${copy.noWithdrawalText}</p>` : ""}
            ${dashboard.withdrawals
              .map(
                (withdrawal) => `
                  <div class="table-row payout-row">
                    <span>${formatCurrency(withdrawal.amount_usd)}</span>
                    <span>${escapeHtml(withdrawal.binance_account || withdrawal.wallet_address || "Binance")}</span>
                    <span>${escapeHtml(statusLabel(withdrawal.status, language))}</span>
                    <form class="inline-form payout-form" method="post" action="/admin/withdrawals">
                      <input type="hidden" name="lang" value="${language}" />
                      ${renderCsrfInput(csrf.adminWithdrawals)}
                      <input type="hidden" name="withdrawal_id" value="${withdrawal.id}" />
                      <input type="hidden" name="status" value="${withdrawal.status === "paid" ? "pending" : "paid"}" />
                      <button class="ghost-button" type="submit">${withdrawal.status === "paid" ? copy.markPendingLabel : copy.markPaidLabel}</button>
                    </form>
                  </div>
                `
              )
              .join("")}
          </div>
          <form method="post" action="/auth/logout">
            <input type="hidden" name="lang" value="${language}" />
            ${renderCsrfInput(csrf.logout)}
            <button class="ghost-button" type="submit">${copy.logoutLabel}</button>
          </form>
        </article>
      </section>
    `
  });
}

function renderPlatformLayout({ state, language, title, description, path, content }) {
  const copy = language === "vi" ? getVietnameseCopy() : getEnglishCopy();
  const nav = getPrimaryNav(state, language);
  const footerLinks = getFooterLinks(language);
  const alternatePath = path.replace(/^\/(vi|en)\//, (_, current) => `/${current === "vi" ? "en" : "vi"}/`);
  const canonicalUrl = `${state.site.siteUrl}${path}`;
  const assetVersion = encodeURIComponent(state.site.assetVersion || "patrick-tech-media");
  const logoPath = `/patrick-tech-media-mark.svg?v=${assetVersion}`;
  const iconPath = `/patrick-tech-media-icon.svg?v=${assetVersion}`;
  const stylesheetPath = `/site.css?v=${assetVersion}`;
  const scriptPath = `/site.js?v=${assetVersion}`;
  const ogImageUrl = `${state.site.siteUrl}${logoPath}`;

  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="icon" href="${iconPath}" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${iconPath}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="alternate" hreflang="${language}" href="${canonicalUrl}" />
    <link rel="alternate" hreflang="${language === "vi" ? "en" : "vi"}" href="${state.site.siteUrl}${alternatePath}" />
    <meta property="og:site_name" content="${escapeHtml(state.site.name)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <link rel="stylesheet" href="${stylesheetPath}" />
    <script defer src="${scriptPath}"></script>
  </head>
  <body>
    <div class="backdrop"></div>
    <div class="site-shell">
      <header class="topbar">
        <a class="brand-lockup" href="/${language}/">
          <img class="brand-logo" src="${logoPath}" alt="${escapeHtml(state.site.name)}" />
        </a>
        <nav class="nav-strip" aria-label="Primary">
          ${nav.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
        </nav>
        <div class="topbar-actions">
          <a class="lang-pill" href="/${language}/portal">${copy.portalNavLabel}</a>
          <a class="lang-pill" href="/${language}/login">${copy.loginNavLabel}</a>
          <a class="lang-pill subtle" href="/${language}/store">${copy.storeLabel}</a>
          <a class="lang-pill" href="${alternatePath}">${language === "vi" ? "EN" : "VI"}</a>
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
        </div>
      </footer>
    </div>
  </body>
</html>`;
}

function renderCsrfInput(token) {
  return token ? `<input type="hidden" name="csrf_token" value="${escapeHtml(token)}" />` : "";
}

function renderInput(name, label, type, required, extra = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input name="${name}" type="${type}" ${required ? "required" : ""} ${extra} />
    </label>
  `;
}

function renderTextarea(name, label, required) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <textarea name="${name}" rows="5" ${required ? "required" : ""}></textarea>
    </label>
  `;
}

function renderSelect(name, label, options) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select name="${name}">
        ${options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderMetricCard(label, value) {
  return `
    <article class="account-card metric-card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function statusLabel(status, language) {
  const labels = {
    approved: { vi: "Đã duyệt", en: "Approved" },
    pending_review: { vi: "Chờ duyệt", en: "Pending review" },
    rejected: { vi: "Từ chối", en: "Rejected" },
    pending: { vi: "Chờ xử lý", en: "Pending" },
    paid: { vi: "Đã thanh toán", en: "Paid" },
    active: { vi: "Hoạt động", en: "Active" }
  };

  return labels[status]?.[language] || status;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getVietnameseCopy() {
  return {
    accountEyebrow: "Tài khoản",
    loginTitle: "Đăng nhập và cộng tác",
    loginText: "Người viết có thể đăng ký tài khoản, gửi bài, theo dõi doanh thu và yêu cầu rút tiền. Admin đăng nhập riêng bằng Google để duyệt bài và cập nhật doanh thu.",
    writerLoginLabel: "Đăng nhập writer",
    writerLoginTitle: "Vào writer portal",
    writerRegisterLabel: "Đăng ký người viết",
    writerRegisterTitle: "Tạo tài khoản cộng tác viên",
    adminLabel: "Admin",
    adminTitle: "Đăng nhập admin bằng Google",
    adminText: "Chỉ ba email admin được phép đăng nhập và mở bàn duyệt bài.",
    googleLoginLabel: "Đăng nhập admin với Google",
    googleMissingText: "Cần thêm GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET để bật Google login.",
    emailLabel: "Email",
    passwordLabel: "Mật khẩu",
    nameLabel: "Tên hiển thị",
    signInLabel: "Đăng nhập",
    createWriterLabel: "Tạo tài khoản writer",
    portalTitle: "Writer Portal",
    portalText: "Gửi bài, theo dõi điểm duyệt tự động, doanh thu bài viết và yêu cầu rút tiền Binance ngay trên một dashboard.",
    portalEyebrow: "Cộng tác viên",
    grossRevenueLabel: "Tổng doanh thu quảng cáo",
    writerRevenueLabel: "Phần người viết",
    platformRevenueLabel: "Phần nền tảng 20%",
    availableRevenueLabel: "Khả dụng để rút",
    submitEyebrow: "Bài mới",
    submitHint: "Tiêu đề nên cụ thể, hook nên mở mạnh ngay từ 1-2 câu đầu, và mỗi section nên đưa thêm bối cảnh hoặc tác động thực tế.",
    titleLabel: "Tiêu đề hút người đọc",
    topicLabel: "Chuyên mục",
    contentTypeLabel: "Loại nội dung",
    dekLabel: "Dek / mô tả ngắn",
    hookLabel: "Hook mở bài / 1-2 câu đầu",
    summaryLabel: "Tóm tắt bài",
    sectionOneLabel: "Heading phần 1",
    sectionTwoLabel: "Heading phần 2",
    sectionThreeLabel: "Heading phần 3",
    sectionBodyLabel: "Nội dung phần",
    sourceNameLabel: "Nguồn 1",
    sourceUrlLabel: "Link nguồn 1",
    sourceNameLabelTwo: "Nguồn 2",
    sourceUrlLabelTwo: "Link nguồn 2",
    imageUrlLabel: "Link ảnh nguồn",
    imageCreditLabel: "Credit ảnh",
    imageCaptionLabel: "Caption ảnh",
    submitStoryLabel: "Gửi bài để chấm điểm và duyệt",
    withdrawEyebrow: "Thanh toán",
    withdrawAmountLabel: "Số tiền muốn rút (USD)",
    binanceAccountLabel: "Binance email / UID",
    walletLabel: "Ví Binance / địa chỉ nhận",
    networkLabel: "Mạng",
    noteLabel: "Ghi chú",
    requestWithdrawalLabel: "Gửi yêu cầu rút tiền",
    storyQueueEyebrow: "Tuyến bài",
    tableStoryLabel: "Bài viết",
    tableStatusLabel: "Trạng thái",
    tableScoreLabel: "Điểm",
    tableRevenueLabel: "Doanh thu",
    tableRouteLabel: "Route public",
    withdrawHistoryEyebrow: "Lịch sử rút",
    withdrawHistoryTitle: "Yêu cầu rút tiền",
    noWithdrawalText: "Chưa có yêu cầu rút tiền nào.",
    logoutLabel: "Đăng xuất",
    adminDeskEyebrow: "Admin desk",
    adminDeskTitle: "Bàn duyệt Patrick Tech Media",
    adminDeskText: "Admin có thể duyệt bài, từ chối bài chưa đạt, cập nhật doanh thu và theo dõi hàng đợi thanh toán.",
    totalWritersLabel: "Người viết",
    pendingReviewLabel: "Chờ duyệt",
    approvedStoriesLabel: "Đã xuất bản",
    pendingPayoutLabel: "Yêu cầu rút chờ xử lý",
    reviewQueueEyebrow: "Hàng duyệt",
    reviewQueueTitle: "Bài cộng tác viên",
    approveLabel: "Duyệt và xuất bản",
    rejectLabel: "Từ chối",
    revenueInputLabel: "Doanh thu gộp (USD)",
    updateRevenueLabel: "Cập nhật doanh thu",
    withdrawQueueEyebrow: "Payout queue",
    withdrawQueueTitle: "Yêu cầu rút tiền Binance",
    markPaidLabel: "Da thanh toan",
    markPendingLabel: "Chuyen ve cho xu ly",
    portalNavLabel: "Writer",
    loginNavLabel: "Đăng nhập",
    storeLabel: "Store",
    footerBlurb: "Tin công nghệ, AI, Big Tech, mạng xã hội và thủ thuật đáng lưu."
  };
}

function getEnglishCopy() {
  return {
    accountEyebrow: "Accounts",
    loginTitle: "Sign in and contribute",
    loginText: "Writers can create accounts, submit stories, track revenue, and request Binance withdrawals. Admins sign in with Google to review stories and update earnings.",
    writerLoginLabel: "Writer sign in",
    writerLoginTitle: "Open the writer portal",
    writerRegisterLabel: "Writer registration",
    writerRegisterTitle: "Create a contributor account",
    adminLabel: "Admin",
    adminTitle: "Admin sign-in with Google",
    adminText: "Only the three approved admin emails can access the editorial review desk.",
    googleLoginLabel: "Sign in as admin with Google",
    googleMissingText: "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google login.",
    emailLabel: "Email",
    passwordLabel: "Password",
    nameLabel: "Display name",
    signInLabel: "Sign in",
    createWriterLabel: "Create writer account",
    portalTitle: "Writer Portal",
    portalText: "Submit stories, track automatic review scores, monitor article revenue, and request Binance withdrawals from one dashboard.",
    portalEyebrow: "Contributors",
    grossRevenueLabel: "Gross ad revenue",
    writerRevenueLabel: "Writer share",
    platformRevenueLabel: "Platform 20% share",
    availableRevenueLabel: "Available to withdraw",
    submitEyebrow: "New story",
    submitHint: "Make the headline specific, open with a strong hook, and give each section a clear layer of context or consequence.",
    titleLabel: "Headline that pulls readers in",
    topicLabel: "Topic",
    contentTypeLabel: "Content type",
    dekLabel: "Dek / short description",
    hookLabel: "Opening hook / 1-2 lead lines",
    summaryLabel: "Summary",
    sectionOneLabel: "Section 1 heading",
    sectionTwoLabel: "Section 2 heading",
    sectionThreeLabel: "Section 3 heading",
    sectionBodyLabel: "Section body",
    sourceNameLabel: "Source 1",
    sourceUrlLabel: "Source 1 URL",
    sourceNameLabelTwo: "Source 2",
    sourceUrlLabelTwo: "Source 2 URL",
    imageUrlLabel: "Reference image URL",
    imageCreditLabel: "Image credit",
    imageCaptionLabel: "Image caption",
    submitStoryLabel: "Submit for scoring and review",
    withdrawEyebrow: "Payout",
    withdrawAmountLabel: "Withdrawal amount (USD)",
    binanceAccountLabel: "Binance email / UID",
    walletLabel: "Binance wallet / address",
    networkLabel: "Network",
    noteLabel: "Note",
    requestWithdrawalLabel: "Request withdrawal",
    storyQueueEyebrow: "Story queue",
    tableStoryLabel: "Story",
    tableStatusLabel: "Status",
    tableScoreLabel: "Score",
    tableRevenueLabel: "Revenue",
    tableRouteLabel: "Public route",
    withdrawHistoryEyebrow: "Withdrawal history",
    withdrawHistoryTitle: "Withdrawal requests",
    noWithdrawalText: "There are no withdrawal requests yet.",
    logoutLabel: "Log out",
    adminDeskEyebrow: "Admin desk",
    adminDeskTitle: "Patrick Tech Media review desk",
    adminDeskText: "Admins can approve stories, reject weak drafts, update revenue, and monitor the Binance payout queue.",
    totalWritersLabel: "Writers",
    pendingReviewLabel: "Pending review",
    approvedStoriesLabel: "Published",
    pendingPayoutLabel: "Pending payouts",
    reviewQueueEyebrow: "Review queue",
    reviewQueueTitle: "Contributor stories",
    approveLabel: "Approve and publish",
    rejectLabel: "Reject",
    revenueInputLabel: "Gross revenue (USD)",
    updateRevenueLabel: "Update revenue",
    withdrawQueueEyebrow: "Payout queue",
    withdrawQueueTitle: "Binance withdrawal requests",
    markPaidLabel: "Mark as paid",
    markPendingLabel: "Return to pending",
    portalNavLabel: "Writer",
    loginNavLabel: "Login",
    storeLabel: "Store",
    footerBlurb: "Technology, AI, Big Tech, social platforms, and useful how-tos."
  };
}
