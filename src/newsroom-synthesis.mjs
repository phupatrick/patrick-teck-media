import crypto from "node:crypto";

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
  const image = selectClusterImage(members, sources, language);
  const verificationState = resolveVerificationState(members, sources);
  const title = buildClusterTitle({ lead, language, contentType });
  const summary = buildClusterSummary({ members, lead, sources, pool, language, topic, contentType, verificationState });
  const dek = buildClusterDek({ lead, sources, pool, language, topic, contentType, verificationState });
  const hook = buildClusterHook({ lead, sources, pool, language, topic, contentType, verificationState });
  const sections = buildClusterSections({
    members,
    lead,
    sources,
    pool,
    language,
    topic,
    contentType,
    verificationState
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

function buildClusterSummary({ members, lead, sources, pool, language, topic, contentType, verificationState }) {
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

function buildClusterDek({ lead, sources, pool, language, topic, contentType, verificationState }) {
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

function buildClusterHook({ lead, sources, pool, language, topic, contentType, verificationState }) {
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

function buildClusterSections({ members, lead, sources, pool, language, topic, contentType, verificationState }) {
  if (contentType === "EvergreenGuide") {
    return buildGuideSections({ lead, sources, pool, language, topic, verificationState });
  }

  if (contentType === "ComparisonPage") {
    return buildComparisonSections({ lead, sources, pool, language, topic, verificationState });
  }

  return buildNewsSections({ members, lead, sources, pool, language, topic, verificationState });
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

  return [
    {
      heading: headings[0],
      body: composeParagraph(
        [
          lead.summary,
          lead.sections?.[0]?.body,
          lead.draft_context?.paragraphs?.[0],
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
          lead.draft_context?.paragraphs?.[1],
          firstUnusedSentences(pool, [lead.summary], 1)[0]
        ],
        consensus,
        150
      )
    },
    {
      heading: headings[2],
      body: composeParagraph(
        [
          lead.sections?.[1]?.body,
          lead.draft_context?.paragraphs?.[2],
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
          firstUnusedSentences(pool, [lead.summary, lead.dek], 1)[0]
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
    ? `Nguồn tham chiếu chính của bài gồm ${names}.`
    : `The main references behind this piece include ${names}.`;
}

function buildCoverageSentence({ language, members, sources }) {
  return language === "vi"
    ? `Ở vòng tổng hợp này, bài viết được kéo từ ${members} tín hiệu và chốt lại còn ${sources} nguồn tham chiếu thật sự hữu ích cho người đọc.`
    : `In this pass, the story was distilled from ${members} signals into ${sources} source references that are genuinely useful to readers.`;
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

function selectClusterImage(members, sources, language) {
  const candidates = [];

  for (const member of members) {
    if (isRemoteImageUrl(member?.image?.src)) {
      candidates.push({
        src: member.image.src,
        caption: cleanText(member.image.caption),
        credit: cleanText(member.image.credit) || cleanText(member.source_set?.[0]?.source_name),
        source_url: cleanText(member.image.source_url) || cleanText(member.source_set?.[0]?.source_url),
        score: scoreImageCandidate(member.image.src, member.source_set?.[0])
      });
    }

    for (const source of member.source_set || []) {
      if (isRemoteImageUrl(source?.image_url)) {
        candidates.push({
          src: source.image_url,
          caption: cleanText(source.image_caption),
          credit: cleanText(source.image_credit) || cleanText(source.source_name),
          source_url: cleanText(source.source_url),
          score: scoreImageCandidate(source.image_url, source)
        });
      }
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];

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

function scoreImageCandidate(url, source) {
  const src = String(url || "").toLowerCase();
  let score = (SOURCE_TYPE_PRIORITY[source?.source_type] || 0) + (TRUST_PRIORITY[source?.trust_tier] || 0);

  if (/\b(hero|cover|featured|wp-content|uploads)\b/.test(src)) {
    score += 4;
  }

  if (/\b(logo|avatar|icon|sprite)\b/.test(src)) {
    score -= 10;
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
  const scores = new Map();

  for (const member of members) {
    const topic = normalizeTopic(member.topic);
    scores.set(topic, (scores.get(topic) || 0) + draftPriority(member));
  }

  return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || normalizeTopic(members[0]?.topic);
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
  const seen = new Set();
  const entries = [];

  for (const member of members) {
    for (const source of member.source_set || []) {
      const key = `${normalizeCompact(source?.source_name)}:${normalizeCompact(source?.source_url)}`;

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      entries.push({
        ...source,
        source_name: cleanText(source?.source_name),
        source_url: cleanText(source?.source_url),
        image_caption: cleanText(source?.image_caption),
        image_credit: cleanText(source?.image_credit)
      });
    }
  }

  return entries.sort((left, right) => sourceReliabilityScore(right) - sourceReliabilityScore(left));
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
      const normalized = cleanText(sentence);
      const signature = normalizeCompact(normalized);

      if (!normalized || normalized.length < 50 || seen.has(signature)) {
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
    const sentence = splitSentences(value).find((entry) => entry.length >= 60);

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
    const signature = normalizeCompact(value);

    if (used.has(signature)) {
      continue;
    }

    used.add(signature);
    picked.push(finishSentence(value));

    if (picked.length >= count) {
      break;
    }
  }

  return picked;
}

function composeParagraph(values, fallback, minLength = 140) {
  const parts = [];
  const seen = new Set();

  for (const value of values.flat().filter(Boolean)) {
    for (const sentence of splitSentences(value)) {
      const normalized = cleanText(sentence);
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

  return cleanText(topic) || "ai";
}

function formatSourceNames(sources, language, limit = 3) {
  const names = sources
    .map((source) => cleanText(source?.source_name))
    .filter(Boolean)
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
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
