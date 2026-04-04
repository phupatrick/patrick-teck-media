import crypto from "node:crypto";

import { repairEncodingArtifacts } from "./text-repair.mjs";

const SOURCE_TYPE_PRIORITY = {
  "official-site": 30,
  press: 22,
  "official-social": 18,
  "editorial-research": 14,
  "internal-roundup": 10,
  community: 5,
  "social-buzz": 2
};

const TRUST_PRIORITY = {
  official: 18,
  "established-media": 12,
  specialist: 10,
  emerging: 7,
  community: 3
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "over", "after", "before", "under", "more", "than", "your",
  "their", "they", "them", "what", "when", "where", "which", "will", "just", "even", "still", "have", "has", "had", "been",
  "being", "about", "around", "while", "across", "because", "could", "would", "should", "using", "used", "use", "gets",
  "making", "makes", "made", "take", "takes", "took", "says", "said", "news", "story", "stories", "latest", "update",
  "đang", "được", "những", "nhưng", "trong", "ngoài", "cùng", "cũng", "với", "của", "cho", "đây", "đó", "này", "kia", "khi",
  "sao", "vào", "trên", "dưới", "một", "như", "đến", "theo", "lúc", "vừa", "mới", "thêm", "sẽ", "đã", "vẫn", "cần", "đi",
  "tin", "bài", "câu", "chuyện", "người", "dùng", "tech", "media", "patrick"
]);

export function aggregateIncomingDrafts(drafts, now = new Date().toISOString()) {
  const validDrafts = (Array.isArray(drafts) ? drafts : []).filter(Boolean).sort(sortDraftsByPriority);
  const clusters = [];

  for (const draft of validDrafts) {
    const cluster = clusters.find((entry) => canJoinCluster(entry, draft));

    if (cluster) {
      cluster.members.push(draft);
    } else {
      clusters.push({
        language: draft.language,
        contentFamily: getContentFamily(draft.content_type),
        members: [draft]
      });
    }
  }

  return clusters.map((cluster) => buildClusterArticle(cluster, now)).filter(Boolean);
}

export function buildEditorialCompanionArticles(articles, now = new Date().toISOString()) {
  const pool = (Array.isArray(articles) ? articles : []).filter(Boolean);
  const companions = [];

  for (const language of ["vi", "en"]) {
    const aiPackageMembers = selectCompanionMembers(pool, language, isAiPackageStory, 10);
    const tipMembers = selectCompanionMembers(pool, language, isPracticalTechStory, 10);

    if (aiPackageMembers.length >= 2) {
      companions.push(buildAiPackageCompanionStory({ language, members: aiPackageMembers, now }));
      companions.push(buildAiPlanBuyingGuide({ language, members: aiPackageMembers, now }));
    }

    companions.push(...buildAiProviderCompanionArticles(pool, language, now));

    if (tipMembers.length >= 3) {
      companions.push(buildPracticalTipsCompanionStory({ language, members: tipMembers, now }));
    }
  }

  return companions.filter(Boolean);
}

function buildClusterArticle(cluster, now) {
  const members = [...cluster.members].sort(sortDraftsByPriority);
  const lead = members[0];

  if (!lead) {
    return null;
  }

  const language = lead.language === "en" ? "en" : "vi";
  const topic = resolveClusterTopic(members);
  const contentType = resolveClusterContentType(members);
  const sources = dedupeSources(members);
  const pool = collectSentencePool(members);
  const image = selectClusterImage(members, sources, language, {
    preferredProviders: topic === "ai" ? detectAiProviderKeys(lead).slice(0, 2) : []
  });
  const verificationState = resolveVerificationState(members, sources);
  const lens = resolveEditorialLens({ lead, members, sources, topic, contentType });
  const title = buildClusterTitle({ lead, language, contentType });
  const summary = buildClusterSummary({ members, lead, sources, pool, language, topic, contentType, verificationState, lens });
  const dek = buildClusterDek({ lead, sources, pool, language, topic, contentType, verificationState, lens });
  const hook = buildClusterHook({ lead, sources, pool, language, topic, contentType, verificationState, lens });
  const sections = buildClusterSections({
    members,
    lead,
    sources,
    pool,
    language,
    topic,
    contentType,
    verificationState,
    lens
  });
  const clusterHash = buildClusterHash({ language, contentType, title, sources, lead });
  const publishedAt = newestTimestamp(members);
  const updatedAt = now || publishedAt;

  return {
    ...lead,
    id: lead.id || `story-${clusterHash}-${language}`,
    cluster_id: `story-${clusterHash}`,
    language,
    topic,
    content_type: contentType,
    slug: slugify(title).slice(0, 96),
    title,
    summary,
    dek,
    hook,
    sections,
    verification_state: verificationState,
    quality_score: calculateClusterQualityScore({ members, sources, sections, image, summary, dek, hook, verificationState }),
    ad_eligible: verificationState !== "trend",
    show_editorial_label: verificationState !== "verified",
    indexable: true,
    editorial_focus: resolveEditorialFocus({ topic, contentType, lens }),
    store_link_mode: resolveStoreLinkMode(topic, contentType),
    related_store_items: resolveStoreItems(topic),
    source_set: sources,
    author_id: resolveAuthorId(topic, lead.author_id),
    published_at: publishedAt,
    updated_at: updatedAt,
    image
  };
}

function canJoinCluster(cluster, draft) {
  if (!cluster || !draft) {
    return false;
  }

  if (cluster.language !== draft.language || cluster.contentFamily !== getContentFamily(draft.content_type)) {
    return false;
  }

  return cluster.members.some((member) => areDraftsRelated(member, draft));
}

function areDraftsRelated(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftUrl = getPrimarySourceUrl(left);
  const rightUrl = getPrimarySourceUrl(right);

  if (leftUrl && rightUrl && leftUrl === rightUrl) {
    return true;
  }

  const dateGapHours = Math.abs(new Date(left.published_at || 0).getTime() - new Date(right.published_at || 0).getTime()) / 36e5;

  if (Number.isFinite(dateGapHours) && dateGapHours > 84) {
    return false;
  }

  const leftTokens = getStoryTokens(`${left.title} ${left.summary} ${left.dek}`, left.language);
  const rightTokens = getStoryTokens(`${right.title} ${right.summary} ${right.dek}`, right.language);
  const similarity = computeTokenSimilarity(leftTokens, rightTokens);
  const sameTopic = normalizeTopic(left.topic) === normalizeTopic(right.topic);

  if (similarity.exact) {
    return true;
  }

  if (similarity.overlap >= 0.78 || similarity.jaccard >= 0.62) {
    return true;
  }

  if (sameTopic && similarity.shared >= 5 && similarity.jaccard >= 0.42) {
    return true;
  }

  return sameTopic && similarity.sharedLong >= 3 && similarity.overlap >= 0.58;
}

function selectCompanionMembers(articles, language, predicate, limit) {
  const localFirst = articles
    .filter((article) => article.language === language && predicate(article))
    .sort(sortDraftsByPriority);
  const crossLanguage = articles
    .filter((article) => article.language !== language && predicate(article))
    .sort(sortDraftsByPriority);

  return dedupeCompanionMembers([...localFirst, ...crossLanguage], limit);
}

function dedupeCompanionMembers(articles, limit) {
  const seen = new Set();
  const picked = [];

  for (const article of articles) {
    const key = article.cluster_id || getPrimarySourceUrl(article) || article.id || article.slug;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    picked.push(article);

    if (picked.length >= limit) {
      break;
    }
  }

  return picked;
}

function isAiPackageStory(article) {
  const text = [
    article.title,
    article.summary,
    article.dek,
    article.hook,
    ...(article.sections || []).flatMap((section) => [section.heading, section.body])
  ]
    .filter(Boolean)
    .join(" ");

  return hasAiPackageSignals(text);
}

function isPracticalTechStory(article) {
  const text = [
    article.title,
    article.summary,
    article.dek,
    article.hook,
    ...(article.sections || []).flatMap((section) => [section.heading, section.body])
  ]
    .filter(Boolean)
    .join(" ");

  if (/\b(recipe|cooking|chicken|oven|kitchen|restaurant|travel|vacation|fashion|diet)\b/i.test(text)) {
    return false;
  }

  return article.content_type === "EvergreenGuide"
    || /\b(how to|how-to|guide|tips?|mẹo|thủ thuật|hướng dẫn|cách dùng|cách làm)\b/i.test(text);
}

