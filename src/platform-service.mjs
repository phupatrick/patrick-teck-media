import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "./platform-auth.mjs";
import { createPlatformStore } from "./platform-store.mjs";

const DEFAULT_ADMIN_EMAILS = ["hphumail@gmail.com", "phupunpin@gmail.com", "hoangphupatrick@gmail.com"];

export function createPlatformService(options) {
  const store = createPlatformStore({
    statePath: options.statePath || "data/platform-state.json"
  });

  const config = {
    siteUrl: options.siteUrl,
    newsroomContentPath: options.newsroomContentPath || "data/newsroom-content.json",
    googleClientId: options.googleClientId || "",
    googleClientSecret: options.googleClientSecret || "",
    googleRedirectUri: options.googleRedirectUri || `${options.siteUrl}/auth/google/callback`,
    adminEmails: new Set((options.adminEmails?.length ? options.adminEmails : DEFAULT_ADMIN_EMAILS).map((email) => email.toLowerCase()))
  };

  return {
    statePath: store.statePath,
    storageMode: store.storageMode,
    newsroomContentPath: config.newsroomContentPath,
    isGoogleConfigured: () => Boolean(config.googleClientId && config.googleClientSecret),
    getGoogleConfig: () => ({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: config.googleRedirectUri }),
    getUserById(userId) {
      if (!userId) {
        return null;
      }
      return sanitizeUser(store.readState().users.find((user) => user.id === userId) || null);
    },
    registerWriter({ name, email, password, language }) {
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail || !password || password.length < 8) {
        throw new Error(language === "vi" ? "Email hoặc mật khẩu không hợp lệ." : "Invalid email or password.");
      }

      let createdUser = null;
      store.updateState((draft) => {
        if (draft.users.some((user) => user.email === normalizedEmail)) {
          throw new Error(language === "vi" ? "Email này đã tồn tại." : "This email already exists.");
        }

        createdUser = {
          id: makeId("writer"),
          role: "writer",
          provider: "local",
          status: "active",
          name: name?.trim() || normalizedEmail.split("@")[0],
          email: normalizedEmail,
          password_hash: hashPassword(password),
          created_at: new Date().toISOString()
        };

        draft.users.unshift(createdUser);
        return draft;
      });

      return sanitizeUser(createdUser);
    },
    loginWriter({ email, password, language }) {
      const normalizedEmail = normalizeEmail(email);
      const user = store.readState().users.find((entry) => entry.email === normalizedEmail && entry.provider === "local");

      if (!user || !verifyPassword(password, user.password_hash)) {
        throw new Error(language === "vi" ? "Sai email hoặc mật khẩu." : "Wrong email or password.");
      }

      return sanitizeUser(user);
    },
    upsertAdminFromGoogle(profile, language) {
      const normalizedEmail = normalizeEmail(profile?.email);

      if (!normalizedEmail || !config.adminEmails.has(normalizedEmail)) {
        throw new Error(language === "vi" ? "Tài khoản Google này không có quyền admin." : "This Google account is not allowed as admin.");
      }

      let adminUser = null;

      store.updateState((draft) => {
        adminUser = draft.users.find((user) => user.email === normalizedEmail) || null;

        if (adminUser) {
          adminUser.role = "admin";
          adminUser.provider = "google";
          adminUser.status = "active";
          adminUser.name = profile.name || adminUser.name;
          adminUser.google_picture = profile.picture || adminUser.google_picture || "";
          adminUser.updated_at = new Date().toISOString();
        } else {
          adminUser = {
            id: makeId("admin"),
            role: "admin",
            provider: "google",
            status: "active",
            name: profile.name || normalizedEmail,
            email: normalizedEmail,
            google_picture: profile.picture || "",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          draft.users.unshift(adminUser);
        }

        return draft;
      });

      return sanitizeUser(adminUser);
    },
    getPortalData(userId, language) {
      const state = store.readState();
      const user = state.users.find((entry) => entry.id === userId);

      if (!user) {
        return null;
      }

      const submissions = state.submissions.filter((entry) => entry.author_id === userId).sort(sortByUpdatedAtDesc);
      const withdrawals = state.withdrawals.filter((entry) => entry.user_id === userId).sort(sortByCreatedAtDesc);
      const totals = computeWriterTotals(submissions, withdrawals);

      return {
        user: sanitizeUser(user),
        totals,
        submissions,
        withdrawals,
        labels: {
          submitHeading: language === "vi" ? "Gửi bài mới" : "Submit a new story",
          submissionsHeading: language === "vi" ? "Bài viết của bạn" : "Your stories",
          withdrawHeading: language === "vi" ? "Rút tiền qua Binance" : "Withdraw via Binance"
        }
      };
    },
    getAdminDashboard(language) {
      const state = store.readState();
      const submissions = state.submissions.sort(sortByUpdatedAtDesc);

      return {
        metrics: {
          totalWriters: state.users.filter((user) => user.role === "writer").length,
          pendingReviews: submissions.filter((entry) => entry.status === "pending_review").length,
          approvedStories: submissions.filter((entry) => entry.status === "approved").length,
          pendingWithdrawals: state.withdrawals.filter((entry) => entry.status === "pending").length
        },
        submissions,
        withdrawals: state.withdrawals.sort(sortByCreatedAtDesc),
        language
      };
    },
    listPublishedArticles() {
      return store.readState().submissions.filter((entry) => entry.status === "approved").map((entry) => submissionToArticle(entry)).sort(sortByPublishedArticleDateDesc);
    },
    createSubmission({ userId, language, formData }) {
      const state = store.readState();
      const user = state.users.find((entry) => entry.id === userId);

      if (!user) {
        throw new Error(language === "vi" ? "Vui lòng đăng nhập lại." : "Please sign in again.");
      }

      const sections = sanitizeSections(formData.sections || []);
      const sourceSet = sanitizeSources(formData.sources || []);
      const image = sanitizeImage(formData.image || {});
      const title = strengthenSubmissionTitle(safeTrim(formData.title), {
        language,
        topic: formData.topic || "ai",
        summary: safeTrim(formData.summary),
        dek: safeTrim(formData.dek),
        sections
      });
      const dek = polishDek({
        value: safeTrim(formData.dek),
        summary: safeTrim(formData.summary),
        sections,
        language
      });
      const summary = polishSummary({
        value: safeTrim(formData.summary),
        dek,
        sections,
        language
      });
      const hook = buildSubmissionHook({
        value: safeTrim(formData.hook),
        title,
        dek,
        summary,
        sections,
        language
      });
      const submission = {
        id: makeId("submission"),
        author_id: user.id,
        author_name: user.name,
        author_role_vi: "Cộng tác viên",
        author_role_en: "Contributor",
        language: language === "en" ? "en" : "vi",
        topic: formData.topic || "ai",
        content_type: formData.content_type || "NewsArticle",
        title,
        slug: slugify(title),
        hook,
        summary,
        dek,
        sections,
        source_set: sourceSet,
        image,
        review: null,
        status: "draft",
        revenue: {
          gross_usd: 0,
          platform_percent: 20,
          writer_percent: 80
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const review = reviewSubmission(submission, language);
      submission.review = review;
      submission.status = review.status;
      const publication = submission.status === "approved" ? buildPublicationMeta(submission) : null;

      if (publication) {
        submission.published_article_id = publication.id;
        submission.published_href = publication.href;
      }

      store.updateState((draft) => {
        draft.submissions.unshift(submission);
        return draft;
      });

      return submission;
    },
    reviewSubmissionDecision({ submissionId, decision, language }) {
      let updatedSubmission = null;

      store.updateState((draft) => {
        const submission = draft.submissions.find((entry) => entry.id === submissionId);

        if (!submission) {
          throw new Error(language === "vi" ? "Không tìm thấy bài." : "Submission not found.");
        }

        submission.status = decision === "approve" ? "approved" : "rejected";
        submission.review = {
          ...(submission.review || reviewSubmission(submission, language)),
          status: submission.status,
          notes: [
            ...(submission.review?.notes || []),
            language === "vi"
              ? `Admin đã ${decision === "approve" ? "duyệt" : "từ chối"} bài viết.`
              : `Admin ${decision === "approve" ? "approved" : "rejected"} this story.`
          ]
        };
        submission.updated_at = new Date().toISOString();

        if (submission.status === "approved") {
          const publication = buildPublicationMeta(submission);
          submission.published_article_id = publication.id;
          submission.published_href = publication.href;
        }

        updatedSubmission = { ...submission };
        return draft;
      });

      return updatedSubmission;
    },
    updateRevenue({ submissionId, grossUsd, language }) {
      let updatedSubmission = null;

      store.updateState((draft) => {
        const submission = draft.submissions.find((entry) => entry.id === submissionId);

        if (!submission) {
          throw new Error(language === "vi" ? "Không tìm thấy bài." : "Submission not found.");
        }

        submission.revenue = {
          ...submission.revenue,
          gross_usd: Math.max(0, Number(grossUsd) || 0),
          platform_percent: 20,
          writer_percent: 80
        };
        submission.updated_at = new Date().toISOString();
        updatedSubmission = { ...submission };
        return draft;
      });

      return updatedSubmission;
    },
    createWithdrawal({ userId, amount, binanceAccount, walletAddress, network, note, language }) {
      const state = store.readState();
      const user = state.users.find((entry) => entry.id === userId);

      if (!user) {
        throw new Error(language === "vi" ? "Vui lòng đăng nhập lại." : "Please sign in again.");
      }

      const submissions = state.submissions.filter((entry) => entry.author_id === userId);
      const withdrawals = state.withdrawals.filter((entry) => entry.user_id === userId);
      const totals = computeWriterTotals(submissions, withdrawals);
      const requestedAmount = Math.max(0, Number(amount) || 0);

      if (requestedAmount < 10) {
        throw new Error(language === "vi" ? "Số tiền rút tối thiểu là 10 USD." : "The minimum withdrawal is 10 USD.");
      }

      if (requestedAmount > totals.availableUsd) {
        throw new Error(language === "vi" ? "Số dư khả dụng không đủ." : "Insufficient available balance.");
      }

      const request = {
        id: makeId("withdrawal"),
        user_id: user.id,
        amount_usd: requestedAmount,
        binance_account: safeTrim(binanceAccount),
        wallet_address: safeTrim(walletAddress),
        network: safeTrim(network),
        note: safeTrim(note),
        status: "pending",
        created_at: new Date().toISOString()
      };

      store.updateState((draft) => {
        draft.withdrawals.unshift(request);
        return draft;
      });

      return request;
    },
    updateWithdrawalStatus({ withdrawalId, status, language }) {
      let updatedRequest = null;

      store.updateState((draft) => {
        const request = draft.withdrawals.find((entry) => entry.id === withdrawalId);

        if (!request) {
          throw new Error(language === "vi" ? "Khong tim thay yeu cau rut tien." : "Withdrawal request not found.");
        }

        request.status = status === "paid" ? "paid" : "pending";
        request.updated_at = new Date().toISOString();
        updatedRequest = { ...request };
        return draft;
      });

      return updatedRequest;
    }
  };
}

export function reviewSubmission(submission, language) {
  let score = 0;
  const notes = [];

  if (submission.title.length >= 28 && isCompellingTitle(submission.title, language)) {
    score += 20;
  } else {
    notes.push(language === "vi" ? "Tiêu đề còn quá ngắn." : "The title is still too short.");
  }

  if (submission.hook?.length >= 70) {
    score += 10;
  } else {
    notes.push(language === "vi" ? "BĂ i nĂªn cĂ³ 1 hook má»Ÿ Ä‘áº§u rá»‘ rĂ ng." : "The story needs a sharper opening hook.");
  }

  if (submission.summary.length >= 80) {
    score += 15;
  } else {
    notes.push(language === "vi" ? "Tóm tắt cần chi tiết hơn." : "The summary needs more detail.");
  }

  if (submission.dek.length >= 60) {
    score += 10;
  } else {
    notes.push(language === "vi" ? "Dek nên dài tối thiểu 60 ký tự." : "The dek should be at least 60 characters.");
  }

  if (submission.sections.length >= 3) {
    score += 20;
  } else {
    notes.push(language === "vi" ? "Bài cần ít nhất 3 phần nội dung." : "The story needs at least 3 sections.");
  }

  if (submission.sections.every((section) => section.body.length >= 120)) {
    score += 15;
  } else {
    notes.push(language === "vi" ? "Mỗi phần nội dung nên đầy đặn hơn." : "Each section should be more substantial.");
  }

  if (submission.source_set.length >= 2) {
    score += 15;
  } else {
    notes.push(language === "vi" ? "Bài cần ít nhất 2 nguồn tham khảo." : "The story needs at least 2 reference sources.");
  }

  if (submission.image?.src || submission.source_set.some((source) => source.image_url)) {
    score += 5;
  } else {
    notes.push(language === "vi" ? "Chưa có ảnh nguồn tham khảo." : "No reference image has been attached yet.");
  }

  if (!containsHeavyPromoLanguage(submission)) {
    score += 5;
  } else {
    notes.push(language === "vi" ? "Bài đang có giọng bán hàng quá mạnh." : "The story still reads too much like a sales pitch.");
  }

  return {
    score,
    status: score >= 78 ? "approved" : score >= 60 ? "pending_review" : "rejected",
    notes
  };
}

export function computeWriterTotals(submissions, withdrawals) {
  const grossUsd = submissions.reduce((sum, submission) => sum + Number(submission.revenue?.gross_usd || 0), 0);
  const writerEarnedUsd = roundCurrency(grossUsd * 0.8);
  const platformUsd = roundCurrency(grossUsd * 0.2);
  const pendingWithdrawalUsd = withdrawals.filter((entry) => entry.status === "pending").reduce((sum, entry) => sum + Number(entry.amount_usd || 0), 0);
  const paidWithdrawalUsd = withdrawals.filter((entry) => entry.status === "paid").reduce((sum, entry) => sum + Number(entry.amount_usd || 0), 0);

  return {
    grossUsd: roundCurrency(grossUsd),
    writerEarnedUsd,
    platformUsd,
    pendingWithdrawalUsd: roundCurrency(pendingWithdrawalUsd),
    paidWithdrawalUsd: roundCurrency(paidWithdrawalUsd),
    availableUsd: roundCurrency(Math.max(0, writerEarnedUsd - pendingWithdrawalUsd - paidWithdrawalUsd))
  };
}

function submissionToArticle(submission) {
  return {
    id: `community-${submission.id}-${submission.language}`,
    cluster_id: `community-${submission.id}`,
    language: submission.language,
    topic: submission.topic,
    content_type: submission.content_type,
    slug: submission.slug,
    title: submission.title,
    hook: submission.hook || "",
    summary: submission.summary,
    dek: submission.dek,
    sections: submission.sections,
    image: submission.image?.src ? submission.image : null,
    verification_state: submission.review?.score >= 85 ? "verified" : "emerging",
    quality_score: submission.review?.score || 70,
    ad_eligible: true,
    show_editorial_label: false,
    indexable: true,
    store_link_mode: "off",
    related_store_items: [],
    source_set: submission.source_set,
    author_id: `writer-${submission.author_id}`,
    author_name: submission.author_name,
    author_role_vi: submission.author_role_vi,
    author_role_en: submission.author_role_en,
    published_at: submission.created_at,
    updated_at: new Date().toISOString()
  };
}

function buildPublicationMeta(submission) {
  const article = submissionToArticle(submission);
  return {
    id: article.id,
    href: `/${submission.language}/${contentSegment(article.content_type, submission.language)}/${article.slug}`
  };
}

function contentSegment(contentType, language) {
  const byType = {
    NewsArticle: { vi: "tin-tuc", en: "news" },
    EvergreenGuide: { vi: "huong-dan", en: "guides" },
    ComparisonPage: { vi: "so-sanh", en: "compare" },
    Roundup: { vi: "tong-hop", en: "roundups" }
  };
  return byType[contentType]?.[language] || byType.NewsArticle[language];
}

function sanitizeSections(sections) {
  return sections
    .map((section) => ({
      heading: safeTrim(section.heading),
      body: safeTrim(section.body)
    }))
    .filter((section) => section.heading && section.body);
}

function sanitizeSources(sources) {
  return sources
    .map((source) => ({
      source_type: safeTrim(source.source_type) || "press",
      source_name: safeTrim(source.source_name),
      source_url: safeTrim(source.source_url),
      region: safeTrim(source.region) || "Global",
      language: safeTrim(source.language) || "vi",
      trust_tier: safeTrim(source.trust_tier) || "community",
      published_at: source.published_at || new Date().toISOString(),
      image_url: safeTrim(source.image_url),
      image_caption: safeTrim(source.image_caption),
      image_credit: safeTrim(source.image_credit)
    }))
    .filter((source) => source.source_name && source.source_url);
}

function sanitizeImage(image) {
  if (!image || typeof image !== "object") {
    return null;
  }

  const src = safeTrim(image.src);

  if (!src) {
    return null;
  }

  return {
    src,
    alt: safeTrim(image.alt),
    caption: safeTrim(image.caption),
    credit: safeTrim(image.credit),
    source_url: safeTrim(image.source_url)
  };
}

function strengthenSubmissionTitle(title, { language, topic, summary, dek, sections }) {
  const normalized = stripTrailingPunctuation(title);

  if (!normalized) {
    return normalized;
  }

  if (normalized.length >= 46 && /[:?!]/.test(normalized)) {
    return normalized;
  }

  const suffix = buildTitleSuffix({ language, topic, summary, dek, sections });
  return suffix && !normalized.toLowerCase().includes(suffix.toLowerCase()) ? `${normalized}: ${suffix}` : normalized;
}

function buildTitleSuffix({ language, topic, summary, dek, sections }) {
  const sourceText = [dek, summary, ...sections.map((section) => section.heading), ...sections.map((section) => section.body)].join(" ");
  const phrases = extractKeyPhrases(sourceText);

  if (phrases.length > 0) {
    return phrases[0];
  }

  const fallbackByTopic = {
    ai: {
      vi: "điều đội vận hành đang để mắt tới",
      en: "why teams are paying attention"
    },
    software: {
      vi: "điều người dùng nên để ý",
      en: "what users should watch"
    },
    devices: {
      vi: "điểm thay đổi đáng chú ý",
      en: "the hardware shift to watch"
    },
    security: {
      vi: "rủi ro không nên bỏ qua",
      en: "the risk worth noticing"
    },
    gaming: {
      vi: "lý do cộng đồng đang bàn tán",
      en: "why the community is talking"
    },
    "internet-business": {
      vi: "tác động tới người dùng số",
      en: "what it changes for digital users"
    }
  };

  return fallbackByTopic[topic]?.[language] || fallbackByTopic.ai[language];
}

function buildSubmissionHook({ value, dek, summary, sections, language }) {
  const provided = finalizeSentence(value);

  if (provided && provided.length >= 70) {
    return provided;
  }

  const opening = finalizeSentence(dek) || firstSentence(summary) || firstSentence(sections[0]?.body || "");

  if (!opening) {
    return language === "vi"
      ? "Câu chuyện này đáng đọc vì nó không chỉ là một cập nhật mới, mà còn gợi ra cách người dùng và đội vận hành sẽ phản ứng với thay đổi kế tiếp."
      : "This story matters because it is not just another update; it hints at how users and operating teams may react next.";
  }

  if (opening.length >= 110) {
    return opening;
  }

  return language === "vi"
    ? `${opening} Đây là phần đáng đọc kỹ trước khi xu hướng này đi xa hơn.`
    : `${opening} That is the part worth watching before the shift moves any further.`;
}

function polishDek({ value, summary, sections, language }) {
  const provided = finalizeSentence(value);

  if (provided && provided.length >= 60) {
    return provided;
  }

  const source = finalizeSentence(summary) || firstSentence(sections[0]?.body || "");

  if (source) {
    return source;
  }

  return language === "vi"
    ? "Bài viết này gom lại bối cảnh, thay đổi chính và tác động thực tế để người đọc nắm nhanh điều quan trọng nhất."
    : "This story pulls together the context, the shift, and the practical impact so readers can grasp the key point quickly.";
}

function polishSummary({ value, dek, sections, language }) {
  const provided = finalizeSentence(value);

  if (provided && provided.length >= 100) {
    return provided;
  }

  const source = [finalizeSentence(dek), firstSentence(sections[0]?.body || ""), firstSentence(sections[1]?.body || "")]
    .filter(Boolean)
    .join(" ");

  if (source.length >= 100) {
    return source;
  }

  return language === "vi"
    ? "Bài viết đi thẳng vào điều đã xảy ra, vì sao nó đáng chú ý và tác động thực tế tới người dùng hoặc đội vận hành."
    : "The story goes straight to what happened, why it matters, and the practical effect on users or operating teams.";
}

function containsHeavyPromoLanguage(submission) {
  const corpus = [submission.title, submission.summary, submission.dek, ...submission.sections.map((section) => section.body)]
    .join(" ")
    .toLowerCase();

  return ["mua ngay", "giảm giá", "khuyến mãi", "buy now", "limited offer", "cheap account"].some((term) => corpus.includes(term));
}

function isCompellingTitle(title, language) {
  const normalized = title.toLowerCase();
  const hasStructure = /[:?!]/.test(title) || title.length >= 46;
  const banned = language === "vi"
    ? ["mua ngay", "giam gia", "khuyen mai", "hot nhat hom nay"]
    : ["buy now", "limited offer", "best deal", "cheap"];

  return hasStructure && !banned.some((term) => normalized.includes(term));
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    provider: user.provider,
    status: user.status,
    name: user.name,
    email: user.email,
    google_picture: user.google_picture || "",
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at
  };
}

function normalizeEmail(email) {
  return safeTrim(email).toLowerCase();
}

function safeTrim(value) {
  return String(value || "").trim();
}

function stripTrailingPunctuation(value) {
  return safeTrim(value).replace(/[.?!:;,]+$/g, "");
}

function finalizeSentence(value) {
  const normalized = safeTrim(value).replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return /[.?!]$/.test(normalized) ? normalized : `${normalized}.`;
}

function firstSentence(value) {
  const normalized = safeTrim(value).replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  const match = normalized.match(/[^.?!]+[.?!]?/);
  return finalizeSentence(match?.[0] || normalized);
}

function extractKeyPhrases(value) {
  return safeTrim(value)
    .split(/[.?!]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 22 && entry.length <= 68)
    .map((entry) => entry.replace(/^(vì|để|khi|that|because|when)\s+/i, ""))
    .slice(0, 2);
}

function slugify(value) {
  return safeTrim(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || `story-${crypto.randomUUID().slice(0, 8)}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sortByUpdatedAtDesc(left, right) {
  return new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime();
}

function sortByCreatedAtDesc(left, right) {
  return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function sortByPublishedArticleDateDesc(left, right) {
  return new Date(right.published_at || right.updated_at || 0).getTime() - new Date(left.published_at || left.updated_at || 0).getTime();
}