function buildAiPackageCompanionStory({ language, members, now }) {
  const lead = [...members].sort(sortDraftsByPriority)[0];

  if (!lead) {
    return null;
  }

  const sources = dedupeSources(members).slice(0, 8);
  const pool = collectSentencePool(members);
  const providerKeys = detectAiProviderKeysFromMembers(members);
  const providers = providerKeys.map((providerKey) => AI_PROVIDER_LABELS[providerKey]).filter(Boolean);
  const providerLabel = formatProviderList(providers, language);
  const verificationState = resolveVerificationState(members, sources);
  const image = selectClusterImage(members, sources, language, {
    preferredProviders: providerKeys.slice(0, 3)
  });
  const title =
    language === "vi"
      ? `Gói AI nào đang đáng tiền hơn lúc này: ${providerLabel} vừa thêm gì vào cuộc đua?`
      : `Which AI plan feels more useful right now: what ${providerLabel} just added to the race`;
  const summary = composeParagraph(
    [
      language === "vi"
        ? `${providerLabel} đang cùng kéo cuộc đua gói AI khỏi phần trình diễn đơn thuần để bước vào phần giá trị dùng thật: giá, dung lượng, model mạnh hơn và những quyền lợi có thể chạm trực tiếp vào công việc mỗi ngày.`
        : `${providerLabel} are pushing the AI plan race beyond pure launch theater into practical value: price, storage, stronger models, and bundle rights that can change daily work.`,
      buildCorroborationSentence(sources, language, verificationState),
      language === "vi"
        ? "Điều người đọc thực sự cần ở dạng bài này không phải một bảng giá khô, mà là câu trả lời rõ hơn về việc trả tiền tháng đó đổi lại được gì, có đỡ bước nào trong công việc hay không và hãng nào đang tăng giá trị thật thay vì chỉ thêm tiếng vang marketing."
        : "What readers actually need here is not a dry price table, but a clearer answer on what the monthly spend unlocks, which steps it removes from work, and which companies are increasing real utility instead of just adding launch noise."
    ],
    language === "vi"
      ? "Bài tổng hợp này gom các thay đổi mới nhất của nhóm gói AI đang được chú ý nhất để người đọc nhìn giá, quyền lợi và độ hữu ích trên cùng một mặt bàn."
      : "This editorial digest pulls the latest AI plan changes onto one table so readers can compare price, rights, and usefulness in one pass.",
    220
  );
  const dek = composeParagraph(
    [
      language === "vi"
        ? `${providerLabel} đang không chỉ bán model mạnh hơn, mà còn bán thêm dung lượng, quyền truy cập công cụ sáng tạo, lớp cộng tác cho Workspace và cảm giác “đỡ phải mua lẻ” nhiều dịch vụ khác nhau.`
        : `${providerLabel} are no longer just selling stronger models; they are bundling storage, creation tools, workspace layers, and a feeling that fewer separate subscriptions are needed.`,
      buildImpactSentence("ai", language, "ComparisonPage")
    ],
    language === "vi"
      ? "Đây là bài dành cho người đang trả tiền cho AI và muốn biết gói nào đang tăng giá trị thật, gói nào mới chỉ đẹp ở phần giới thiệu."
      : "This is for readers already paying for AI and trying to see which plans are adding real value and which ones still look better in the pitch than in everyday use.",
    150
  );
  const hook = composeParagraph(
    [
      language === "vi"
        ? `Nếu trước đây câu hỏi chỉ là “model nào mạnh hơn”, thì ở nhịp mới câu hỏi đã đổi thành “gói nào giúp mình làm được nhiều việc hơn mà không phải mua thêm quá nhiều dịch vụ phụ”.`
        : `If the old question was simply “which model is stronger,” the new one is “which plan lets me do more without stacking too many side subscriptions.”`,
      buildHookAngle({ language, topic: "ai", contentType: "ComparisonPage", verificationState, sourceCount: sources.length })
    ],
    language === "vi"
      ? "Đó là lý do những thay đổi ở Google AI Pro, Workspace, ChatGPT, Claude hay Copilot đang đáng đọc hơn một headline nâng giá hay tăng dung lượng đơn lẻ."
      : "That is why changes across Google AI Pro, Workspace, ChatGPT, Claude, or Copilot now deserve more than a one-line headline about a price move or a storage bump.",
    180
  );
  const sections = [
    {
      heading: language === "vi" ? "Điểm mới đáng giữ lại" : "The updates worth keeping",
      body: composeParagraph(
        [
          language === "vi"
            ? `${providerLabel} không còn chỉ dùng gói AI để khoe model mạnh hơn, mà đang đẩy thêm dung lượng, lớp sáng tạo và tích hợp công việc để gói trả phí có lý do tồn tại rõ ràng hơn.`
            : `${providerLabel} are no longer using AI plans just to showcase stronger models; they are adding storage, creative layers, and work integration so the paid bundle has a clearer reason to exist.`,
          buildCorroborationSentence(sources, language, verificationState),
          buildSourceTrailSentence(sources, language)
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Google, ChatGPT, Claude và Copilot đang chơi bài gì" : "What Google, ChatGPT, Claude, and Copilot are really doing",
      body: composeParagraph(
        [
          language === "vi"
            ? `${providerLabel} đang cùng đẩy cuộc chơi sang phần “gói đủ dùng thật”, nơi dung lượng, tích hợp sâu vào công cụ làm việc, và quyền truy cập model mới bắt đầu quan trọng ngang với chất lượng đầu ra.`
            : `${providerLabel} are all pushing the market toward plans that feel complete in real work, where storage, deeper productivity integration, and access to newer models matter as much as raw output quality.`,
          buildNuanceSentence({ language, topic: "ai", verificationState, sourceCount: sources.length }),
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        dek,
        180
      )
    },
    {
      heading: language === "vi" ? "Giá, dung lượng và quyền lợi nên nhìn vào đâu" : "Where to look at price, storage, and bundle rights",
      body: composeParagraph(
        [
          language === "vi"
            ? "Với gói AI, bảng giá chỉ là lớp đầu. Thứ nên nhìn tiếp là model nào được mở khóa, dung lượng có tăng thật không, tính năng nghiên cứu hoặc tạo nội dung có bị giới hạn theo vùng không, và dữ liệu doanh nghiệp có được tách khỏi việc huấn luyện mô hình hay không."
            : "On AI plans, price is only the first layer. The next read is which model tier gets unlocked, whether storage truly expands, whether creation and research features are region-limited, and whether enterprise data is separated from model training.",
          language === "vi"
            ? "Đây cũng là nơi người dùng tách được giá trị thật khỏi phần quảng bá: gói nào giúp bớt mua lẻ thêm dịch vụ, gói nào chỉ đổi tên quyền lợi cũ, và gói nào bắt đầu chạm vào việc làm mỗi ngày."
            : "This is also where readers separate practical value from launch marketing: which plans reduce extra subscriptions, which ones mostly rename older perks, and which ones genuinely touch daily work."
        ],
        language === "vi"
          ? "Đây là phần quyết định gói nào thật sự đáng tiền, nhất là với người vừa lưu trữ dữ liệu, vừa cộng tác, vừa dùng AI trong cùng một hệ sinh thái."
          : "This is the layer that decides whether a plan is genuinely worth paying for, especially for readers who store, collaborate, and use AI inside the same ecosystem.",
        180
      )
    },
    {
      heading: language === "vi" ? "Ai nên mở ví, ai nên đứng ngoài" : "Who should pay now and who should wait",
      body: composeParagraph(
        [
          language === "vi"
            ? "Người nên theo dõi sát nhất là nhóm đang trả tiền cho lưu trữ, email, tài liệu, họp trực tuyến và AI cùng lúc. Nếu gói mới gom được nhiều lớp đó vào một chỗ, giá trị sẽ lộ ra rất nhanh. Ngược lại, người chỉ cần hỏi đáp lẻ hoặc dùng AI thỉnh thoảng vẫn nên cân nhắc bản miễn phí trước khi nâng gói."
            : "The readers who should pay closest attention are those already spending on storage, mail, documents, meetings, and AI at the same time. If a new plan bundles those layers well, the value shows up fast. Readers who only need occasional prompting may still be better served by free tiers first.",
          buildImpactSentence("ai", language, "ComparisonPage")
        ],
        hook,
        180
      )
    },
    {
      heading: language === "vi" ? "Patrick Tech Media đánh giá" : "Patrick Tech Media take",
      body: composeParagraph(
        [
          language === "vi"
            ? "Điểm đáng nhìn nhất của nhịp này là các hãng lớn đã thôi bán AI như một món phụ, mà đang biến nó thành lõi của gói trả phí. Ai gom được model tốt, lưu trữ rộng, công cụ sáng tạo và quyền riêng tư đủ yên tâm vào cùng một hóa đơn sẽ có lợi thế lớn hơn nhiều so với một lời hứa demo đẹp."
            : "The clearest shift in this cycle is that major vendors are no longer selling AI as an add-on. They are turning it into the center of the paid package. The vendor that bundles stronger models, larger storage, creative tooling, and believable privacy into one bill will gain a longer edge than any flashy demo promise.",
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        summary,
        190
      )
    }
  ];

  return buildCompanionArticleShell({
    id: `editorial-ai-package-watch-${language}`,
    clusterId: "editorial-ai-package-watch",
    slug: language === "vi" ? "goi-ai-nao-dang-dang-tien-hon-luc-nay" : "which-ai-plan-feels-more-useful-right-now",
    title,
    summary,
    dek,
    hook,
    language,
    topic: "ai",
    contentType: "ComparisonPage",
    verificationState,
    sources,
    sections,
    image,
    now,
    publishedAt: newestTimestamp(members),
    authorId: "mai-linh",
    relatedStoreItems: ["ai-workspace-bundle"],
    editorialFocus: ["ai-package", "comparison", "ai"]
  });
}

function buildPracticalTipsCompanionStory({ language, members, now }) {
  const lead = [...members].sort(sortDraftsByPriority)[0];

  if (!lead) {
    return null;
  }

  const sources = dedupeSources(members).slice(0, 8);
  const verificationState = resolveVerificationState(members, sources);
  const image = selectClusterImage(members, sources, language);
  const title =
    language === "vi"
      ? "Những mẹo công nghệ đáng lưu lúc này: AI, Workspace và app nào đang giúp đỡ việc thật"
      : "The practical tech tips worth saving right now: which AI, workspace, and app moves actually help";
  const summary = composeParagraph(
    [
      language === "vi"
        ? "Không phải bài thủ thuật nào cũng đáng lưu. Dạng đáng giữ lại là những mẹo có thể giúp người đọc làm nhanh hơn, đỡ lỗi hơn hoặc bớt mua nhầm công cụ trong bối cảnh AI và app đang đổi rất nhanh theo từng đợt cập nhật."
        : "Not every how-to is worth saving. The ones that matter are the tips that make work faster, reduce mistakes, or prevent readers from choosing the wrong tool while AI and apps keep changing release by release.",
      buildCorroborationSentence(sources, language, verificationState),
      buildSourceTrailSentence(sources, language)
    ],
    language === "vi"
      ? "Bài tổng hợp này gom những mẹo và hướng dẫn công nghệ nên giữ lại nếu bạn đang dùng AI, Workspace và các app năng suất mỗi ngày."
      : "This editorial guide groups the tips worth keeping if you rely on AI, Workspace, and productivity apps every day.",
    210
  );
  const dek = composeParagraph(
    [
      language === "vi"
        ? "Điểm khác của một bài mẹo tốt là nó không dừng ở mẹo lẻ. Nó phải nói rõ nên áp dụng lúc nào, điều gì dễ làm sai và mẹo đó tiết kiệm cho người đọc bước nào trong công việc."
        : "What separates a useful tip piece from filler is context: when to use the trick, what goes wrong most often, and which step in the workflow it actually saves.",
      buildImpactSentence("apps-software", language, "EvergreenGuide"),
      buildAssessmentSentence({ language, topic: "apps-software", contentType: "EvergreenGuide", verificationState, sourceCount: sources.length })
    ],
    language === "vi"
      ? "Đây là lớp bài dành cho người muốn dùng AI và app theo hướng gọn, hiệu quả và bớt phải học lại từ đầu sau mỗi đợt cập nhật."
      : "This is the kind of coverage for readers who want AI and apps to feel cleaner, more efficient, and less like relearning the workflow every few weeks.",
    150
  );
  const hook = composeParagraph(
    [
      language === "vi"
        ? "Nếu tin nóng giữ nhịp cho newsroom, thì các bài thủ thuật tốt mới là thứ giữ người đọc quay lại: chúng giúp biến thay đổi của sản phẩm thành thao tác dùng được ngay thay vì chỉ thêm một headline đẹp."
        : "If breaking news sets the pace of a newsroom, strong how-to pieces are what keep readers returning: they turn product changes into actions people can use instead of another attractive headline.",
      buildHookAngle({ language, topic: "apps-software", contentType: "EvergreenGuide", verificationState, sourceCount: sources.length }),
      language === "vi"
        ? "Điều đáng giữ lại ở dạng bài này là nó giúp người đọc làm nhanh hơn ngay trong ngày, chứ không đẩy thêm một lớp hướng dẫn khó áp dụng vào thực tế."
        : "The real win in this kind of piece is helping readers move faster the same day instead of piling on another guide that looks smart and stays unused."
    ],
    summary,
    180
  );
  const sections = [
    {
      heading: language === "vi" ? "Ba hướng dẫn đáng lưu trước" : "The first guides worth saving",
      body: composeParagraph(
        [
          language === "vi"
            ? "Điểm chung của nhóm bài này là chúng đều chạm vào việc thật: lưu trữ, cộng tác, ghi chú, tìm kiếm thông tin hoặc dùng AI để rút ngắn một bước đang lặp lại hằng ngày."
            : "The common thread across these pieces is practical work: storage, collaboration, note-taking, information retrieval, or using AI to shorten a step that repeats every day.",
          buildCorroborationSentence(sources, language, verificationState),
          buildSourceTrailSentence(sources, language)
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Mẹo nào dùng được ngay" : "Which tips are usable right away",
      body: composeParagraph(
        [
          language === "vi"
            ? "Mẹo đáng giữ lại thường là mẹo không cần đổi quá nhiều thói quen hoặc cài thêm ba bốn lớp phụ trợ. Càng ít bước, giá trị càng dễ lộ ra ngay."
            : "The tips worth keeping usually do not require people to rewire their whole habit stack or add three extra setup layers. The fewer moving parts, the faster the value shows.",
          buildImpactSentence("apps-software", language, "EvergreenGuide"),
          dek
        ],
        dek,
        180
      )
    },
    {
      heading: language === "vi" ? "Những lỗi dễ gặp nhất" : "The easiest mistakes to make",
      body: composeParagraph(
        [
          language === "vi"
            ? "Sai lầm phổ biến nhất là thấy mẹo hay rồi áp dụng ngay nhưng bỏ qua điều kiện đầu vào: quyền truy cập, khu vực mở tính năng, cấu hình tài khoản hay giới hạn của gói đang dùng. Đó là lúc mẹo trông đúng nhưng kết quả cuối vẫn hẫng."
            : "The most common mistake is seeing a clever tip and applying it immediately while ignoring the setup layer: access rights, regional rollout, account configuration, or plan limits. That is where a good trick looks correct and still disappoints in the result.",
          buildNuanceSentence({ language, topic: "apps-software", verificationState, sourceCount: sources.length })
        ],
        hook,
        180
      )
    },
    {
      heading: language === "vi" ? "Nên áp dụng vào việc gì" : "Where this really helps in work",
      body: composeParagraph(
        [
          language === "vi"
            ? "Nhóm người đọc hợp nhất với dạng bài này là người đang xử lý tài liệu, họp, nhắn tin nội bộ, tìm lại thông tin và làm việc với nhiều ứng dụng cùng lúc. Nếu một mẹo giúp cắt bớt một bước lặp, nó sẽ có giá trị cao hơn nhiều so với một tính năng chỉ đẹp trong bản giới thiệu."
            : "This style of guide is most useful for readers juggling documents, meetings, internal messaging, search, and multiple apps at once. If a tip removes one repeated step, it usually matters more than a feature that only looks good in the announcement.",
          buildImpactSentence("apps-software", language, "EvergreenGuide")
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Patrick Tech Media chốt lại" : "Patrick Tech Media takeaway",
      body: composeParagraph(
        [
          language === "vi"
            ? "Mẹo công nghệ đáng giữ lại không phải là mẹo gây ngạc nhiên nhất, mà là mẹo đỡ mất thời gian nhất. Đó cũng là lý do Patrick Tech Media sẽ tiếp tục đẩy mạnh lớp bài hướng dẫn, mẹo AI và mẹo app thay vì chỉ để chúng nằm ở rìa newsroom."
            : "The tips worth saving are not always the most surprising ones; they are the ones that save the most time. That is why Patrick Tech Media is pushing deeper into practical AI and app guidance instead of leaving it at the edge of the newsroom.",
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        dek,
        190
      )
    }
  ];

  return buildCompanionArticleShell({
    id: `editorial-practical-tech-tips-${language}`,
    clusterId: "editorial-practical-tech-tips",
    slug: language === "vi" ? "nhung-meo-cong-nghe-dang-luu-luc-nay" : "the-practical-tech-tips-worth-saving-right-now",
    title,
    summary,
    dek,
    hook,
    language,
    topic: "apps-software",
    contentType: "EvergreenGuide",
    verificationState,
    sources,
    sections,
    image,
    now,
    publishedAt: newestTimestamp(members),
    authorId: "mai-linh",
    relatedStoreItems: ["creator-software-stack"],
    editorialFocus: ["tips", "guide", "apps-software"]
  });
}

function buildAiProviderCompanionArticles(articles, language, now) {
  const providers = ["google", "openai", "anthropic", "microsoft", "xai"];
  const companions = [];

  for (const providerKey of providers) {
    const members = selectCompanionMembers(
      articles,
      language,
      (article) => isAiPackageStory(article) && articleHasFocusedAiProvider(article, providerKey),
      8
    );
    const sources = dedupeSources(members);

    if (members.length < 2 || sources.length < 2) {
      continue;
    }

    companions.push(buildAiProviderCompanionStory({ language, providerKey, members, now }));
  }

  return companions;
}

function buildAiPlanBuyingGuide({ language, members, now }) {
  const lead = [...members].sort(sortDraftsByPriority)[0];

  if (!lead) {
    return null;
  }

  const providerKeys = detectAiProviderKeysFromMembers(members);
  const providers = providerKeys.map((providerKey) => AI_PROVIDER_LABELS[providerKey]).filter(Boolean);
  const providerLabel = formatProviderList(providers, language);
  const sources = dedupeSources(members).slice(0, 8);
  const verificationState = resolveVerificationState(members, sources);
  const image = selectClusterImage(members, sources, language, {
    preferredProviders: providerKeys.slice(0, 3)
  });
  const title =
    language === "vi"
      ? `Chọn gói AI thế nào cho đáng tiền trong 2026: ${providerLabel} nên soi gì trước khi trả phí`
      : `How to choose an AI plan that feels worth paying for in 2026: what to check across ${providerLabel}`;
  const summary = composeParagraph(
    [
      language === "vi"
        ? `Điều người dùng cần ở một bài chọn gói AI không phải thêm một bảng giá khô, mà là một checklist đủ rõ để tách gói nào thật sự giúp công việc chạy nhanh hơn khỏi gói chỉ đẹp ở phần giới thiệu.`
        : `What readers need from an AI plan guide is not another dry price table, but a checklist clear enough to separate plans that genuinely speed up work from those that mostly look good in launch copy.`,
      buildCorroborationSentence(sources, language, verificationState),
      language === "vi"
        ? `${providerLabel} đang cùng đẩy cuộc đua sang phần dùng thật: model nào được mở khóa, dung lượng có thật sự rộng hơn, quyền riêng tư được hứa đến đâu, và có bớt được bao nhiêu hóa đơn phụ trong công việc hằng ngày.`
        : `${providerLabel} are all pushing the race toward practical value: which model tier opens up, how much storage really expands, how privacy is framed, and whether the bundle removes extra subscriptions from daily work.`
    ],
    language === "vi"
      ? "Bài hướng dẫn này gom những điểm cần soi kỹ nhất trước khi bạn xuống tiền cho một gói AI."
      : "This guide gathers the checks that matter most before you pay for an AI plan.",
    220
  );
  const dek = composeParagraph(
    [
      language === "vi"
        ? "Bắt đầu từ việc bạn cần viết, nghiên cứu, code, họp hay lưu trữ. Sau đó mới nhìn tới model, giới hạn tính năng, dữ liệu, và phần chi phí thật sự đội lên sau một vài tháng."
        : "Start with whether you need writing, research, coding, meetings, or storage. Only then move to model tiers, feature limits, data handling, and the real cost after a few months.",
      buildImpactSentence("ai", language, "EvergreenGuide")
    ],
    language === "vi"
      ? "Đây là bài dành cho người đang chuẩn bị nâng gói AI nhưng muốn tiêu tiền có logic hơn."
      : "This is for readers about to upgrade an AI plan and wanting a more disciplined way to spend.",
    160
  );
  const hook = composeParagraph(
    [
      language === "vi"
        ? "Nhiều người mua gói AI theo cảm giác bị kéo bởi model mới, trong khi phần đáng xem hơn lại nằm ở chỗ gói đó có giúp bớt công cụ rời, bớt thao tác tay và bớt rủi ro dữ liệu hay không."
        : "Many readers buy AI plans because a new model pulls attention, while the more important question is whether the bundle removes scattered tools, manual steps, and data anxiety.",
      buildHookAngle({ language, topic: "ai", contentType: "EvergreenGuide", verificationState, sourceCount: sources.length })
    ],
    language === "vi"
      ? "Nếu nhìn đúng các lớp này, bạn sẽ thấy gói nào nên mua ngay và gói nào vẫn nên đứng ngoài quan sát."
      : "Once you read the right layers, it becomes easier to see which plans deserve money now and which ones still belong on the watch list.",
    190
  );

  const sections = [
    {
      heading: language === "vi" ? "Bắt đầu từ việc bạn thật sự làm mỗi ngày" : "Start with the work you actually do every day",
      body: composeParagraph(
        [
          language === "vi"
            ? "Nếu bạn chỉ hỏi đáp nhanh, gói miễn phí vẫn có chỗ đứng. Nhưng khi công việc đã chạm vào viết dài, research, code, họp, lưu trữ file nặng hoặc chia sẻ cho nhóm, gói trả phí mới bắt đầu bộc lộ giá trị thật."
            : "If you mostly need quick prompting, free tiers can still be enough. Paid value starts to show when the workflow touches long-form writing, research, coding, meetings, heavy files, or team sharing.",
          buildImpactSentence("ai", language, "EvergreenGuide")
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Soi model, giới hạn và lớp tính năng đi kèm" : "Check the model tier, the limits, and the bundled feature layer",
      body: composeParagraph(
        [
          language === "vi"
            ? "Đừng chỉ nhìn vào tên model mạnh nhất trong quảng bá. Hãy xem model đó có nằm ở gói bạn định mua không, có bị giới hạn theo vùng hay số lượt hay không, và đi kèm những gì như Deep Research, video, voice, notebook, agent, hay lớp cộng tác."
            : "Do not stop at the headline model name. Check whether that model is actually in the tier you plan to buy, whether access is region- or quota-limited, and what rides alongside it: deep research, video, voice, notebooks, agents, or collaboration layers.",
          buildNuanceSentence({ language, topic: "ai", verificationState, sourceCount: sources.length })
        ],
        dek,
        180
      )
    },
    {
      heading: language === "vi" ? "Dung lượng, dữ liệu và hóa đơn phụ có bớt đi không" : "Does the plan really reduce storage pain, data risk, and side bills",
      body: composeParagraph(
        [
          language === "vi"
            ? "Một gói AI bắt đầu đáng tiền khi nó không chỉ mở model mà còn gom thêm lưu trữ, công cụ tạo nội dung, quyền quản trị hoặc quyền riêng tư dữ liệu vào cùng một hóa đơn. Đây là chỗ các gói Google, ChatGPT, Claude hay Copilot bắt đầu khác nhau thật sự."
            : "An AI plan becomes worth paying for when it does more than unlock a model. It should also absorb storage, creation tools, admin layers, or data protections into the same bill. This is where Google, ChatGPT, Claude, and Copilot start to diverge in meaningful ways.",
          buildCorroborationSentence(sources, language, verificationState)
        ],
        hook,
        190
      )
    },
    {
      heading: language === "vi" ? "Ai nên nâng gói ngay, ai nên chờ" : "Who should upgrade now and who should wait",
      body: composeParagraph(
        [
          language === "vi"
            ? "Người làm nội dung, freelancer, nhóm bán hàng, nhóm nghiên cứu và team cần cộng tác hằng ngày thường là nhóm cảm được giá trị sớm nhất. Ngược lại, người chỉ dùng AI lẻ tẻ hoặc chưa có nhu cầu lưu trữ/cộng tác nhiều thì nên chờ tới khi nhu cầu đủ dày mới nâng gói."
            : "Content teams, freelancers, sales teams, researchers, and groups that collaborate every day usually feel paid value first. Readers with lighter usage or no real storage and collaboration needs can often wait longer before upgrading.",
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Patrick Tech Media chốt lại" : "Patrick Tech Media take",
      body: composeParagraph(
        [
          language === "vi"
            ? "Gói AI đáng xuống tiền không phải gói ồn nhất, mà là gói bớt được nhiều ma sát nhất trong công việc. Nếu một hãng tăng model nhưng vẫn bắt bạn mua thêm quá nhiều mảnh rời, giá trị thực sẽ mỏng hơn cảm giác ban đầu."
            : "The AI plan worth paying for is not the loudest one, but the one that removes the most friction from work. If a vendor adds a stronger model but still forces too many side purchases, the practical value stays thinner than the launch feeling.",
          buildForwardLook("ai", title, language)
        ],
        dek,
        190
      )
    }
  ];

  return buildCompanionArticleShell({
    id: `editorial-ai-plan-buying-guide-${language}`,
    clusterId: "editorial-ai-plan-buying-guide",
    slug: language === "vi" ? "chon-goi-ai-the-nao-cho-dang-tien" : "how-to-pick-an-ai-plan-that-feels-worth-it",
    title,
    summary,
    dek,
    hook,
    language,
    topic: "ai",
    contentType: "EvergreenGuide",
    verificationState,
    sources,
    sections,
    image,
    now,
    publishedAt: newestTimestamp(members),
    authorId: "mai-linh",
    relatedStoreItems: ["ai-workspace-bundle"],
    editorialFocus: ["ai-package", "tips", "guide", "ai"]
  });
}

function buildAiProviderCompanionStory({ language, providerKey, members, now }) {
  const lead = [...members].sort(sortDraftsByPriority)[0];

  if (!lead) {
    return null;
  }

  const meta = getAiProviderMeta(providerKey, language);
  const sources = dedupeSources(members).slice(0, 8);
  const verificationState = resolveVerificationState(members, sources);
  const image = selectClusterImage(members, sources, language, {
    preferredProviders: [providerKey],
    strictProviderMatch: true
  });
  const summary = composeParagraph(
    [
      meta.summaryLead,
      buildCorroborationSentence(sources, language, verificationState),
      meta.summaryClose
    ],
    meta.summaryFallback,
    220
  );
  const dek = composeParagraph(
    [
      meta.dekLead,
      buildImpactSentence("ai", language, "ComparisonPage"),
      meta.dekClose
    ],
    meta.dekFallback,
    150
  );
  const hook = composeParagraph(
    [
      meta.hookLead,
      buildHookAngle({ language, topic: "ai", contentType: "NewsArticle", verificationState, sourceCount: sources.length }),
      language === "vi"
        ? "Điểm đáng đọc ở bài kiểu này là nó giúp người xem nhìn rõ phần giá trị dùng thật thay vì đứng ngoài nghe một đợt nâng cấp được kể bằng ngôn ngữ marketing."
        : "The useful part of this story is that it shows the real utility layer instead of leaving readers outside another upgrade framed in launch language."
    ],
    meta.hookFallback,
    180
  );
  const sections = [
    {
      heading: language === "vi" ? `${meta.label} vừa thay gì trong gói AI` : `What ${meta.label} just changed in its AI plans`,
      body: composeParagraph(
        [
          meta.summaryLead,
          buildCorroborationSentence(sources, language, verificationState),
          buildSourceTrailSentence(sources, language)
        ],
        summary,
        180
      )
    },
    {
      heading: language === "vi" ? "Giá trị tăng ở đâu" : "Where the value actually increased",
      body: composeParagraph(
        [
          meta.valueLead,
          buildImpactSentence("ai", language, "ComparisonPage"),
          buildAssessmentSentence({ language, topic: "ai", contentType: "ComparisonPage", verificationState, sourceCount: sources.length })
        ],
        dek,
        180
      )
    },
    {
      heading: language === "vi" ? "Điểm nên soi kỹ trước khi xuống tiền" : "The part worth checking before paying",
      body: composeParagraph(
        [
          meta.cautionLead,
          buildNuanceSentence({ language, topic: "ai", verificationState, sourceCount: sources.length }),
          language === "vi"
            ? "Đây thường là nơi quyết định gói nào thật sự đáng tiền, nhất là với người vừa lưu trữ dữ liệu, vừa cộng tác, vừa dùng AI trong cùng một hệ sinh thái."
            : "This is usually the layer that decides whether a plan is genuinely worth paying for, especially for readers who store, collaborate, and use AI inside the same ecosystem."
        ],
        hook,
        180
      )
    },
    {
      heading: language === "vi" ? `${meta.label} đang đứng ở đâu so với phần còn lại` : `Where ${meta.label} sits against the rest of the field`,
      body: composeParagraph(
        [
          meta.marketLead,
          buildCorroborationSentence(sources, language, verificationState),
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        meta.marketFallback,
        190
      )
    },
    {
      heading: language === "vi" ? "Patrick Tech Media đánh giá" : "Patrick Tech Media take",
      body: composeParagraph(
        [
          meta.takeLead,
          meta.takeClose,
          buildForwardLook("ai", lead.title, language)
        ],
        summary,
        200
      )
    }
  ];

  return buildCompanionArticleShell({
    id: `editorial-${providerKey}-ai-plan-watch-${language}`,
    clusterId: `editorial-${providerKey}-ai-plan-watch`,
    slug: meta.slug,
    title: meta.title,
    summary,
    dek,
    hook,
    language,
    topic: "ai",
    contentType: "ComparisonPage",
    verificationState,
    sources,
    sections,
    image,
    now,
    publishedAt: newestTimestamp(members),
    authorId: "mai-linh",
    relatedStoreItems: ["ai-workspace-bundle"],
    editorialFocus: ["ai-package", "comparison", "ai", `provider-${providerKey}`]
  });
}

const AI_PROVIDER_PATTERNS = {
  google: /\b(google|gemini|google one|google ai pro|google ai ultra|workspace|google workspace|notebooklm|veo|lyria|deep research)\b/i,
  openai: /\b(openai|chatgpt|chatgpt plus|chatgpt pro|chatgpt team|chatgpt enterprise|sora)\b/i,
  anthropic: /\b(anthropic|claude|claude pro|claude max|claude code)\b/i,
  microsoft: /\b(microsoft|copilot|copilot pro|microsoft 365 copilot|copilot studio)\b/i,
  xai: /\b(xai|grok)\b/i
};

const AI_PROVIDER_LABELS = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  microsoft: "Microsoft",
  xai: "xAI"
};

function articleMatchesAiProvider(article, providerKey) {
  return detectAiProviderKeys(article).includes(providerKey);
}

function articleHasFocusedAiProvider(article, providerKey) {
  const ranked = sortAiProviderScores(getAiProviderMentionScores(article), 10);
  const titleProviders = detectAiProviderKeys(typeof article === "string" ? article : article?.title);
  const topKey = ranked[0]?.[0] || "";
  const topScore = ranked[0]?.[1] || 0;
  const nextScore = ranked[1]?.[1] || 0;

  if (titleProviders[0] === providerKey && titleProviders.length === 1) {
    return true;
  }

  return topKey === providerKey && topScore >= Math.max(14, nextScore + 4);
}

function detectAiProviderKeys(article) {
  return sortAiProviderScores(getAiProviderMentionScores(article), 1).map(([providerKey]) => providerKey);
}

function detectAiProviderKeysFromMembers(members) {
  const combinedScores = new Map(Object.keys(AI_PROVIDER_LABELS).map((providerKey) => [providerKey, 0]));

  for (const [index, article] of (Array.isArray(members) ? members : []).entries()) {
    const articleScores = getAiProviderMentionScores(article);
    const articleWeight = Math.max(1, 4 - index);

    for (const [providerKey, score] of articleScores.entries()) {
      combinedScores.set(providerKey, (combinedScores.get(providerKey) || 0) + score * articleWeight);
    }
  }

  return sortAiProviderScores(combinedScores, 12).map(([providerKey]) => providerKey);
}

function getAiProviderMentionScores(article) {
  const item = typeof article === "string" ? null : article;
  const blocks = {
    title: cleanText(typeof article === "string" ? article : item?.title),
    summary: cleanText(item?.summary),
    dek: cleanText(item?.dek),
    hook: cleanText(item?.hook),
    sections: cleanText((item?.sections || []).flatMap((section) => [section?.heading, section?.body]).join(" ")),
    sources: cleanText((item?.source_set || []).flatMap((source) => [source?.source_name, source?.source_url, source?.image_caption, source?.image_credit]).join(" ")),
    image: cleanText([item?.image?.caption, item?.image?.credit, item?.image?.source_url].filter(Boolean).join(" "))
  };
  const scores = new Map(Object.keys(AI_PROVIDER_LABELS).map((providerKey) => [providerKey, 0]));

  for (const [providerKey, pattern] of Object.entries(AI_PROVIDER_PATTERNS)) {
    let score = 0;

    if (pattern.test(blocks.title)) {
      score += 20;
    }

    if (pattern.test(blocks.summary)) {
      score += 8;
    }

    if (pattern.test(blocks.dek)) {
      score += 10;
    }

    if (pattern.test(blocks.hook)) {
      score += 6;
    }

    if (pattern.test(blocks.sections)) {
      score += 5;
    }

    if (pattern.test(blocks.sources)) {
      score += 6;
    }

    if (pattern.test(blocks.image)) {
      score += 4;
    }

    scores.set(providerKey, score);
  }

  return scores;
}

function sortAiProviderScores(scores, minScore = 1) {
  return [...scores.entries()]
    .filter(([, score]) => score >= minScore)
    .sort((left, right) => {
      const scoreGap = right[1] - left[1];

      if (scoreGap !== 0) {
        return scoreGap;
      }

      return left[0].localeCompare(right[0]);
    });
}

function getAiProviderMeta(providerKey, language) {
  const label = AI_PROVIDER_LABELS[providerKey] || providerKey.toUpperCase();

  const vi = {
    google: {
      title: "Google vừa đổi gì trong các gói AI: 5TB, Workspace và NotebookLM đang kéo giá trị đi đâu",
      slug: "google-vua-doi-gi-trong-cac-goi-ai",
      summaryLead: "Google đang kéo cuộc đua gói AI sang một mặt bằng mới: dung lượng tăng, Workspace ăn Gemini sâu hơn, còn NotebookLM được đẩy lên vai trò trợ lý nghiên cứu thật sự.",
      summaryClose: "Điều đáng đọc ở câu chuyện này không nằm ở con số 5TB đơn lẻ, mà ở cách Google đang gom lưu trữ, mô hình và công cụ làm việc vào một gói dễ bán hơn.",
      summaryFallback: "Bài này gom những thay đổi đáng chú ý nhất trong gói Google AI Pro, Workspace và NotebookLM để nhìn rõ giá trị thật đang tăng ở đâu.",
      dekLead: "Người dùng cá nhân nhìn vào giá và dung lượng, còn doanh nghiệp sẽ nhìn sâu hơn vào Gemini tích hợp, quyền riêng tư dữ liệu và khả năng biến AI thành một phần mặc định của luồng việc.",
      dekClose: "Khi ba lớp đó cùng dịch chuyển, Google không còn bán một model riêng lẻ mà đang bán cả một hệ sinh thái AI dùng được hàng ngày.",
      dekFallback: "Đây là bài cho người đang cân nhắc giữa việc mua thêm từng dịch vụ AI riêng lẻ hay đi thẳng vào hệ sinh thái của Google.",
      hookLead: "Nếu trước đây Google mạnh ở chỗ có nhiều mảnh ghép, thì nhịp mới cho thấy hãng đang cố làm các mảnh đó dính vào nhau đủ chặt để thành một gói đáng trả tiền.",
      hookFallback: "Nhịp thay đổi mới của Google đáng đọc vì nó không chỉ nâng thông số, mà đang đổi luôn cảm giác dùng AI trong cả hệ sinh thái.",
      valueLead: "Giá trị tăng rõ nhất nằm ở việc người dùng không còn phải tách riêng lưu trữ, Gemini, NotebookLM và các lớp hỗ trợ sáng tạo thành quá nhiều hóa đơn nhỏ.",
      cautionLead: "Thứ nên soi kỹ là giới hạn vùng, model nào thực sự được mở khóa, và liệu các lời hứa về quyền riêng tư doanh nghiệp có đi xuyên suốt từ Docs, Gmail tới Meet hay không.",
      marketLead: "So với phần còn lại của thị trường, Google đang lợi ở lớp tích hợp sâu vào công cụ làm việc, nhưng cũng bị soi kỹ hơn ở chỗ mọi thay đổi phải chứng minh được giá trị thật chứ không chỉ đẹp trên slide.",
      marketFallback: "Google đang đứng ở điểm giao giữa lưu trữ, AI và năng suất làm việc, nên mọi nâng cấp của hãng đều chạm trực tiếp vào người dùng trả tiền hàng tháng.",
      takeLead: "Patrick Tech Media nhìn câu chuyện này như một bước chuyển từ bán AI theo cảm hứng sang bán AI theo bài toán công việc thật.",
      takeClose: "Nếu Google giữ được giá, tăng được dung lượng và làm NotebookLM hay Workspace bớt rời rạc, đây sẽ là một trong những gói dễ hút người dùng trả phí nhất năm."
    },
    openai: {
      title: "ChatGPT đang bán giá trị gì trong năm 2026: Plus, Pro, Team và lớp tiện ích mới có đáng tiền không",
      slug: "chatgpt-dang-ban-gia-tri-gi-trong-nam-2026",
      summaryLead: "OpenAI vẫn là cái tên kéo phần đông người dùng vào AI trả phí, nhưng điều thị trường đang soi không còn chỉ là model mới mà là tổng giá trị của cả gói ChatGPT.",
      summaryClose: "Khi Sora, Deep Research, Agent và những lớp cộng tác xuất hiện dày hơn, câu hỏi chuyển từ mạnh hay không sang đáng tiền đến đâu.",
      summaryFallback: "Bài này gom các thay đổi đáng chú ý nhất quanh các gói ChatGPT để nhìn rõ OpenAI đang bán giá trị nào ngoài model mạnh.",
      dekLead: "Người dùng trả phí bây giờ không chỉ mua một cửa sổ chat, mà mua tốc độ, giới hạn cao hơn, quyền chạm vào tool mới và khả năng gom nghiên cứu lẫn tạo nội dung vào cùng một chỗ.",
      dekClose: "Đó là lý do OpenAI phải được đọc như một nhà bán gói giá trị, không còn chỉ là hãng tung model gây sốc.",
      dekFallback: "Đây là bài cho người đang trả tiền hoặc cân nhắc trả tiền cho ChatGPT nhưng muốn biết khoản chi đó có đang sinh lợi rõ ràng hơn không.",
      hookLead: "ChatGPT vẫn dễ hút người dùng nhất, nhưng càng nhiều lớp quyền lợi mới xuất hiện thì càng cần đọc kỹ xem phần nào là giá trị thật, phần nào chỉ là lực hút thương hiệu.",
      hookFallback: "Điểm đáng mở ở OpenAI lúc này là cách hãng đang biến thói quen chat thành một gói làm việc đủ nặng để giữ chân người dùng trả phí.",
      valueLead: "Giá trị tăng mạnh nhất của ChatGPT nằm ở việc người dùng có thể làm nhiều việc hơn trong cùng một tab: hỏi đáp, nghiên cứu, viết, code, tạo media và cộng tác.",
      cautionLead: "Phần cần soi kỹ là giới hạn sử dụng thực tế, sự khác biệt giữa từng tier và việc những tính năng nghe rất mạnh có thật sự giải được việc thường ngày hay không.",
      marketLead: "OpenAI đang mạnh ở thói quen sử dụng và lực kéo sản phẩm, nhưng cũng bị so sánh trực diện hơn về giá trên từng tính năng khi Google, Anthropic và Microsoft đồng loạt dồn lực vào gói AI.",
      marketFallback: "OpenAI đang dẫn về mức độ hiện diện trong đời sống người dùng, nhưng áp lực giữ giá trị gói cũng lớn hơn bất kỳ đối thủ nào.",
      takeLead: "Patrick Tech Media cho rằng OpenAI đang thắng ở chỗ biến AI thành điểm bắt đầu mặc định cho rất nhiều tác vụ, chứ không chỉ ở benchmark.",
      takeClose: "Nhưng lợi thế này chỉ bền nếu mỗi đợt nâng gói thực sự giúp người dùng làm được nhiều việc hơn thay vì chỉ thêm một lớp hype mới."
    },
    anthropic: {
      title: "Claude đang leo lên phân khúc nào: giá trị của các gói Anthropic giờ nằm ở code, dự án hay độ tin cậy",
      slug: "claude-dang-leo-len-phan-khuc-nao",
      summaryLead: "Anthropic không ồn ào như nhiều đối thủ, nhưng các gói Claude đang được soi kỹ vì ảnh hưởng trực tiếp tới giới làm việc với code, tài liệu dài và những dự án cần độ ổn định.",
      summaryClose: "Điểm đáng đọc là Anthropic đang cố biến sự điềm tĩnh của sản phẩm thành một lý do trả phí thuyết phục hơn.",
      summaryFallback: "Bài này gom các thay đổi đáng chú ý quanh Claude để nhìn rõ Anthropic đang tăng giá trị cho người dùng trả tiền ở lớp nào.",
      dekLead: "Nếu OpenAI hút ở độ phổ biến và Google hút ở hệ sinh thái, Anthropic lại cố giữ chỗ đứng bằng chất lượng viết, xử lý ngữ cảnh dài và cảm giác đáng tin với người dùng chuyên môn hơn.",
      dekClose: "Câu hỏi cần trả lời là liệu các gói mới có biến lợi thế đó thành giá trị dễ cảm hơn trong công việc hàng ngày hay chưa.",
      dekFallback: "Đây là bài cho người đang dùng Claude để viết, đọc tài liệu dài hoặc code và muốn biết gói trả phí có thực sự đang dày lên.",
      hookLead: "Claude không cần thắng bằng tiếng ồn, nhưng muốn giữ người dùng trả phí thì Anthropic buộc phải chứng minh từng đợt cập nhật đang đem lại ích lợi rõ ràng hơn.",
      hookFallback: "Điểm đáng mở ở Claude lúc này là cách Anthropic đang biến một sản phẩm được khen là ổn định thành một gói có lý do để người dùng tiếp tục chi tiền.",
      valueLead: "Giá trị tăng ở Claude thường lộ ra trong các việc cần ngữ cảnh dài, giọng viết gọn, khả năng đọc tài liệu sạch và môi trường làm việc yên ổn cho nhóm làm nội dung hoặc code.",
      cautionLead: "Điều nên soi kỹ là giới hạn thực tế theo gói, độ khác biệt giữa bản miễn phí và bản trả phí, cùng tốc độ Anthropic mở rộng tính năng mới so với các hãng đang tung sản phẩm dồn dập hơn.",
      marketLead: "Anthropic đang chơi ở phần thị trường cần độ tin cậy và chất lượng phản hồi cao, nhưng áp lực là phải làm người dùng cảm được giá trị gói rõ hơn thay vì chỉ được khen bằng lời.",
      marketFallback: "Claude có thể không ồn nhất, nhưng lại thường được đặt vào các bài toán cần sự đều tay và an tâm hơn về đầu ra.",
      takeLead: "Patrick Tech Media nhìn Claude như một gói AI mạnh ở sự dùng được lâu, không quá rực rỡ nhưng dễ ăn vào quy trình công việc thật.",
      takeClose: "Nếu Anthropic tiếp tục mở rộng đúng hướng cho code và project context, đây sẽ là lựa chọn rất khó bỏ với nhóm người dùng chuyên sâu."
    },
    microsoft: {
      title: "Microsoft đang đẩy Copilot vào gói nào: từ cá nhân tới doanh nghiệp, giá trị mới nằm ở tích hợp hay quản trị",
      slug: "microsoft-dang-day-copilot-vao-goi-nao",
      summaryLead: "Microsoft đang làm điều rất khác so với phần còn lại: hãng không chỉ bán Copilot như một AI riêng lẻ mà tìm cách gài nó thẳng vào M365, Windows và hạ tầng doanh nghiệp.",
      summaryClose: "Vì vậy, mọi thay đổi trong gói Copilot cần được đọc như thay đổi của một bộ công cụ làm việc lớn, không phải một app đơn lẻ.",
      summaryFallback: "Bài này gom các thay đổi đáng chú ý nhất quanh Copilot để nhìn rõ Microsoft đang tăng giá trị ở lớp cá nhân hay doanh nghiệp.",
      dekLead: "Người dùng cá nhân sẽ để ý xem Copilot có đủ mạnh để thay thói quen cũ không, còn doanh nghiệp sẽ nhìn vào quản trị, dữ liệu, bảo mật và độ ăn khớp với Microsoft 365.",
      dekClose: "Đó là thế mạnh riêng của Microsoft nhưng cũng là áp lực lớn: càng tích hợp sâu, kỳ vọng giá trị thực càng cao.",
      dekFallback: "Đây là bài cho người đang cân nhắc Copilot trong hệ sinh thái Microsoft và muốn biết khoản chi có đang đổi lại nhiều hơn trước không.",
      hookLead: "Microsoft có lợi thế sân nhà trong môi trường doanh nghiệp, nhưng để gói Copilot thật sự hút, hãng phải chứng minh AI đang rút ngắn việc chứ không chỉ thêm một nút mới.",
      hookFallback: "Điểm đáng đọc ở Copilot lúc này là cách Microsoft biến AI thành lớp mặc định trong công cụ mà doanh nghiệp vốn đã trả tiền từ trước.",
      valueLead: "Giá trị tăng rõ nhất của Copilot nằm ở độ ăn vào Windows, Outlook, Word, Excel, Teams và những lớp quản trị quen thuộc của doanh nghiệp.",
      cautionLead: "Phần nên soi kỹ là chi phí trên từng ghế, quyền hạn theo gói, và việc tính năng AI có thật sự được mở rộng đủ sâu cho người dùng cuối hay chủ yếu mạnh ở phần trình diễn quản trị.",
      marketLead: "So với các đối thủ, Microsoft đang lợi ở độ bám vào môi trường công ty và dữ liệu công việc sẵn có, nhưng cũng bị đòi hỏi khắt khe hơn về hiệu quả trên từng đồng chi ra.",
      marketFallback: "Copilot đang đứng ở giao điểm giữa AI và bộ công cụ văn phòng, nên bất kỳ thay đổi nào cũng có thể chạm tới một lượng người dùng rất lớn.",
      takeLead: "Patrick Tech Media đánh giá Microsoft mạnh ở khả năng biến AI thành một lớp hạ tầng mặc định thay vì sản phẩm đứng riêng.",
      takeClose: "Nếu hãng tiếp tục làm tốt bài toán tích hợp sâu nhưng giữ được chi phí hợp lý, Copilot sẽ còn là một trong những gói khó tránh nhất của khối doanh nghiệp."
    },
    xai: {
      title: "xAI đang cố bán Grok theo kiểu nào: sức hút mới nằm ở tính năng, tốc độ hay hệ sinh thái",
      slug: "xai-dang-co-ban-grok-theo-kieu-nao",
      summaryLead: "xAI đang cố đẩy Grok thành một gói đáng trả tiền hơn thay vì chỉ là sản phẩm ăn theo độ nóng của mạng xã hội.",
      summaryClose: "Điểm cần soi là giá trị thực tế đang tăng ở đâu và có đủ bền để giữ người dùng hay không.",
      summaryFallback: "Bài này gom những thay đổi mới nhất quanh các gói Grok để nhìn rõ xAI đang bán giá trị nào.",
      dekLead: "Grok có lợi thế về tốc độ và nhịp cập nhật, nhưng muốn đi xa hơn thì gói trả phí phải chứng minh được chiều sâu sử dụng.",
      dekClose: "Chính vì vậy, thị trường đang nhìn vào việc xAI thêm quyền lợi gì chứ không chỉ nhìn vào độ ồn ào.",
      dekFallback: "Đây là bài cho người đang tò mò Grok có đang trở thành một gói đáng trả tiền hay chưa.",
      hookLead: "xAI có thể tạo nhiều sự chú ý rất nhanh, nhưng giá trị của gói AI chỉ lộ ra khi nó giải quyết được việc thật.",
      hookFallback: "Điểm đáng đọc ở Grok là xem sự mới mẻ có đang được đổi thành ích lợi bền hơn cho người dùng hay chưa.",
      valueLead: "Giá trị tăng, nếu có, phải đến từ tính năng dùng thường xuyên, tốc độ tốt và cảm giác đỡ phải bật thêm công cụ khác.",
      cautionLead: "Phần nên soi là độ ổn định, chiều sâu của gói và việc quyền lợi mới có mang tính lâu dài hay chỉ là hiệu ứng ngắn hạn.",
      marketLead: "xAI đang đứng ở phần thị trường nơi sự tò mò rất lớn, nhưng muốn ở lại thì gói trả phí phải bền hơn phần ồn ào ban đầu.",
      marketFallback: "Grok có thể hút nhanh, nhưng thị trường sẽ giữ lại hay không còn phụ thuộc vào giá trị dùng thật.",
      takeLead: "Patrick Tech Media xem Grok là một biến số thú vị, nhưng cần thêm thời gian để chứng minh độ bền của cả gói.",
      takeClose: "Nếu xAI biến được nhịp ra mắt nhanh thành lợi ích rõ ràng cho người dùng, cuộc đua gói AI sẽ còn chật hơn nữa."
    }
  };

  const en = {
    google: {
      title: "What Google just changed in AI plans: 5 TB, Workspace, and NotebookLM are now part of the same value fight",
      slug: "what-google-just-changed-in-ai-plans",
      summaryLead: "Google is shifting the AI plan battle onto more practical ground: larger storage, deeper Gemini inside Workspace, and a NotebookLM stack that feels closer to a real research assistant.",
      summaryClose: "The real story is not the 5 TB number by itself, but the way Google is bundling storage, models, and workflow tools into a more persuasive package.",
      summaryFallback: "This piece pulls together the latest changes across Google AI Pro, Workspace, and NotebookLM to show where the real value is growing.",
      dekLead: "Individual users will read the price and storage first, while business buyers will go straight to integrated Gemini, privacy promises, and how much AI now feels native inside everyday work.",
      dekClose: "Taken together, those layers show Google selling a usable AI ecosystem rather than a single model access tier.",
      dekFallback: "This is for readers comparing one-off AI subscriptions with a fuller Google ecosystem bet.",
      hookLead: "Google used to look like a collection of separate AI pieces. The current move is about making those pieces feel like one package people can justify paying for.",
      hookFallback: "The reason this update matters is that Google is changing the feel of paying for AI across the whole stack, not just changing one spec line.",
      valueLead: "The most visible gain is in reducing how many separate bills users need for storage, Gemini, NotebookLM, and creative tooling.",
      cautionLead: "The part worth checking closely is regional availability, which model tiers are truly unlocked, and whether privacy promises stay consistent from Docs and Gmail through Meet.",
      marketLead: "Google is strongest where AI meets storage and productivity, but that also means every change is tested against real daily usefulness, not launch-page energy.",
      marketFallback: "Google now sits at the intersection of storage, AI, and productivity, so every package change lands directly on paying users.",
      takeLead: "Patrick Tech Media sees this as a shift from selling AI as a feature line to selling it as a workflow system.",
      takeClose: "If Google can hold price discipline while making Workspace and NotebookLM feel more coherent, this will be one of the easiest premium AI bundles to justify this year."
    },
    openai: {
      title: "What ChatGPT is really selling in 2026: do Plus, Pro, Team, and the newer utility layers justify the spend",
      slug: "what-chatgpt-is-really-selling-in-2026",
      summaryLead: "OpenAI still pulls the largest mainstream audience into paid AI, but the market is no longer only measuring model launches. It is measuring the value density of the whole ChatGPT package.",
      summaryClose: "As Sora, Deep Research, agent layers, and collaboration features expand, the question becomes less about raw strength and more about what the subscription meaningfully unlocks.",
      summaryFallback: "This piece gathers the latest changes around ChatGPT plans to show what OpenAI is selling beyond model prestige.",
      dekLead: "Paid users are no longer buying only a chat box. They are buying speed, higher limits, earlier access to new tools, and a tighter place for research, writing, coding, and media generation.",
      dekClose: "That is why OpenAI now has to be read as a subscription-value company, not just a model-launch machine.",
      dekFallback: "This is for readers already paying for ChatGPT, or close to it, who want a clearer picture of what the spend now buys.",
      hookLead: "ChatGPT still has the easiest pull, but the more bundle layers OpenAI adds, the more readers need to separate durable value from brand gravity.",
      hookFallback: "The real story in OpenAI's current move is how it keeps turning a chat habit into a heavier paid workflow.",
      valueLead: "ChatGPT gains value when it lets users research, write, code, organize, and create without jumping across too many tabs or separate products.",
      cautionLead: "The critical check is usage limits, the practical differences between tiers, and whether the headline features solve everyday work or mostly sell the idea of future value.",
      marketLead: "OpenAI remains strongest in user habit and product pull, but that also makes it easier to compare its pricing feature by feature against Google, Anthropic, and Microsoft.",
      marketFallback: "OpenAI still has the broadest default footprint in day-to-day AI use, which makes each plan change more visible than most rivals.",
      takeLead: "Patrick Tech Media thinks OpenAI is strongest when it turns AI into a default starting point for many tasks, not only when it wins a benchmark cycle.",
      takeClose: "That edge stays meaningful only if each plan update increases real usefulness instead of stacking more hype on top of an already sticky product."
    },
    anthropic: {
      title: "Where Claude is moving upmarket: does Anthropic now win on code, project depth, or day-to-day trust",
      slug: "where-claude-is-moving-upmarket",
      summaryLead: "Anthropic is quieter than most of the field, but Claude plans now matter more because they touch coding, long-context reading, and project work where stability counts.",
      summaryClose: "The interesting part is how Anthropic is trying to turn that calmer product reputation into a stronger paid-plan argument.",
      summaryFallback: "This piece gathers the latest Claude plan shifts to show where Anthropic is increasing paid value.",
      dekLead: "If OpenAI wins on ubiquity and Google wins on ecosystem gravity, Anthropic is trying to hold space through writing quality, long-context work, and a more trustworthy feel for specialist users.",
      dekClose: "The market question is whether those strengths now feel concrete enough in the paid tiers.",
      dekFallback: "This is for readers using Claude for writing, long documents, or code and trying to judge whether the paid layers are actually becoming denser.",
      hookLead: "Claude does not need to win by noise, but Anthropic still has to show that each paid update adds value people can feel without reading a benchmark thread first.",
      hookFallback: "The reason to open Claude coverage now is to see how Anthropic is turning a respected product into a more persuasive subscription.",
      valueLead: "Claude tends to show its value in long-context reading, cleaner writing tone, coding support, and calmer project work rather than flashier feature spikes.",
      cautionLead: "The part worth checking is the real gap between free and paid tiers, plus how fast Anthropic expands new capabilities compared with louder rivals.",
      marketLead: "Anthropic is strongest in the slice of the market that values steadiness and output quality, but that also means the company must make paid value easier to feel, not just easier to praise.",
      marketFallback: "Claude may be quieter, but it keeps getting pulled into workflows where consistent output matters more than launch drama.",
      takeLead: "Patrick Tech Media reads Claude as a plan built for long-term use rather than short-term spectacle.",
      takeClose: "If Anthropic keeps expanding the right layers for coding and project context, Claude will stay hard to replace for serious users."
    },
    microsoft: {
      title: "What Microsoft is really doing with Copilot plans: is the new value in integration, management, or both",
      slug: "what-microsoft-is-really-doing-with-copilot-plans",
      summaryLead: "Microsoft is playing a different game from most rivals. It is not only selling Copilot as a standalone AI product, but embedding it across Microsoft 365, Windows, and enterprise workflows.",
      summaryClose: "That means every Copilot plan change has to be read as a change to a working stack, not just to a separate AI app.",
      summaryFallback: "This piece brings together the latest Copilot plan changes to show where Microsoft is increasing value for individual and business buyers.",
      dekLead: "Consumers will look at whether Copilot is useful enough to replace older habits, while business teams will focus on management, security, data handling, and how deeply AI is woven into Microsoft 365.",
      dekClose: "That is Microsoft's clearest advantage, but it also raises the bar on proving real value.",
      dekFallback: "This is for readers considering Copilot inside the Microsoft stack and trying to see whether the spend is now easier to justify.",
      hookLead: "Microsoft has home-field advantage in enterprise software, but for Copilot plans to feel compelling the company still has to prove that AI is saving work instead of adding another interface layer.",
      hookFallback: "The reason to watch Copilot now is how Microsoft keeps turning AI into a default layer inside tools people already pay for.",
      valueLead: "The strongest Copilot value usually appears in how well it plugs into Windows, Outlook, Word, Excel, Teams, and the management layer businesses already trust.",
      cautionLead: "The part worth checking is seat-based pricing, which capabilities land in which tier, and whether the user-facing AI experience is deep enough to match the strength of the admin story.",
      marketLead: "Compared with rivals, Microsoft is strongest where AI meets enterprise habits and existing work data, but that also makes every dollar spent easier to scrutinize.",
      marketFallback: "Copilot sits at the intersection of AI and office software, so even small plan changes can touch a very large paying audience.",
      takeLead: "Patrick Tech Media sees Microsoft at its best when AI becomes infrastructure rather than a separate product tab.",
      takeClose: "If the company keeps deepening integration without overloading the price, Copilot will remain one of the hardest enterprise AI bundles to avoid."
    },
    xai: {
      title: "How xAI is trying to sell Grok as a package: is the draw now speed, features, or ecosystem reach",
      slug: "how-xai-is-trying-to-sell-grok-as-a-package",
      summaryLead: "xAI is trying to make Grok look like a stronger paid package instead of a product that only rides social velocity and novelty.",
      summaryClose: "The real question is where the practical value is thickening and whether it is durable enough to hold paying users.",
      summaryFallback: "This piece gathers the latest Grok package shifts to show what xAI is really trying to sell.",
      dekLead: "Grok has energy and speed on its side, but a paid plan only becomes sticky when the day-to-day value deepens.",
      dekClose: "That is why the market is watching the package, not just the noise around it.",
      dekFallback: "This is for readers wondering whether Grok is becoming a paid AI plan with lasting value.",
      hookLead: "xAI can generate attention quickly, but AI package value only becomes real when it consistently removes work.",
      hookFallback: "The reason to watch Grok now is to see whether novelty is turning into lasting usefulness.",
      valueLead: "If Grok is becoming more valuable, the change has to show up in repeated use, fast output, and fewer reasons to open extra tools.",
      cautionLead: "The part worth checking is plan stability, feature depth, and whether the package gains feel durable rather than promotional.",
      marketLead: "xAI is operating where curiosity is high, but long-term retention will still depend on whether the package is more than a loud first impression.",
      marketFallback: "Grok can attract attention fast, but the market will decide its staying power through paid usefulness.",
      takeLead: "Patrick Tech Media sees Grok as an interesting variable, but one that still needs more proof at the package level.",
      takeClose: "If xAI turns launch speed into steady user value, the AI plan race gets tighter for everyone else."
    }
  };

  const languageMap = language === "vi" ? vi : en;
  const meta = languageMap[providerKey] || languageMap.google;

  return {
    label,
    ...meta
  };
}

function buildCompanionArticleShell({
  id,
  clusterId,
  slug,
  title,
  summary,
  dek,
  hook,
  language,
  topic,
  contentType,
  verificationState,
  sources,
  sections,
  image,
  now,
  publishedAt,
  authorId,
  relatedStoreItems,
  editorialFocus
}) {
  return {
    id,
    cluster_id: clusterId,
    language,
    topic,
    content_type: contentType,
    slug,
    title,
    summary,
    dek,
    hook,
    sections,
    verification_state: verificationState,
    quality_score: Math.min(98, 90 + Math.min(6, sources.length)),
    ad_eligible: verificationState !== "trend",
    show_editorial_label: false,
    indexable: true,
    editorial_focus: editorialFocus,
    store_link_mode: contentType === "ComparisonPage" || contentType === "EvergreenGuide" ? "full" : resolveStoreLinkMode(topic, contentType),
    related_store_items: relatedStoreItems,
    source_set: sources,
    author_id: authorId,
    published_at: publishedAt,
    updated_at: now || publishedAt,
    image
  };
}

function detectAiPlanProviders(members) {
  return detectAiProviderKeysFromMembers(members).map((providerKey) => AI_PROVIDER_LABELS[providerKey]);
}

function formatProviderList(providers, language) {
  const items = [...providers].slice(0, 4);

  if (!items.length) {
    return language === "vi" ? "các hãng AI lớn" : "major AI vendors";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} ${language === "vi" ? "và" : "and"} ${items[1]}`;
  }

  const tail = items.pop();
  return `${items.join(", ")} ${language === "vi" ? "và" : "and"} ${tail}`;
}

function computeTokenSimilarity(leftTokens, rightTokens) {
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const shared = [...leftSet].filter((token) => rightSet.has(token));
  const union = new Set([...leftSet, ...rightSet]);
  const sharedLong = shared.filter((token) => token.length >= 6).length;
  const minSize = Math.max(1, Math.min(leftSet.size || 1, rightSet.size || 1));

  return {
    exact: normalizeCompact(leftTokens.join(" ")) === normalizeCompact(rightTokens.join(" ")),
    shared: shared.length,
    sharedLong,
    overlap: shared.length / minSize,
    jaccard: shared.length / Math.max(1, union.size)
  };
}

function buildClusterTitle({ lead, language, contentType }) {
  const sourceTitle = cleanText(lead?.draft_context?.source_title || lead?.title || "");
  const normalized = trimTitle(sourceTitle);

  if (normalized.length >= 36) {
    return normalized;
  }

  if (contentType === "EvergreenGuide") {
    return language === "vi" ? "Hướng dẫn công nghệ đáng lưu lại" : "A practical technology guide worth saving";
  }

  return language === "vi" ? "Tin công nghệ đáng theo dõi ngay lúc này" : "A technology story worth following right now";
}

function buildClusterSummary({ members, lead, sources, pool, language, topic, contentType, verificationState, lens }) {
  if (lens === "ai-package") {
    return buildAiPackageClusterSummary({ lead, sources, pool, language, verificationState });
  }

  const opening = firstUsefulSentence([
    lead.summary,
    lead.dek,
    lead.hook,
    lead.sections?.[0]?.body,
    lead.draft_context?.paragraphs?.[0]
  ]);
  const corroboration = buildCorroborationSentence(sources, language, verificationState);
  const impact = buildImpactSentence(topic, language, contentType);
  const extra = firstUnusedSentences(pool, [opening], 2);

  return composeParagraph(
    [
      opening,
      ...extra,
      corroboration,
      impact
    ],
    buildFallbackSummary({ language, topic, contentType, sources: sources.length, members: members.length }),
    180
  );
}

function buildClusterDek({ lead, sources, pool, language, topic, contentType, verificationState, lens }) {
  if (lens === "ai-package") {
    return buildAiPackageClusterDek({ lead, sources, pool, language, verificationState });
  }

  const opening = firstUsefulSentence([
    lead.dek,
    lead.summary,
    lead.sections?.[0]?.body
  ]);
  const angle = buildAssessmentSentence({ language, topic, contentType, verificationState, sourceCount: sources.length });
  const extra = firstUnusedSentences(pool, [opening], 1);

  return composeParagraph(
    [opening, ...extra, angle],
    buildFallbackDek({ language, topic, contentType }),
    120
  );
}

function buildClusterHook({ lead, sources, pool, language, topic, contentType, verificationState, lens }) {
  if (lens === "ai-package") {
    return buildAiPackageClusterHook({ lead, sources, pool, language, verificationState });
  }

  const opening = firstUsefulSentence([
    lead.hook,
    lead.summary,
    lead.sections?.[1]?.body,
    lead.draft_context?.paragraphs?.[1]
  ]);
  const angle = buildHookAngle({ language, topic, contentType, verificationState, sourceCount: sources.length });
  const detail = firstUnusedSentences(pool, [opening], 1);

  return composeParagraph(
    [opening, ...detail, angle],
    buildFallbackHook({ language, topic, contentType }),
    140
  );
}

function buildClusterSections({ members, lead, sources, pool, language, topic, contentType, verificationState, lens }) {
  if (contentType === "EvergreenGuide") {
    return buildGuideSections({ lead, sources, pool, language, topic, verificationState });
  }

  if (contentType === "ComparisonPage") {
    return buildComparisonSections({ lead, sources, pool, language, topic, verificationState });
  }

  if (lens === "ai-package") {
    return buildAiPackageClusterSections({ lead, sources, pool, language, verificationState });
  }

  return buildNewsSections({ members, lead, sources, pool, language, topic, verificationState });
}

function buildAiPackageClusterSummary({ lead, sources, pool, language, verificationState }) {
  const providers = formatProviderList(detectAiPlanProviders([lead]), language);
  return composeParagraph(
    [
      firstUsefulSentence([lead.summary, lead.dek, lead.hook]),
      language === "vi"
        ? `${providers} đang kéo cuộc đua gói AI sang phần dùng thật: giá, dung lượng, model mạnh hơn và quyền lợi tích hợp vào công việc hằng ngày.`
        : `${providers} are pulling the AI plan race into practical use: price, storage, stronger models, and bundle rights that land in everyday work.`,
      buildCorroborationSentence(sources, language, verificationState),
      firstUnusedSentences(pool, [lead.summary], 1)[0]
    ],
    language === "vi"
      ? "Đây không còn là câu chuyện thêm một dòng quyền lợi vào bảng giá, mà là cuộc đua xem hãng nào đang tăng giá trị thật cho người dùng trả tiền."
      : "This is no longer just a pricing-table footnote, but a race to see which vendor is increasing real value for paying users.",
    190
  );
}

function buildAiPackageClusterDek({ lead, sources, pool, language, verificationState }) {
  return composeParagraph(
    [
      firstUsefulSentence([lead.dek, lead.summary, lead.sections?.[1]?.body]),
      language === "vi"
        ? "Điểm nên nhìn tiếp không chỉ là con số giá hay dung lượng, mà là model nào được mở, công cụ nào được gói kèm, dữ liệu được bảo vệ đến đâu và liệu gói đó có thực sự bớt cho người dùng vài bước mua thêm dịch vụ lẻ."
        : "The useful read is not just the monthly price or storage number, but which model tier gets unlocked, which tools are bundled, how the data is protected, and whether the plan actually removes the need for extra side subscriptions.",
      buildNuanceSentence({ language, topic: "ai", verificationState, sourceCount: sources.length }),
      firstUnusedSentences(pool, [lead.summary, lead.dek], 1)[0]
    ],
    language === "vi"
      ? "Kiểu bài này đáng đọc khi bạn đang trả tiền cho AI, lưu trữ hoặc Workspace và muốn biết khoản chi đó đang đổi lại được gì rõ ràng hơn."
      : "This kind of piece matters when you are already paying for AI, storage, or a workspace stack and want a clearer answer on what that spend now buys.",
    160
  );
}

function buildAiPackageClusterHook({ lead, sources, pool, language, verificationState }) {
  return composeParagraph(
    [
      language === "vi"
        ? "Cuộc đua gói AI đang rời khỏi phần trình diễn để bước vào phần dùng thật. Khi một hãng tăng dung lượng, mở thêm model, nhét nghiên cứu hay tạo nội dung vào cùng một gói mà không đội giá quá mạnh, người đọc có lý do để xem lại toàn bộ quyết định trả tiền của mình."
        : "The AI subscription race is moving out of demo mode and into practical use. When a vendor adds more storage, unlocks stronger models, or folds research and creation into the same plan without blowing up the price, readers have a reason to rethink what they are paying for.",
      buildHookAngle({ language, topic: "ai", contentType: "NewsArticle", verificationState, sourceCount: sources.length }),
      firstUnusedSentences(pool, [lead.summary, lead.dek], 1)[0]
    ],
    firstUsefulSentence([lead.hook, lead.summary]),
    180
  );
}

function buildAiPackageClusterSections({ lead, sources, pool, language, verificationState }) {
  const headings = language === "vi"
    ? [
        "Điểm nâng cấp đáng chú ý",
        "Giá và quyền lợi nên nhìn vào đâu",
        "Lớp AI nào đang kéo giá trị lên",
        "Ai nên để mắt",
        "Patrick Tech Media đánh giá"
      ]
    : [
        "The upgrade worth noting",
        "Where to look at price and bundle value",
        "Which AI layers are lifting the plan",
        "Who should pay attention",
        "Patrick Tech Media take"
      ];

  return [
    {
      heading: headings[0],
      body: composeParagraph(
        [
          lead.summary,
          lead.sections?.[0]?.body,
          buildCorroborationSentence(sources, language, verificationState)
        ],
        lead.summary,
        170
      )
    },
    {
      heading: headings[1],
      body: composeParagraph(
        [
          lead.dek,
          language === "vi"
            ? "Ở gói AI, phần quan trọng không nằm ở việc tăng thêm bao nhiêu TB trên giấy, mà là giá có giữ được không, model nào được dùng thật, giới hạn vùng có còn chặt không và quyền riêng tư dữ liệu được cam kết tới đâu."
            : "On AI plans, the critical read is not just the extra terabytes on paper, but whether pricing stays stable, which model tier is actually unlocked, how tight the regional limits remain, and how clearly data privacy is promised."
        ],
        buildSourceTrailSentence(sources, language),
        170
      )
    },
    {
      heading: headings[2],
      body: composeParagraph(
        [
          firstUnusedSentences(pool, [lead.summary, lead.dek], 2),
          language === "vi"
            ? "Điều làm câu chuyện này đáng đọc là lớp AI đi kèm đang chạm vào công cụ dùng thật như email, tài liệu, nghiên cứu, tạo hình ảnh, video hoặc ghi chú, thay vì chỉ dừng ở một demo riêng lẻ."
            : "What makes this worth opening is that the bundled AI touches real tools like mail, docs, research, image generation, video, or note-taking instead of sitting as a standalone demo."
        ],
        buildImpactSentence("ai", language, "NewsArticle"),
        170
      )
    },
    {
      heading: headings[3],
      body: composeParagraph(
        [
          language === "vi"
            ? "Người nên theo dõi kỹ nhất là nhóm đang cùng lúc trả tiền cho lưu trữ, tài liệu, họp, sáng tạo nội dung và AI. Nếu một gói gom được nhiều lớp đó vào cùng một hóa đơn, giá trị thực sẽ lộ ra rất nhanh. Còn người chỉ dùng AI để hỏi đáp lẻ, bản miễn phí hoặc gói thấp hơn có thể vẫn đủ."
            : "The readers who should watch most closely are the ones already paying for storage, docs, meetings, content creation, and AI at the same time. If one plan truly bundles those layers, the value will surface quickly. Readers using AI only for occasional prompts may still be fine on lighter or free tiers."
        ],
        buildAssessmentSentence({ language, topic: "ai", contentType: "NewsArticle", verificationState, sourceCount: sources.length }),
        170
      )
    },
    {
      heading: headings[4],
      body: composeParagraph(
        [
          language === "vi"
            ? "Patrick Tech Media nhìn các thay đổi kiểu này như một cuộc đua giá trị dùng thật. Gói nào giúp người dùng bớt phải mua thêm dịch vụ rời, bớt nhảy giữa nhiều công cụ và giữ được chất lượng AI ổn định sẽ là gói có lợi thế lâu hơn nhiều so với phần truyền thông ban đầu."
            : "Patrick Tech Media reads moves like this as a race for practical value. The plan that removes the need for extra side services, reduces switching between tools, and keeps AI quality stable will hold an advantage longer than the launch buzz.",
          buildCoverageSentence({ language, members: 1, sources: sources.length })
        ],
        buildForwardLook("ai", lead.title, language),
        180
      )
    }
  ];
}

function buildNewsSections({ members, lead, sources, pool, language, topic, verificationState }) {
  const headings = language === "vi"
    ? [
        "Điều đang xảy ra",
        "Các nguồn đang khớp nhau ở đâu",
        "Chi tiết đáng giữ lại",
        "Điểm đáng chú ý nhất",
        "Điều cần theo dõi tiếp"
      ]
    : [
        "What is happening now",
        "Where the sources line up",
        "The details worth keeping",
        "Why this matters most",
        "What to watch next"
      ];

  const sourceTrail = buildSourceTrailSentence(sources, language);
  const consensus = buildCorroborationSentence(sources, language, verificationState);
  const impact = buildImpactSentence(topic, language, "NewsArticle");
  const assessment = buildAssessmentSentence({
    language,
    topic,
    contentType: "NewsArticle",
    verificationState,
    sourceCount: sources.length
  });
  const watch = buildWatchSentence({ lead, language, topic, sources });
  const nuance = buildNuanceSentence({ language, topic, verificationState, sourceCount: sources.length });
  const opening = firstUsefulSentence([
    lead.summary,
    lead.dek,
    lead.hook,
    lead.sections?.[0]?.body,
    lead.draft_context?.paragraphs?.[0]
  ]);
  const detailOne = firstUnusedSentences(pool, [opening, lead.summary, lead.dek, lead.hook], 1)[0];
  const detailTwo = firstUnusedSentences(pool, [opening, detailOne, lead.summary, lead.dek], 1)[0];
  const detailThree = firstUnusedSentences(pool, [opening, detailOne, detailTwo, lead.summary, lead.dek], 1)[0];

  return [
    {
      heading: headings[0],
      body: composeParagraph(
        [
          opening,
          sourceTrail
        ],
        sourceTrail,
        150
      )
    },
    {
      heading: headings[1],
      body: composeParagraph(
        [
          consensus,
          detailOne,
          buildSourceTrailSentence(sources, language)
        ],
        consensus,
        150
      )
    },
    {
      heading: headings[2],
      body: composeParagraph(
        [
          detailTwo,
          impact
        ],
        impact,
        150
      )
    },
    {
      heading: headings[3],
      body: composeParagraph(
        [
          assessment,
          nuance,
          detailThree
        ],
        assessment,
        150
      )
    },
    {
      heading: headings[4],
      body: composeParagraph(
        [
          watch,
          buildForwardLook(topic, lead.title, language),
          buildCoverageSentence({ language, members: members.length, sources: sources.length })
        ],
        watch,
        150
      )
    }
  ];
}

function buildGuideSections({ lead, sources, pool, language, topic, verificationState }) {
  const headings = language === "vi"
    ? [
        "Bắt đầu từ đâu",
        "Làm theo cách gọn nhất",
        "Những lỗi dễ vấp",
        "Khi nào nên áp dụng",
        "Điểm nên chốt lại"
      ]
    : [
        "Where to start",
        "The shortest useful path",
        "Mistakes to avoid",
        "When it makes sense",
        "What to keep in mind"
      ];

  const setup = buildGuideSetupSentence(topic, language);
  const mistakes = buildGuideMistakeSentence(topic, language);
  const fit = buildGuideFitSentence(topic, language);
  const assessment = buildAssessmentSentence({
    language,
    topic,
    contentType: "EvergreenGuide",
    verificationState,
    sourceCount: sources.length
  });

  return [
    {
      heading: headings[0],
      body: composeParagraph(
        [
          lead.summary,
          lead.sections?.[0]?.body,
          setup
        ],
        setup,
        150
      )
    },
    {
      heading: headings[1],
      body: composeParagraph(
        [
          lead.sections?.[1]?.body,
          lead.draft_context?.paragraphs?.[1],
          buildCorroborationSentence(sources, language, verificationState)
        ],
        buildCorroborationSentence(sources, language, verificationState),
        150
      )
    },
    {
      heading: headings[2],
      body: composeParagraph(
        [
          mistakes,
          firstUnusedSentences(pool, [lead.summary], 1)[0],
          lead.sections?.[2]?.body
        ],
        mistakes,
        150
      )
    },
    {
      heading: headings[3],
      body: composeParagraph(
        [
          fit,
          buildImpactSentence(topic, language, "EvergreenGuide"),
          buildSourceTrailSentence(sources, language)
        ],
        fit,
        150
      )
    },
    {
      heading: headings[4],
      body: composeParagraph(
        [
          assessment,
          buildNuanceSentence({ language, topic, verificationState, sourceCount: sources.length }),
          buildForwardLook(topic, lead.title, language)
        ],
        assessment,
        150
      )
    }
  ];
}

function buildComparisonSections({ lead, sources, pool, language, topic, verificationState }) {
  const headings = language === "vi"
    ? [
        "Bàn cân đang đặt ở đâu",
        "Điểm các nguồn khớp nhau",
        "Khác biệt nằm ở phần nào",
        "Điểm nên nhìn kỹ",
        "Ai nên theo dõi tiếp"
      ]
    : [
        "What is actually on the table",
        "Where the sources agree",
        "Where the gap really shows",
        "What deserves a closer look",
        "Who should keep watching"
      ];

  const comparisonAngle = language === "vi"
    ? "Giá trị của kiểu bài này nằm ở việc kéo các lựa chọn về cùng một mặt bàn trước khi kết luận."
    : "The value in a comparison like this is that every option is pulled onto the same table before any conclusion is made.";
  const readerFit = language === "vi"
    ? "Người đọc nên nhìn kỹ phần khác biệt chạm vào chi phí, độ ổn định, và mức hữu ích hằng ngày thay vì chỉ nhìn thông số."
    : "Readers should focus on cost, stability, and daily usefulness instead of stopping at the spec sheet.";

  return [
    {
      heading: headings[0],
      body: composeParagraph(
        [
          lead.summary,
          comparisonAngle,
          lead.sections?.[0]?.body
        ],
        comparisonAngle,
        150
      )
    },
    {
      heading: headings[1],
      body: composeParagraph(
        [
          buildCorroborationSentence(sources, language, verificationState),
          lead.draft_context?.paragraphs?.[1],
          firstUnusedSentences(pool, [lead.summary], 1)[0]
        ],
        buildCorroborationSentence(sources, language, verificationState),
        150
      )
    },
    {
      heading: headings[2],
      body: composeParagraph(
        [
          lead.sections?.[1]?.body,
          readerFit,
          buildImpactSentence(topic, language, "ComparisonPage")
        ],
        readerFit,
        150
      )
    },
    {
      heading: headings[3],
      body: composeParagraph(
        [
          buildAssessmentSentence({
            language,
            topic,
            contentType: "ComparisonPage",
            verificationState,
            sourceCount: sources.length
          }),
          buildNuanceSentence({ language, topic, verificationState, sourceCount: sources.length })
        ],
        comparisonAngle,
        150
      )
    },
    {
      heading: headings[4],
      body: composeParagraph(
        [
          buildForwardLook(topic, lead.title, language),
          buildCoverageSentence({ language, members: 1, sources: sources.length })
        ],
        readerFit,
        150
      )
    }
  ];
}

function buildCorroborationSentence(sources, language, verificationState) {
  const names = formatSourceNames(sources, language, 3);

  if (sources.length >= 2) {
    return language === "vi"
      ? `${names} đang khớp nhau ở phần cốt lõi, nên câu chuyện này có nền chắc hơn một headline đơn lẻ.`
      : `${names} align on the core of the story, giving it firmer ground than a single headline on its own.`;
  }

  if (verificationState === "verified") {
    return language === "vi"
      ? `${names} hiện đủ mạnh để xem đây là một chuyển động đã được xác nhận, nhưng phần đáng đọc vẫn nằm ở bối cảnh và tác động thực tế của nó.`
      : `${names} is strong enough to treat the story as verified, but the useful part still lies in the context and practical impact.`;
  }

  return language === "vi"
    ? `${names} hiện là lớp nguồn chính của câu chuyện, và phần còn lại cần được đọc như một tín hiệu đang tiếp tục mở rộng.`
    : `${names} is the main source layer for now, and the rest should be read as a signal that is still widening.`;
}

function buildImpactSentence(topic, language, contentType) {
  const topicKey = normalizeTopic(topic);
  const map = {
    ai: {
      vi: "Điểm quan trọng là câu chuyện này chạm vào nhịp AI đang đi từ phần trình diễn sang phần dùng thật, nơi tốc độ, chi phí và độ tin cậy bắt đầu quyết định ai thắng.",
      en: "The important angle is that this touches the shift from AI as a demo to AI as real work, where speed, cost, and reliability start deciding who wins."
    },
    "apps-software": {
      vi: "Những thay đổi kiểu này thường nhìn nhỏ trên màn hình nhưng lại đổi khá nhanh thói quen dùng ứng dụng và cách đội vận hành xử lý công việc mỗi ngày.",
      en: "Changes like this often look small on screen while shifting product habits and day-to-day operating workflows much faster than expected."
    },
    devices: {
      vi: "Ở mảng thiết bị, phần đáng đọc luôn nằm ở chỗ một thay đổi kỹ thuật có thực sự chạm vào cảm giác dùng máy, tuổi thọ, hay chi phí nâng cấp hay không.",
      en: "On the device side, the useful angle is whether a technical change actually alters feel, lifespan, or upgrade cost in real use."
    },
    security: {
      vi: "Với bảo mật, điều đáng giữ lại không chỉ là cảnh báo, mà là cách nó đổi rủi ro vận hành, an toàn tài khoản và chi phí xử lý sự cố về sau.",
      en: "In security, the real value is not just the warning itself but the way it changes operational risk, account safety, and the cost of responding later."
    },
    gaming: {
      vi: "Ở mảng game, một tín hiệu tưởng nhỏ vẫn đáng đọc nếu nó cho thấy cộng đồng đang đẩy sự chú ý về phần nào của sản phẩm nhanh hơn nhà phát hành.",
      en: "In gaming, even a smaller signal matters when it reveals where the community is focusing faster than the publisher can frame it."
    },
    "internet-business-tech": {
      vi: "Phần đáng đọc là tác động xuống hành vi người dùng, luồng doanh thu hoặc cách các nền tảng số giành lại thời gian chú ý trên màn hình.",
      en: "The useful angle sits in the effect on user behavior, revenue flow, or how platforms compete for attention on screen."
    }
  };

  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? "Giá trị của một bài hướng dẫn không nằm ở việc kể đủ bước, mà ở chỗ giúp người đọc làm nhanh hơn, ít lỗi hơn và hiểu lúc nào nên áp dụng."
      : "The value of a guide is not just listing steps but helping readers move faster, make fewer mistakes, and know when it is worth applying.";
  }

  if (contentType === "ComparisonPage") {
    return language === "vi"
      ? "Điều đáng đọc nhất trong bài so sánh là chỗ mọi lựa chọn được kéo về cùng một bàn cân trước khi kết luận được đưa ra."
      : "The most useful part of a comparison is that every option gets pulled onto the same table before any conclusion is made.";
  }

  return map[topicKey]?.[language] || map.ai[language];
}

function buildAssessmentSentence({ language, topic, contentType, verificationState, sourceCount }) {
  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? `Điểm mạnh của bài kiểu này là biến phần kiến thức khô thành thứ dùng được ngay, và hiện có ${sourceCount} lớp nguồn để giữ phần chi tiết không bị lỏng.`
      : `The strength of this kind of piece is turning dry information into something readers can use immediately, with ${sourceCount} source layers keeping the details grounded.`;
  }

  if (contentType === "ComparisonPage") {
    return language === "vi"
      ? "Phần đáng tin của một bài so sánh không nằm ở kết luận thật nhanh, mà ở việc đặt cùng một câu hỏi lên nhiều lựa chọn rồi mới chốt."
      : "The trustworthy part of a comparison is not a fast verdict, but the discipline of asking the same question across multiple options first.";
  }

  const stateMap = {
    verified: {
      vi: "Bài này đã đủ lực để xem như một chuyển động đã chốt ở phần lõi, nên câu hỏi tốt hơn là nó sẽ đi xa tới đâu và ai bị chạm trước.",
      en: "This story is solid enough to treat the core shift as confirmed, so the better question is how far it travels and who feels it first."
    },
    emerging: {
      vi: "Tín hiệu hiện đủ đậm để không nên lướt qua, nhưng vẫn cần đọc nó với tâm thế theo dõi thêm thay vì đóng khung quá sớm.",
      en: "The signal is strong enough to deserve attention, but it still needs to be read as something developing rather than fully settled."
    },
    trend: {
      vi: "Bài này nên được xem như một tín hiệu sớm: đáng mở, đáng giữ trong tầm mắt, nhưng chưa phải nơi để chốt hạ quá tay.",
      en: "This should be read as an early signal: worth opening and worth watching, but not something to overstate yet."
    }
  };

  return stateMap[verificationState]?.[language] || buildImpactSentence(topic, language, contentType);
}

function buildHookAngle({ language, topic, contentType, verificationState, sourceCount }) {
  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? "Điều khiến kiểu bài này đáng lưu lại là nó có thể được dùng ngay sau khi đọc xong, thay vì chỉ làm đẹp thêm một headline."
      : "What makes this worth saving is that readers can use it right after finishing the piece instead of filing it away as another clever headline.";
  }

  if (contentType === "ComparisonPage") {
    return language === "vi"
      ? "Phần hay nhất nằm ở chỗ mọi lựa chọn được kéo về cùng một mặt bàn, nên khác biệt thật sự sẽ lộ ra rõ hơn."
      : "The useful part is that every option is brought onto the same table, which makes the real differences easier to see.";
  }

  return language === "vi"
    ? `Bài này đứng trên ${sourceCount} lớp nguồn, nhưng phần đáng đọc nằm ở việc nó chỉ ra vì sao câu chuyện này không nên bị lướt qua quá nhanh.`
    : `This piece sits on ${sourceCount} source layers, but the real value is showing why the story should not be skimmed past too quickly.`;
}

function buildNuanceSentence({ language, topic, verificationState, sourceCount }) {
  if (verificationState === "verified") {
    return language === "vi"
      ? "Ngay cả khi phần lõi đã rõ, thứ đáng đọc tiếp vẫn là tốc độ rollout, tác động thật và chi phí chuyển đổi cho người dùng hoặc đội vận hành."
      : "Even when the core is settled, the next useful read is still the rollout speed, the real impact, and the switching cost for users or teams.";
  }

  if (verificationState === "trend") {
    return language === "vi"
      ? "Nguồn lúc này còn mỏng, nên phần đáng giá nhất là bóc được chi tiết nào thật sự đáng để mắt thay vì đẩy tín hiệu đi quá tay."
      : "The source layer is still light here, so the useful move is isolating the detail worth watching instead of overstating the signal.";
  }

  return language === "vi"
    ? `Với ${sourceCount} lớp nguồn hiện có, phần nên đọc kỹ nhất là đoạn giao nhau giữa dữ kiện chắc chắn và cách thị trường đang phản ứng sớm với nó.`
    : `With ${sourceCount} source layers on the table, the part worth reading most closely is where firm facts meet the market's early reaction.`;
}

function buildWatchSentence({ lead, language, topic, sources }) {
  const normalizedTitle = cleanText(lead?.title || "");

  if (language === "vi") {
    return `${buildForwardLook(topic, normalizedTitle, language)} Patrick Tech Media sẽ tiếp tục đối chiếu rollout, phản ứng người dùng và cách ${formatSourceNames(sources, language, 2)} cập nhật thêm các mảnh ghép kế tiếp.`;
  }

  return `${buildForwardLook(topic, normalizedTitle, language)} Patrick Tech Media will keep checking rollout speed, user reaction, and how ${formatSourceNames(sources, language, 2)} update the next pieces.`;
}

function buildGuideSetupSentence(topic, language) {
  const map = {
    ai: {
      vi: "Điểm bắt đầu hợp lý là xác định đúng việc nào nên giao cho AI và việc nào vẫn cần con người đọc lại, thay vì bật công cụ lên rồi hy vọng nó tự giải quyết tất cả.",
      en: "The right starting point is deciding which tasks belong to AI and which still need a human read, instead of turning a tool on and hoping it solves everything."
    },
    devices: {
      vi: "Cách vào bài gọn nhất là nhìn đúng thiết bị, đúng giới hạn hiện tại và đúng bước cài đặt chạm vào trải nghiệm hằng ngày trước tiên.",
      en: "The cleanest way to start is to focus on the specific device, the current limit, and the setup step that changes daily use first."
    }
  };

  return map[normalizeTopic(topic)]?.[language] || (
    language === "vi"
      ? "Điểm bắt đầu nên là đúng bối cảnh dùng thật: ai dùng, dùng để làm gì, và bước nào tạo khác biệt rõ nhất ngay từ đầu."
      : "The best starting point is the real usage context: who needs it, what it is for, and which step changes the outcome first."
  );
}

function buildGuideMistakeSentence(topic, language) {
  return language === "vi"
    ? `Lỗi dễ gặp ở mảng ${normalizeTopic(topic)} là nhảy thẳng vào mẹo nhỏ mà bỏ qua điều kiện đầu vào, khiến thao tác có vẻ đúng nhưng kết quả cuối vẫn không như mong đợi.`
    : `A common mistake in ${normalizeTopic(topic)} stories is jumping straight into the trick while skipping the setup conditions, which makes the move look correct without producing the result people expect.`;
}

function buildGuideFitSentence(topic, language) {
  return language === "vi"
    ? "Bài dạng này đáng áp dụng khi bạn cần kết quả gọn, ổn định và lặp lại được; còn nếu nhu cầu quá đặc thù, người đọc vẫn nên giữ tâm thế thử trên một phạm vi nhỏ trước."
    : "A guide like this makes sense when the goal is a repeatable, stable result; if the need is unusually specific, readers should still test on a smaller surface first.";
}

function buildSourceTrailSentence(sources, language) {
  const names = formatSourceNames(sources, language, 3);
  return language === "vi"
    ? `${names} là lớp nguồn chính giữ phần dữ kiện cốt lõi của bài này.`
    : `${names} form the main source layer behind the core facts in this piece.`;
}

function buildCoverageSentence({ language, members, sources }) {
  return language === "vi"
    ? `Từ ${members} tín hiệu ban đầu, bài giữ lại ${sources} nguồn thật sự hữu ích để khóa phần chi tiết chính.`
    : `From ${members} early signals, the piece keeps ${sources} references that are useful for locking the main details in place.`;
}

function resolveEditorialLens({ lead, members, sources, topic, contentType }) {
  if (contentType === "EvergreenGuide") {
    return "guide";
  }

  if (contentType === "ComparisonPage") {
    return "comparison";
  }

  const haystack = [
    lead?.title,
    lead?.summary,
    lead?.dek,
    lead?.hook,
    ...(lead?.sections || []).flatMap((section) => [section.heading, section.body]),
    ...(members || []).flatMap((member) => [member.title, member.summary, member.dek]),
    ...(sources || []).flatMap((source) => [source.source_name, source.source_url])
  ]
    .filter(Boolean)
    .join(" ");

  if (hasAiPackageSignals(haystack) && ["ai", "apps-software", "internet-business-tech"].includes(normalizeTopic(topic))) {
    return "ai-package";
  }

  return "news";
}

function resolveEditorialFocus({ topic, contentType, lens }) {
  const focus = new Set();

  if (topic) {
    focus.add(normalizeTopic(topic));
  }

  if (lens === "ai-package") {
    focus.add("ai-package");
  }

  if (contentType === "ComparisonPage") {
    focus.add("comparison");
  }

  if (contentType === "EvergreenGuide") {
    focus.add("tips");
    focus.add("guide");
  }

  return [...focus];
}

function hasAiPackageSignals(value) {
  const text = cleanText(value);
  return /\b(google ai pro|google ai ultra|google ai plus|google one|workspace|gemini advanced|notebooklm|veo|lyria|chatgpt plus|chatgpt pro|chatgpt team|claude pro|claude max|copilot pro|microsoft 365 copilot|subscription|pricing|bundle|package|plan|storage|5tb|2tb|monthly|annual|trả phí|gói ai|dung lượng)\b/i.test(text);
}

function buildFallbackSummary({ language, topic, contentType, sources, members }) {
  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? `Bài hướng dẫn này được biên tập lại từ ${sources} lớp nguồn để người đọc có thể dùng ngay, thay vì chỉ đọc cho biết rồi bỏ qua.`
      : `This guide is rebuilt from ${sources} source layers so readers can put it to work instead of just skimming it.`;
  }

  return language === "vi"
    ? `Câu chuyện này được chắt lại từ ${members} tín hiệu quanh mảng ${normalizeTopic(topic)}, giữ đủ chi tiết để người đọc có thể nắm bối cảnh thay vì dừng ở một headline mỏng.`
    : `This story is distilled from ${members} signals around ${normalizeTopic(topic)}, keeping enough detail for readers to understand the context instead of stopping at a thin headline.`;
}

function buildFallbackDek({ language, topic, contentType }) {
  if (contentType === "EvergreenGuide") {
    return language === "vi"
      ? "Bài này được biên tập theo hướng đọc xong là dùng được ngay, giữ đủ bối cảnh để người đọc biết nên làm gì trước và tránh lỗi gì."
      : "This guide is edited to be useful right away, with enough context for readers to know what to do first and what to avoid.";
  }

  return language === "vi"
    ? `Điểm đáng đọc của câu chuyện nằm ở tác động thực tế lên ${normalizeTopic(topic)} và cách nhiều nguồn đang bắt đầu khớp nhau ở phần lõi.`
    : `What makes this worth reading is the real-world effect on ${normalizeTopic(topic)} and the way multiple sources are beginning to line up on the core facts.`;
}

function buildFallbackHook({ language, topic, contentType }) {
  if (contentType === "ComparisonPage") {
    return language === "vi"
      ? "Bài so sánh này giữ giá trị ở chỗ nó kéo các lựa chọn về cùng một mặt bàn để khác biệt thật sự lộ ra."
      : "This comparison earns its value by bringing the options onto the same table so the real differences can show.";
  }

  return language === "vi"
    ? `Với mảng ${normalizeTopic(topic)}, điều đáng đọc không nằm ở tiếng ồn đầu tiên mà ở chỗ câu chuyện này sẽ chạm vào người dùng và đội vận hành thế nào sau đó.`
    : `In ${normalizeTopic(topic)}, the part worth reading is not the first burst of noise but the way the story lands on users and operating teams afterward.`;
}

function buildForwardLook(topic, title, language) {
  const normalized = normalizeTopic(topic);
  const viMap = {
    ai: "Điểm cần theo dõi tiếp là liệu thay đổi này có đi vào sản phẩm dùng thật nhanh đến đâu và ai sẽ chạm nó đầu tiên trong công việc hằng ngày.",
    "apps-software": "Điều nên theo dõi tiếp là nhịp rollout, giới hạn theo khu vực và việc thói quen dùng ứng dụng có thật sự đổi sau cập nhật này hay không.",
    devices: "Điều nên giữ trong tầm mắt là giá bán, độ phủ thiết bị và cảm giác dùng thật khi thay đổi này tới tay người dùng.",
    security: "Phần cần theo dõi thêm là độ rộng của rủi ro, tốc độ vá và chi phí vận hành nếu đội ngũ buộc phải đổi quy trình vì câu chuyện này.",
    gaming: `Điểm nên chờ tiếp là liệu ${cleanText(title).toLowerCase()} chỉ bùng lên theo nhịp cộng đồng hay có đủ sức kéo thành một hướng đi rõ hơn.`,
    "internet-business-tech": "Điều cần nhìn tiếp là mức tác động thật lên người dùng, nhà sáng tạo nội dung hoặc mô hình doanh thu của nền tảng."
  };
  const enMap = {
    ai: "The next question is how quickly the shift reaches real products and who feels it first in everyday work.",
    "apps-software": "The next thing to watch is rollout speed, regional limits, and whether the update really changes day-to-day habits.",
    devices: "The next readout is price, device coverage, and whether the change feels real once the hardware reaches users.",
    security: "The next layer to watch is scope, patch speed, and the operating cost if teams are forced to change process because of this story.",
    gaming: `The next thing to watch is whether ${cleanText(title).toLowerCase()} stays a community spike or develops into a clearer shift.`,
    "internet-business-tech": "The real follow-up is whether the story turns into measurable user, creator, or revenue impact."
  };

  return language === "vi" ? viMap[normalized] || viMap.ai : enMap[normalized] || enMap.ai;
}

function selectClusterImage(members, sources, language, options = {}) {
  const lead = [...members].sort(sortDraftsByPriority)[0];
  const preferredProviders = Array.isArray(options.preferredProviders)
    ? options.preferredProviders
        .map((providerKey) => String(providerKey || "").trim())
        .filter((providerKey) => providerKey in AI_PROVIDER_LABELS)
    : [];
  const strictProviderMatch = options.strictProviderMatch === true;
  const focusTerms = getStoryTokens(
    members
      .flatMap((member) => [
        member?.title,
        member?.summary,
        member?.dek,
        member?.hook,
        ...(member?.sections || []).map((section) => section?.body),
        ...(member?.source_set || []).flatMap((source) => [source?.source_name, source?.source_url])
      ])
      .filter(Boolean)
      .join(" "),
    members[0]?.language || language
  );
  const bestBySrc = new Map();

  for (const member of members) {
    const memberContext = [member?.title, member?.summary, member?.dek, member?.hook].filter(Boolean).join(" ");
    const leadAligned = member?.id && member?.id === lead?.id;

    if (isRemoteImageUrl(member?.image?.src)) {
      const candidate = {
        src: member.image.src,
        caption: cleanText(member.image.caption),
        credit: cleanText(member.image.credit) || cleanText(member.source_set?.[0]?.source_name),
        source_url: cleanText(member.image.source_url) || cleanText(member.source_set?.[0]?.source_url),
        score: scoreImageCandidate({
          url: member.image.src,
          source: member.source_set?.[0],
          focusTerms,
          contextText: memberContext,
          preferred: true,
          preferredProviders,
          strictProviderMatch,
          leadAligned
        })
      };
      keepBestImageCandidate(bestBySrc, candidate);
    }

    for (const source of member.source_set || []) {
      if (!isRemoteImageUrl(source?.image_url)) {
        continue;
      }

      const candidate = {
        src: source.image_url,
        caption: cleanText(source.image_caption),
        credit: cleanText(source.image_credit) || cleanText(source.source_name),
        source_url: cleanText(source.source_url),
        score: scoreImageCandidate({
          url: source.image_url,
          source,
          focusTerms,
          contextText: `${memberContext} ${source?.source_name || ""}`,
          preferred: false,
          preferredProviders,
          strictProviderMatch,
          leadAligned
        })
      };
      keepBestImageCandidate(bestBySrc, candidate);
    }
  }

  const best = [...bestBySrc.values()].sort((left, right) => right.score - left.score)[0];

  if (!best) {
    return {};
  }

  const caption = cleanText(best.caption) || (
    language === "vi"
      ? `Ảnh tham khảo từ ${best.credit || formatSourceNames(sources, language, 1)}.`
      : `Reference image from ${best.credit || formatSourceNames(sources, language, 1)}.`
  );

  return {
    src: best.src,
    caption,
    credit: best.credit || "",
    source_url: best.source_url || ""
  };
}

function keepBestImageCandidate(bestBySrc, candidate) {
  const key = cleanText(candidate?.src);

  if (!key) {
    return;
  }

  const existing = bestBySrc.get(key);

  if (!existing || candidate.score > existing.score) {
    bestBySrc.set(key, candidate);
  }
}

function scoreImageCandidate({
  url,
  source,
  focusTerms = [],
  contextText = "",
  preferred = false,
  preferredProviders = [],
  strictProviderMatch = false,
  leadAligned = false
}) {
  const src = String(url || "").toLowerCase();
  const normalizedSrc = normalizeCompact(src);
  const contextTerms = getStoryTokens(contextText, source?.language || "vi");
  const sourceProviderKeys = detectAiProviderKeys(
    [source?.source_name, source?.source_url, source?.image_caption, source?.image_credit, url].filter(Boolean).join(" ")
  );
  const contextProviderKeys = detectAiProviderKeys(contextText);
  let score = (SOURCE_TYPE_PRIORITY[source?.source_type] || 0) + (TRUST_PRIORITY[source?.trust_tier] || 0);

  if (preferred) {
    score += 4;
  }

  if (leadAligned) {
    score += 3;
  }

  if (/\b(hero|cover|featured|wp-content|uploads|max-\d+)\b/.test(src)) {
    score += 5;
  }

  if (/\b(logo|avatar|icon|sprite|placeholder|default|social-share|opengraph)\b/.test(src)) {
    score -= 12;
  }

  if (/\b(thumb|thumbnail|small|square|cropped|crop)\b/.test(src)) {
    score -= 5;
  }

  if (preferredProviders.length) {
    const sourceMatchesPreferred = sourceProviderKeys.some((providerKey) => preferredProviders.includes(providerKey));
    const contextMatchesPreferred = contextProviderKeys.some((providerKey) => preferredProviders.includes(providerKey));

    if (sourceMatchesPreferred) {
      score += strictProviderMatch ? 22 : 14;
    } else if (sourceProviderKeys.length) {
      score -= strictProviderMatch ? 28 : 12;
    } else if (contextMatchesPreferred) {
      score += strictProviderMatch ? 10 : 6;
    } else if (contextProviderKeys.length) {
      score -= strictProviderMatch ? 10 : 4;
    }
  }

  for (const term of [...focusTerms, ...contextTerms].slice(0, 24)) {
    if (term && normalizedSrc.includes(term)) {
      score += term.length >= 6 ? 3 : 1;
    }
  }

  const sourceNameToken = normalizeCompact(source?.source_name || "");
  if (sourceNameToken && normalizedSrc.includes(sourceNameToken)) {
    score += 2;
  }

  try {
    const sourceHost = new URL(source?.source_url || "").hostname.replace(/^www\./i, "");
    const imageHost = new URL(url).hostname.replace(/^www\./i, "");

    if (sourceHost && imageHost && sourceHost === imageHost) {
      score += 4;
    }
  } catch {
    // Ignore malformed source or image URLs.
  }

  return score;
}

function resolveVerificationState(members, sources) {
  const sourceTypes = new Set(sources.map((source) => source.source_type));
  const official = sourceTypes.has("official-site");
  const majorSourceCount = new Set(
    sources
      .filter((source) => source.source_type === "press" || source.source_type === "official-site" || source.source_type === "official-social")
      .map((source) => normalizeCompact(source.source_name))
  ).size;

  if (official || majorSourceCount >= 2) {
    return "verified";
  }

  if (sourceTypes.has("press") || sourceTypes.has("official-social")) {
    return "emerging";
  }

  if (members.some((member) => member.verification_state === "trend")) {
    return "trend";
  }

  return "emerging";
}

function resolveClusterTopic(members) {
  const fallbackTopic = normalizeTopic(members[0]?.topic);
  const scores = new Map([
    ["ai", 0],
    ["apps-software", 0],
    ["internet-business-tech", 0],
    ["security", 0],
    ["devices", 0],
    ["gaming", 0]
  ]);
  const textBlob = members
    .flatMap((member) => [
      member?.title,
      member?.summary,
      member?.dek,
      member?.hook,
      ...(member?.sections || []).flatMap((section) => [section?.heading, section?.body]),
      ...(member?.source_set || []).flatMap((source) => [source?.source_name, source?.source_url])
    ])
    .filter(Boolean)
    .join(" ");
  const normalizedBlob = cleanText(textBlob);

  for (const member of members) {
    const topic = normalizeTopic(member.topic);
    scores.set(topic, (scores.get(topic) || 0) + draftPriority(member));
  }

  if (hasAiPackageSignals(normalizedBlob)) {
    scores.set("ai", (scores.get("ai") || 0) + 26);
    scores.set("apps-software", (scores.get("apps-software") || 0) + 10);
  }

  if (/\b(chatgpt|openai|gemini|claude|copilot|anthropic|notebooklm|deepseek|grok|trí tuệ nhân tạo|mô hình ai|trợ lý ai)\b/i.test(normalizedBlob)) {
    scores.set("ai", (scores.get("ai") || 0) + 24);
  }

  if (/\b(workspace|gmail|docs|sheets|slides|meet|drive|notion|slack|zoom|browser|messenger web|trình duyệt web|ứng dụng|phần mềm|mẹo|thủ thuật|hướng dẫn|workflow|productivity)\b/i.test(normalizedBlob)) {
    scores.set("apps-software", (scores.get("apps-software") || 0) + 22);
    scores.set("gaming", (scores.get("gaming") || 0) - 18);
  }

  if (/\b(facebook|messenger|meta|instagram|threads|whatsapp|oracle|doanh nghiệp|nền tảng|mạng xã hội|creator|agency|seller|bán hàng)\b/i.test(normalizedBlob)) {
    scores.set("internet-business-tech", (scores.get("internet-business-tech") || 0) + 24);
    scores.set("gaming", (scores.get("gaming") || 0) - 14);
  }

  if (/\b(hack|security|cyber|malware|phishing|passkey|password|data breach|ransomware|bảo mật|tấn công)\b/i.test(normalizedBlob)) {
    scores.set("security", (scores.get("security") || 0) + 22);
  }

  if (/\b(iphone|android|pixel|galaxy|laptop|macbook|ipad|chip|gpu|cpu|npu|ram|memory|ssd|pc|desktop|device|tablet|camera|robot|hardware|thiết bị|điện thoại|intel|amd|qualcomm|nvidia)\b/i.test(normalizedBlob)) {
    scores.set("devices", (scores.get("devices") || 0) + 18);
  }

  if (/\b(gaming|game|steam|playstation|xbox|nintendo|switch|handheld|dlss|rockstar|gta|game thủ)\b/i.test(normalizedBlob)) {
    scores.set("gaming", (scores.get("gaming") || 0) + 18);
  }

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || fallbackTopic;
}

function resolveClusterContentType(members) {
  const preference = ["EvergreenGuide", "ComparisonPage", "Roundup", "NewsArticle"];

  for (const type of preference) {
    if (members.some((member) => member.content_type === type)) {
      return type;
    }
  }

  return members[0]?.content_type || "NewsArticle";
}

function dedupeSources(members) {
  const entriesByKey = new Map();

  for (const member of members) {
    for (const source of member.source_set || []) {
      const normalizedSource = {
        ...source,
        source_name: cleanText(source?.source_name),
        source_url: cleanText(source?.source_url),
        image_caption: cleanText(source?.image_caption),
        image_credit: cleanText(source?.image_credit)
      };
      const canonicalUrl = normalizeSourceUrl(normalizedSource.source_url);
      const key = canonicalUrl || normalizeCompact(normalizedSource.source_name);

      if (!key) {
        continue;
      }

      const existing = entriesByKey.get(key);

      if (!existing || sourceReliabilityScore(normalizedSource) > sourceReliabilityScore(existing)) {
        entriesByKey.set(key, normalizedSource);
      }
    }
  }

  return [...entriesByKey.values()].sort((left, right) => sourceReliabilityScore(right) - sourceReliabilityScore(left));
}

function normalizeSourceUrl(value) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return "";
  }

  try {
    const url = new URL(cleaned);
    url.hash = "";
    if (url.pathname !== "/") {
      url.search = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return cleaned.replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

function collectSentencePool(members) {
  const pool = [];
  const seen = new Set();

  for (const member of members) {
    const texts = [
      member.summary,
      member.dek,
      member.hook,
      ...(member.sections || []).map((section) => section?.body),
      ...(member.draft_context?.paragraphs || [])
    ];

    for (const sentence of texts.flatMap(splitSentences)) {
      const normalized = normalizeEditorialSentence(sentence);
      const signature = normalizeCompact(normalized);

      if (!normalized || seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      pool.push(normalized);
    }
  }

  return pool;
}

function firstUsefulSentence(values) {
  for (const value of values.flat().filter(Boolean)) {
    const sentence = splitSentences(value)
      .map((entry) => normalizeEditorialSentence(entry, 60))
      .find(Boolean);

    if (sentence) {
      return finishSentence(sentence);
    }
  }

  return "";
}

function firstUnusedSentences(pool, usedValues, count) {
  const used = new Set((usedValues || []).filter(Boolean).map((value) => normalizeCompact(value)));
  const picked = [];

  for (const value of pool) {
    const normalized = normalizeEditorialSentence(value);
    const signature = normalizeCompact(normalized);

    if (!normalized || used.has(signature)) {
      continue;
    }

    used.add(signature);
    picked.push(finishSentence(normalized));

    if (picked.length >= count) {
      break;
    }
  }

  return picked;
}

function normalizeEditorialSentence(value, minLength = 50) {
  const normalized = cleanText(value);

  if (!normalized || normalized.length < minLength || hasEncodingArtifacts(normalized) || isWeakEditorialSentence(normalized)) {
    return "";
  }

  return normalized;
}

function isWeakEditorialSentence(value) {
  return /(search results|all search results|affiliate links?|best daily deals|newsletter|toggle dark mode|toggle search form|privacy policy|cookie policy|terms of use|all rights reserved|copyright|learn more|read more|sign up|sign in|log in|login|follow us|watch now|shop now|source image pending|reference image from|add .* on google|android authority on google|headphone deals|robot vacuum deals|deviled eggs|roasted chicken|recipe|restaurant|vacation|travel tips|easter|grubhub|uber eats|for more than \d+ years|we['’]ve invested in|make everyday life better|our mission is|today we are announcing|available everywhere our ai plans are available|copy link|link bài gốc|lấy link|google cloud community|google workspace admins like you|nguồn tham chiếu chính của bài|ở vòng tổng hợp này|bài này được biên tập|câu chuyện này được chắt lại|patrick tech media sẽ tiếp tục|patrick tech media đang đối chiếu|điểm đáng giữ lại là câu chuyện này|bài viết kéo câu chuyện về đúng bối cảnh)/i.test(
    value
  );
}

function hasEncodingArtifacts(value) {
  return /(?:Ã|Â|Ä|Ă|Å|Æ|áº|á»|â€|â€™|â€œ|â€|Ă¢â‚¬)/.test(String(value || ""));
}

function composeParagraph(values, fallback, minLength = 140) {
  const parts = [];
  const seen = new Set();

  for (const value of values.flat().filter(Boolean)) {
    for (const sentence of splitSentences(value)) {
      const normalized = normalizeEditorialSentence(sentence, 38);
      const signature = normalizeCompact(normalized);

      if (!normalized || seen.has(signature)) {
        continue;
      }

      seen.add(signature);
      parts.push(finishSentence(normalized));
    }
  }

  let paragraph = parts.join(" ").trim();

  if (paragraph.length < minLength && fallback) {
    const fallbackSentence = finishSentence(fallback);
    const fallbackSignature = normalizeCompact(fallbackSentence);

    if (!seen.has(fallbackSignature)) {
      paragraph = `${paragraph} ${fallbackSentence}`.trim();
    }
  }

  if (paragraph.length < minLength) {
    paragraph = `${paragraph} ${finishSentence(
      typeof fallback === "string" && fallback
        ? fallback
        : "Patrick Tech Media keeps the story in context so readers can see the practical angle instead of stopping at a thin headline."
    )}`.trim();
  }

  return paragraph;
}

function calculateClusterQualityScore({ members, sources, sections, image, summary, dek, hook, verificationState }) {
  const base = verificationState === "verified" ? 88 : verificationState === "emerging" ? 82 : 76;
  const sourceBonus = Math.min(10, sources.length * 3);
  const sectionBonus = Math.min(8, sections.length * 2);
  const imageBonus = image?.src ? 4 : 0;
  const depthBonus = [summary, dek, hook, ...sections.map((section) => section.body)].join(" ").length >= 1400 ? 4 : 2;
  const corroborationBonus = members.length >= 2 ? 4 : 0;
  return Math.min(98, base + sourceBonus + sectionBonus + imageBonus + depthBonus + corroborationBonus);
}

function draftPriority(member) {
  const source = member?.source_set?.[0];
  const freshness = computeFreshnessScore(member.updated_at || member.published_at);
  return (member.quality_score || 0) + freshness + sourceReliabilityScore(source);
}

function sortDraftsByPriority(left, right) {
  return draftPriority(right) - draftPriority(left);
}

function sourceReliabilityScore(source) {
  return (SOURCE_TYPE_PRIORITY[source?.source_type] || 0) + (TRUST_PRIORITY[source?.trust_tier] || 0);
}

function computeFreshnessScore(dateString) {
  const timestamp = new Date(dateString || 0).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageHours = Math.max(0, (Date.now() - timestamp) / 36e5);

  if (ageHours <= 6) {
    return 12;
  }

  if (ageHours <= 12) {
    return 9;
  }

  if (ageHours <= 24) {
    return 6;
  }

  if (ageHours <= 48) {
    return 3;
  }

  return 1;
}

function getStoryTokens(value, language) {
  const tokens = normalizeCompact(value)
    .split("-")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));

  const unique = [];
  const seen = new Set();

  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    unique.push(token);
  }

  return unique.slice(0, language === "vi" ? 18 : 16);
}

function newestTimestamp(members) {
  const timestamps = members
    .map((member) => new Date(member.updated_at || member.published_at || 0).getTime())
    .filter((value) => Number.isFinite(value));
  return new Date(Math.max(...timestamps)).toISOString();
}

function getPrimarySourceUrl(article) {
  return cleanText(article?.source_set?.[0]?.source_url || article?.image?.source_url || "");
}

function buildClusterHash({ language, contentType, title, sources, lead }) {
  const sourceFingerprint = sources.slice(0, 3).map((source) => normalizeCompact(source.source_name)).join("-");
  return crypto
    .createHash("sha1")
    .update(`${language}:${contentType}:${normalizeCompact(title)}:${sourceFingerprint}:${cleanText(lead?.published_at || "")}`)
    .digest("hex")
    .slice(0, 12);
}

function trimTitle(value) {
  const normalized = cleanText(value)
    .replace(/\s+\|\s+.*$/g, "")
    .replace(/\s+[-–—]\s+.*$/g, "")
    .trim();

  if (normalized.length <= 112) {
    return normalized;
  }

  const cut = normalized
    .split(/\s+/)
    .reduce((state, word) => {
      const next = state.text ? `${state.text} ${word}` : word;
      return next.length <= 108 ? { text: next } : state;
    }, { text: "" })
    .text
    .trim();

  return cut || normalized.slice(0, 108).trim();
}

function resolveStoreLinkMode(topic, contentType) {
  if (contentType === "EvergreenGuide" || contentType === "ComparisonPage") {
    return "full";
  }

  return ["ai", "apps-software", "security"].includes(normalizeTopic(topic)) ? "soft" : "off";
}

function resolveStoreItems(topic) {
  const byTopic = {
    ai: ["ai-workspace-bundle"],
    "apps-software": ["creator-software-stack"],
    security: ["secure-access-kit"],
    gaming: ["gaming-cloud-pass"]
  };

  return byTopic[normalizeTopic(topic)] || [];
}

function resolveAuthorId(topic, fallback) {
  const normalized = normalizeTopic(topic);

  if (normalized === "security") {
    return "thao-nguyen";
  }

  if (["devices", "gaming", "internet-business-tech"].includes(normalized)) {
    return "quang-huy";
  }

  return fallback || "mai-linh";
}

function getContentFamily(contentType) {
  if (contentType === "EvergreenGuide") {
    return "guide";
  }

  if (contentType === "ComparisonPage") {
    return "comparison";
  }

  if (contentType === "Roundup") {
    return "roundup";
  }

  return "news";
}

function normalizeTopic(topic) {
  if (topic === "software") {
    return "apps-software";
  }

  if (topic === "internet-business") {
    return "internet-business-tech";
  }

  return cleanText(topic) || "internet-business-tech";
}

function formatSourceNames(sources, language, limit = 3) {
  const seen = new Set();
  const names = sources
    .map((source) => cleanText(source?.source_name))
    .filter(Boolean)
    .filter((name) => {
      const key = normalizeCompact(name);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, limit);

  if (!names.length) {
    return language === "vi" ? "các nguồn đang theo dõi" : "the current source layer";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} ${language === "vi" ? "và" : "and"} ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} ${language === "vi" ? "và" : "and"} ${names[names.length - 1]}`;
}

function isRemoteImageUrl(value) {
  return /^https?:\/\/.+\.(?:jpg|jpeg|png|webp|gif|avif)(?:\?.*)?$/i.test(String(value || "").trim());
}

function splitSentences(value) {
  return cleanText(value)
    .split(/(?<=[.?!])\s+/)
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function finishSentence(value) {
  const normalized = cleanText(value);
  return normalized ? (/[.?!]$/.test(normalized) ? normalized : `${normalized}.`) : "";
}

function cleanText(value) {
  return repairEncodingArtifacts(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function normalizeCompact(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(value) {
  return normalizeCompact(value) || `story-${crypto.randomUUID().slice(0, 8)}`;
}

