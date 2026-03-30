const TOPICS = [
  {
    id: "ai",
    accent: "#ff8a3d",
    labels: { vi: "AI", en: "AI" },
    slugs: { vi: "ai", en: "ai" }
  },
  {
    id: "apps-software",
    accent: "#2f8f83",
    labels: { vi: "Ứng dụng & Phần mềm", en: "Apps & Software" },
    slugs: { vi: "ung-dung-phan-mem", en: "apps-software" }
  },
  {
    id: "devices",
    accent: "#2463eb",
    labels: { vi: "Thiết bị", en: "Devices" },
    slugs: { vi: "thiet-bi", en: "devices" }
  },
  {
    id: "security",
    accent: "#9b4dca",
    labels: { vi: "Bảo mật", en: "Security" },
    slugs: { vi: "bao-mat", en: "security" }
  },
  {
    id: "gaming",
    accent: "#e6527d",
    labels: { vi: "Gaming", en: "Gaming" },
    slugs: { vi: "gaming", en: "gaming" }
  },
  {
    id: "internet-business-tech",
    accent: "#0f7f54",
    labels: { vi: "Internet & Doanh nghiệp số", en: "Internet & Business Tech" },
    slugs: { vi: "internet-doanh-nghiep-so", en: "internet-business-tech" }
  }
];

const AUTHORS = [
  {
    id: "mai-linh",
    name: "Mai Linh",
    role: { vi: "Biên tập AI & Workflow", en: "AI and Workflow Editor" },
    bio: {
      vi: "Theo dõi các đợt phát hành AI, công cụ làm việc và cách chúng thực sự thay đổi nhịp làm việc của đội ngũ nhỏ.",
      en: "Tracks AI releases, workflow tools, and the practical ways they change day-to-day work for lean teams."
    }
  },
  {
    id: "quang-huy",
    name: "Quang Huy",
    role: { vi: "Biên tập Thiết bị & Hạ tầng số", en: "Devices and Digital Infrastructure Editor" },
    bio: {
      vi: "Phụ trách mảng thiết bị, chip, phần cứng tiêu dùng và nhịp chuyển đổi công nghệ ở thị trường Việt Nam.",
      en: "Covers devices, chips, consumer hardware, and how infrastructure shifts land in the Vietnam market."
    }
  },
  {
    id: "thao-nguyen",
    name: "Thảo Nguyên",
    role: { vi: "Biên tập Bảo mật & Chính sách nội dung", en: "Security and Editorial Policy Editor" },
    bio: {
      vi: "Theo dõi các câu chuyện bảo mật, quy chuẩn xuất bản và chất lượng nội dung trong hệ newsroom tự động.",
      en: "Focuses on security stories, publishing standards, and editorial quality in automated newsroom systems."
    }
  }
];

const STORE_ITEMS = [
  {
    id: "ai-workspace-bundle",
    title: {
      vi: "Gói AI Workspace cho dân làm việc số",
      en: "AI Workspace Bundle for Digital Teams"
    },
    description: {
      vi: "Nhóm công cụ phục vụ viết, dịch, tổng hợp và tăng tốc quy trình nội bộ.",
      en: "A curated stack for writing, translation, summarization, and internal workflow speed."
    },
    path: "/collections/ai-workspace-bundle"
  },
  {
    id: "creator-software-stack",
    title: {
      vi: "Stack phần mềm cho creator và editor",
      en: "Creator and Editor Software Stack"
    },
    description: {
      vi: "Bộ công cụ ưu tiên cho video, thiết kế và vận hành nội dung nhiều kênh.",
      en: "A practical set of tools for video, design, and multi-channel content operations."
    },
    path: "/collections/creator-software-stack"
  },
  {
    id: "secure-access-kit",
    title: {
      vi: "Secure Access Kit cho team nhỏ",
      en: "Secure Access Kit for Small Teams"
    },
    description: {
      vi: "Gợi ý stack dành cho đăng nhập an toàn, quản trị tài khoản và bàn giao quyền truy cập.",
      en: "Suggested tools for safe sign-in, account governance, and access handoff."
    },
    path: "/collections/secure-access-kit"
  },
  {
    id: "gaming-cloud-pass",
    title: {
      vi: "Gaming Cloud Pass",
      en: "Gaming Cloud Pass"
    },
    description: {
      vi: "Bộ tài nguyên nhẹ dành cho game streaming, cloud save và giải trí số.",
      en: "A lightweight stack for cloud gaming, saves, and digital entertainment."
    },
    path: "/collections/gaming-cloud-pass"
  }
];

const POLICY_PAGES = [
  {
    key: "about",
    titles: { vi: "Về Patrick Tech Media", en: "About Patrick Tech Media" },
    intros: {
      vi: "Patrick Tech Media là toà soạn số song ngữ theo dõi công nghệ, phần mềm, thiết bị và đời sống Internet với nhịp đưa tin gọn, rõ và dễ đọc cho độc giả Việt Nam lẫn quốc tế.",
      en: "Patrick Tech Media is a bilingual digital newsroom covering technology, software, devices, and internet culture with a clear, practical reading experience for Vietnam and global audiences."
    },
    sections: {
      vi: [
        {
          heading: "Chúng tôi làm gì",
          body:
            "Site tổ chức nội dung theo nhịp một newsroom hiện đại: tin nhanh khi sự kiện vừa lên sóng, bài nền để giữ bối cảnh, bài so sánh để giúp người đọc ra quyết định và các bản tổng hợp để chắt lọc tuần công nghệ."
        },
        {
          heading: "Vị trí trong hệ sinh thái Patrick Tech",
          body:
            "Patrick Tech Media là cánh media của hệ sinh thái Patrick Tech. Nội dung luôn ưu tiên giá trị biên tập; các gợi ý sản phẩm chỉ xuất hiện khi thực sự liên quan và không chi phối trải nghiệm đọc."
        }
      ],
      en: [
        {
          heading: "What We Do",
          body:
            "The site is organized like a modern digital desk: fast updates when news breaks, deeper context pieces for staying power, comparisons for decision-making, and weekly roundups that distill the busiest shifts."
        },
        {
          heading: "Role Inside Patrick Tech",
          body:
            "Patrick Tech Media is the media arm of the Patrick Tech ecosystem. Editorial value comes first; product suggestions only appear when they are contextually useful."
        }
      ]
    }
  },
  {
    key: "contact",
    titles: { vi: "Liên hệ", en: "Contact" },
    intros: {
      vi: "Dùng trang này để gửi góp ý biên tập, yêu cầu chỉnh sửa, tín hiệu nguồn tin và đề xuất hợp tác.",
      en: "Use this page for editorial feedback, corrections, source tips, and collaboration inquiries."
    },
    sections: {
      vi: [
        {
          heading: "Kênh phản hồi",
          body: "Email biên tập: editorial@patricktech.media. Tín hiệu nguồn tin khẩn: desk@patricktech.media."
        },
        {
          heading: "Hợp tác thương hiệu",
          body:
            "Mọi gói tài trợ hoặc hợp tác thương mại đều phải tách rõ khỏi khu vực biên tập và tuân thủ chính sách disclosure."
        }
      ],
      en: [
        {
          heading: "Feedback Channels",
          body: "Editorial email: editorial@patricktech.media. Urgent desk tips: desk@patricktech.media."
        },
        {
          heading: "Brand Partnerships",
          body:
            "All sponsorships and commercial partnerships stay clearly separated from editorial surfaces and follow disclosure requirements."
        }
      ]
    }
  },
  {
    key: "privacy",
    titles: { vi: "Chính sách quyền riêng tư", en: "Privacy Policy" },
    intros: {
      vi: "Trang này mô tả dữ liệu đọc, tín hiệu tương tác, analytics và quảng cáo được xử lý như thế nào trong newsroom.",
      en: "This page explains how reading data, engagement signals, analytics, and advertising are handled across the newsroom."
    },
    sections: {
      vi: [
        {
          heading: "Dữ liệu cơ bản",
          body:
            "Site lưu log truy cập, chỉ số phân tích trang và các cờ tương tác để cải thiện ưu tiên xuất bản. Dữ liệu này không được bán như một sản phẩm độc lập."
        },
        {
          heading: "Quảng cáo",
          body:
            "Khi AdSense được kích hoạt, các thành phần quảng cáo chỉ chạy ở những trang được đánh dấu ad eligible và phải tuân thủ chính sách của Google."
        }
      ],
      en: [
        {
          heading: "Basic Data",
          body:
            "The site stores access logs, page analytics, and interaction flags to improve publishing priorities. This data is not sold as a standalone product."
        },
        {
          heading: "Advertising",
          body:
            "When AdSense is enabled, ad components only run on pages marked as ad eligible and must comply with Google policies."
        }
      ]
    }
  },
  {
    key: "terms",
    titles: { vi: "Điều khoản sử dụng", en: "Terms of Use" },
    intros: {
      vi: "Việc sử dụng site đồng nghĩa với chấp nhận các nguyên tắc về attribution, liên kết ngoài và giới hạn trách nhiệm biên tập.",
      en: "Using the site means accepting the principles around attribution, outbound links, and editorial liability limits."
    },
    sections: {
      vi: [
        {
          heading: "Attribution và nguồn",
          body: "Mọi bài viết đều phải dẫn nguồn. Trích dẫn ngắn và nguồn gốc thông tin phải được giữ lại trong trang bài."
        },
        {
          heading: "Giới hạn trách nhiệm",
          body: "Nội dung được cung cấp nhằm mục đích thông tin, không thay thế tư vấn pháp lý, tài chính hoặc bảo mật chuyên biệt."
        }
      ],
      en: [
        {
          heading: "Attribution and Sources",
          body: "Every story keeps source references. Short quotations and information provenance must remain visible on article pages."
        },
        {
          heading: "Liability Limits",
          body: "Content is published for informational purposes and does not replace legal, financial, or specialized security advice."
        }
      ]
    }
  },
  {
    key: "editorial-policy",
    titles: { vi: "Chính sách biên tập", en: "Editorial Policy" },
    intros: {
      vi: "Newsroom vận hành bằng tín hiệu tự động nhưng không xem mọi tín hiệu là tương đương nhau. Mỗi bài có trạng thái xác minh riêng.",
      en: "The newsroom runs on automated signals but does not treat every signal equally. Each story carries its own verification state."
    },
    sections: {
      vi: [
        {
          heading: "Ba trạng thái xác minh",
          body:
            "Trend dành cho tín hiệu nóng từ cộng đồng hoặc social, Emerging dành cho chủ đề đã có corroboration, còn Verified dành cho bài có nguồn mạnh hoặc xác nhận chính thức."
        },
        {
          heading: "Quyền hiển thị quảng cáo",
          body:
            "Chỉ các bài vượt quality threshold và đạt ad eligible mới hiển thị quảng cáo. Bài trend vẫn có thể index để khám phá nhưng không chạy ads."
        }
      ],
      en: [
        {
          heading: "Three Verification States",
          body:
            "Trend covers hot community or social signals, Emerging covers topics with corroboration, and Verified covers stories backed by strong or official sources."
        },
        {
          heading: "Ad Eligibility",
          body:
            "Only stories that pass the quality threshold and are marked ad eligible may render ads. Trend stories can still be indexed for discovery but do not run ads."
        }
      ]
    }
  },
  {
    key: "publishing-standards",
    titles: { vi: "Nguyên tắc xuất bản", en: "Publishing Standards" },
    intros: {
      vi: "Mỗi bài trên Patrick Tech Media cần có tóm tắt riêng, bối cảnh rõ, nguồn tham khảo minh bạch và giọng biên tập nhất quán trước khi lên trang.",
      en: "Every story on Patrick Tech Media needs its own summary, clear context, transparent sourcing, and a consistent editorial voice before publication."
    },
    sections: {
      vi: [
        {
          heading: "Không đăng lại nguyên xi",
          body:
            "Newsroom không chủ đích sao chép cấu trúc nguyên bản của nguồn. Mỗi bài phải có phần tóm tắt riêng, giải thích tác động và khung nguồn rõ ràng."
        },
        {
          heading: "Giọng điệu biên tập",
          body:
            "Bài viết cần giữ giọng điệu báo chí mạch lạc, tránh phóng đại và phải cho người đọc biết điều gì đã xác nhận, điều gì còn đang được theo dõi."
        }
      ],
      en: [
        {
          heading: "No Mirror Publishing",
          body:
            "The newsroom does not intentionally mirror source structure. Every story needs its own summary, impact framing, and a clear source box."
        },
        {
          heading: "Editorial voice",
          body:
            "Stories should keep a clean, journalistic tone, avoid overclaiming, and make it clear which facts are confirmed and which details remain under watch."
        }
      ]
    }
  },
  {
    key: "corrections",
    titles: { vi: "Chính sách đính chính", en: "Corrections Policy" },
    intros: {
      vi: "Khi trạng thái câu chuyện thay đổi hoặc nguồn xác nhận mới xuất hiện, bài có thể được cập nhật, giảm hạng hoặc gỡ quảng cáo.",
      en: "When a story state changes or new confirmation appears, the article may be updated, downgraded, or stripped of ad eligibility."
    },
    sections: {
      vi: [
        {
          heading: "Cập nhật trạng thái",
          body: "Bài trend có thể được nâng lên emerging hoặc verified. Nếu thông tin suy yếu, bài cũng có thể bị hạ cấp trạng thái."
        },
        {
          heading: "Lịch sử chỉnh sửa",
          body: "Các cập nhật quan trọng nên được ghi ở phần cuối bài với thời gian và lý do chỉnh sửa."
        }
      ],
      en: [
        {
          heading: "State Updates",
          body: "Trend stories may be upgraded to emerging or verified. If the signal weakens, the story can also be downgraded."
        },
        {
          heading: "Revision History",
          body: "Major changes should be logged near the end of the article with a timestamp and reason."
        }
      ]
    }
  }
];

const CONTENT_TYPE_META = {
  NewsArticle: {
    labels: { vi: "Tin nhanh", en: "News" },
    segments: { vi: "tin-tuc", en: "news" }
  },
  EvergreenGuide: {
    labels: { vi: "Hướng dẫn", en: "Guides" },
    segments: { vi: "huong-dan", en: "guides" }
  },
  ComparisonPage: {
    labels: { vi: "So sánh", en: "Compare" },
    segments: { vi: "so-sanh", en: "compare" }
  },
  Roundup: {
    labels: { vi: "Tổng hợp", en: "Roundups" },
    segments: { vi: "tong-hop", en: "roundups" }
  }
};

const CLUSTERS = [
  {
    id: "viettel-edge-ai-pilot",
    topic: "ai",
    content_type: "NewsArticle",
    verification_state: "verified",
    quality_score: 92,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "soft",
    related_store_items: ["ai-workspace-bundle"],
    author_id: "mai-linh",
    published_at: "2026-03-24T03:10:00.000Z",
    updated_at: "2026-03-24T06:20:00.000Z",
    source_set: [
      {
        source_type: "official-site",
        source_name: "Viettel AI Lab",
        source_url: "https://example.com/viettel-ai-lab-edge-assistant",
        region: "VN",
        language: "vi",
        trust_tier: "official",
        published_at: "2026-03-24T01:45:00.000Z"
      },
      {
        source_type: "press",
        source_name: "Vietnam Tech Desk",
        source_url: "https://example.com/vietnam-tech-desk-edge-ai",
        region: "VN",
        language: "vi",
        trust_tier: "established-media",
        published_at: "2026-03-24T02:10:00.000Z"
      },
      {
        source_type: "official-social",
        source_name: "Viettel on LinkedIn",
        source_url: "https://example.com/viettel-linkedin-edge-assistant",
        region: "VN",
        language: "vi",
        trust_tier: "official-social",
        published_at: "2026-03-24T02:32:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "viettel-thu-nghiem-tro-ly-ai-edge-cho-doi-ban-hang",
        title: "Viettel thử nghiệm trợ lý AI edge cho đội bán hàng hiện trường",
        summary:
          "Một thử nghiệm mới của Viettel cho thấy hướng dùng mô hình AI gọn hơn ngay trên thiết bị để xử lý tác vụ hiện trường nhanh và ít phụ thuộc mạng.",
        dek:
          "Đây là tín hiệu đáng chú ý với các đội bán hàng, logistics và hỗ trợ kỹ thuật tại Việt Nam vì nó kéo AI từ cloud về gần người dùng hơn.",
        sections: [
          {
            heading: "Điều gì vừa xảy ra",
            body:
              "Viettel mô tả một chương trình pilot cho trợ lý AI edge phục vụ đội bán hàng hiện trường. Hệ thống ưu tiên các tác vụ ngắn như tóm tắt cuộc trao đổi, gợi ý bước tiếp theo và tra cứu thông tin sản phẩm ngay trên thiết bị."
          },
          {
            heading: "Vì sao câu chuyện này quan trọng",
            body:
              "Khi mô hình được đẩy sát thiết bị, thời gian phản hồi ổn định hơn ở môi trường mạng chập chờn. Đây là hướng rất hợp với Việt Nam, nơi nhiều đội ngũ vẫn làm việc di động và cần tốc độ hơn những tính năng AI quá nặng."
          },
          {
            heading: "Góc nhìn Patrick Tech",
            body:
              "Nếu pilot này mở rộng, thị trường sẽ cần thêm lớp phần mềm quản trị tài khoản, đồng bộ workflow và công cụ AI hỗ trợ vận hành chứ không chỉ chatbot thuần túy."
          }
        ]
      },
      en: {
        slug: "viettel-pilots-edge-ai-assistant-for-field-sales-teams",
        title: "Viettel pilots an edge AI assistant for field sales teams",
        summary:
          "A new Viettel pilot points to a lighter AI stack running closer to the device so field teams can get answers and workflow prompts without depending on perfect connectivity.",
        dek:
          "That matters for sales, logistics, and support teams in Vietnam, where practical latency and offline resilience often matter more than model size.",
        sections: [
          {
            heading: "What happened",
            body:
              "Viettel outlined a pilot for an edge AI assistant aimed at field sales. The system focuses on short tasks such as summarizing conversations, suggesting next actions, and pulling product information directly on-device."
          },
          {
            heading: "Why it matters",
            body:
              "Running more of the model stack near the device stabilizes response times when connectivity is weak. That is a strong fit for Vietnam-heavy field operations, where mobility and consistency often matter more than flashy prototypes."
          },
          {
            heading: "Patrick Tech angle",
            body:
              "If the pilot expands, the market will also need account management layers, workflow orchestration, and practical AI access tools rather than standalone chat interfaces."
          }
        ]
      }
    }
  },
  {
    id: "android-16-battery-intelligence",
    topic: "apps-software",
    content_type: "NewsArticle",
    verification_state: "emerging",
    quality_score: 84,
    ad_eligible: true,
    show_editorial_label: true,
    store_link_mode: "soft",
    related_store_items: ["creator-software-stack"],
    author_id: "mai-linh",
    published_at: "2026-03-23T19:10:00.000Z",
    updated_at: "2026-03-23T20:40:00.000Z",
    source_set: [
      {
        source_type: "official-site",
        source_name: "Android Beta Notes",
        source_url: "https://example.com/android-beta-battery-intelligence",
        region: "Global",
        language: "en",
        trust_tier: "official",
        published_at: "2026-03-23T17:15:00.000Z"
      },
      {
        source_type: "press",
        source_name: "Mobile Platform Watch",
        source_url: "https://example.com/mobile-platform-watch-battery-ai",
        region: "Global",
        language: "en",
        trust_tier: "established-media",
        published_at: "2026-03-23T18:25:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "android-16-them-bang-dieu-khien-pin-thong-minh",
        title: "Android 16 xuất hiện tín hiệu về bảng điều khiển pin thông minh mới",
        summary:
          "Các ghi chú beta và một số bản phân tích đầu tiên cho thấy Android 16 đang thử cách hiển thị pin theo thói quen sử dụng thay vì chỉ phần trăm còn lại.",
        dek:
          "Đây chưa phải xác nhận cuối cùng cho bản phát hành rộng, nhưng đủ để theo dõi vì nó tác động trực tiếp tới trải nghiệm người dùng và thiết bị làm việc.",
        sections: [
          {
            heading: "Tín hiệu ban đầu nói gì",
            body:
              "Một số thay đổi trong bản beta gợi ý Android 16 có thể gom thông tin pin theo ngữ cảnh như app ngốn pin, khung giờ tiêu thụ cao và gợi ý tối ưu theo thói quen."
          },
          {
            heading: "Điểm đáng chú ý với người dùng thực tế",
            body:
              "Nếu được giữ lại đến bản chính thức, thay đổi này giúp người dùng nhìn rõ nguyên nhân pin tụt thay vì đoán mò. Với thiết bị làm việc, đây là kiểu cải tiến nhỏ nhưng tác động đều đặn."
          },
          {
            heading: "Điều còn phải chờ xác nhận",
            body:
              "Hiện chưa có bảo đảm tất cả tính năng beta sẽ xuất hiện nguyên vẹn ở bản stable. Vì vậy bài này giữ trạng thái emerging và cần tiếp tục bám nguồn chính thức."
          }
        ]
      },
      en: {
        slug: "android-16-shows-signs-of-a-smarter-battery-dashboard",
        title: "Android 16 shows signs of a smarter battery dashboard",
        summary:
          "Beta notes and early platform reporting suggest Android 16 may present battery health and drain in a more contextual way instead of relying on a single percentage readout.",
        dek:
          "It is not a final launch confirmation yet, but it is the kind of UX change that can directly affect day-to-day device trust.",
        sections: [
          {
            heading: "What the early signals show",
            body:
              "Several beta changes point to battery information being grouped by context, including heavy apps, peak drain windows, and personalized optimization cues."
          },
          {
            heading: "Why regular users should care",
            body:
              "If the feature survives into the stable release, it could make battery behavior easier to understand instead of forcing users to guess which process is draining the phone."
          },
          {
            heading: "What still needs confirmation",
            body:
              "There is no guarantee every beta element makes it into the final build. That keeps the story in emerging status until broader official confirmation lands."
          }
        ]
      }
    }
  },
  {
    id: "handheld-emulator-overlay-rumor",
    topic: "gaming",
    content_type: "NewsArticle",
    verification_state: "trend",
    quality_score: 72,
    ad_eligible: false,
    show_editorial_label: true,
    store_link_mode: "off",
    related_store_items: [],
    author_id: "quang-huy",
    published_at: "2026-03-24T09:20:00.000Z",
    updated_at: "2026-03-24T09:20:00.000Z",
    source_set: [
      {
        source_type: "community",
        source_name: "Portable Gaming Forum",
        source_url: "https://example.com/portable-gaming-forum-overlay-thread",
        region: "Global",
        language: "en",
        trust_tier: "community-signal",
        published_at: "2026-03-24T08:05:00.000Z"
      },
      {
        source_type: "social-buzz",
        source_name: "Streamer Clips Feed",
        source_url: "https://example.com/streamer-clips-overlay-leak",
        region: "Global",
        language: "en",
        trust_tier: "social-buzz",
        published_at: "2026-03-24T08:18:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "cong-dong-ban-tan-ve-overlay-moi-cho-he-gia-lap-may-handheld",
        title: "Cộng đồng đang bàn tán về overlay mới cho hệ giả lập máy handheld",
        summary:
          "Một số đoạn clip và chủ đề forum đang đẩy lên giả thuyết về lớp overlay mới cho giao diện giả lập trên máy cầm tay, nhưng hiện chưa có xác nhận từ đội phát triển.",
        dek:
          "Bài này tồn tại như một điểm bắt trend để theo dõi chuyển động cộng đồng. Nó được index để khám phá nhưng chưa đủ điều kiện chạy quảng cáo.",
        sections: [
          {
            heading: "Câu chuyện đang lan như thế nào",
            body:
              "Tín hiệu đến từ clip ngắn, ảnh chụp giao diện và thảo luận trên forum về một lớp overlay mới giúp truy cập save state, shader và thư viện nhanh hơn."
          },
          {
            heading: "Điều gì đang thiếu",
            body:
              "Chưa có bài đăng chính thức, changelog hay tài khoản đội phát triển xác nhận. Vì vậy đây vẫn chỉ là trend watch, không nên xem như thông báo phát hành."
          },
          {
            heading: "Vì sao vẫn đáng theo dõi",
            body:
              "Nếu lớp overlay này có thật, trải nghiệm gaming handheld sẽ mượt hơn đáng kể. Với các cộng đồng nhỏ, đó là thay đổi đủ lớn để tạo nhu cầu thiết bị và phần mềm phụ trợ."
          }
        ]
      },
      en: {
        slug: "community-buzz-builds-around-a-new-overlay-for-handheld-emulation",
        title: "Community buzz builds around a new overlay for handheld emulation",
        summary:
          "Forum threads and short clips are fueling speculation about a new overlay layer for handheld emulation, but there is still no confirmation from the development team.",
        dek:
          "This page exists as a trend watch entry. It is indexed for discovery, but it does not qualify for ads while confirmation is still missing.",
        sections: [
          {
            heading: "How the story is spreading",
            body:
              "The signal comes from short clips, cropped interface captures, and forum posts suggesting a faster overlay for save states, shaders, and library access."
          },
          {
            heading: "What is still missing",
            body:
              "There is no official post, public changelog, or developer account confirmation. That keeps the item in trend-watch territory rather than release coverage."
          },
          {
            heading: "Why the signal still matters",
            body:
              "If the overlay is real, the quality-of-life gains for handheld players could be meaningful. That is enough to make the story worth tracking without overclaiming."
          }
        ]
      }
    }
  },
  {
    id: "luma-team-spaces-rollout",
    topic: "apps-software",
    content_type: "NewsArticle",
    verification_state: "verified",
    quality_score: 90,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "soft",
    related_store_items: ["creator-software-stack"],
    author_id: "mai-linh",
    published_at: "2026-03-22T15:00:00.000Z",
    updated_at: "2026-03-22T17:25:00.000Z",
    source_set: [
      {
        source_type: "official-site",
        source_name: "Luma Product Blog",
        source_url: "https://example.com/luma-team-spaces",
        region: "Global",
        language: "en",
        trust_tier: "official",
        published_at: "2026-03-22T13:10:00.000Z"
      },
      {
        source_type: "official-social",
        source_name: "Luma on X",
        source_url: "https://example.com/luma-x-team-spaces",
        region: "Global",
        language: "en",
        trust_tier: "official-social",
        published_at: "2026-03-22T13:40:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "luma-rollout-khong-gian-lam-viec-chung-cho-doi-editor",
        title: "Luma rollout không gian làm việc chung cho đội editor và creator",
        summary:
          "Luma đang đẩy mạnh tính năng team spaces để gom dự án, asset và lịch chỉnh sửa về một không gian điều phối rõ ràng hơn.",
        dek:
          "Với các team sản xuất nội dung nhiều người, thay đổi này đáng chú ý hơn chính tính năng AI vì nó chạm vào nhịp cộng tác hằng ngày.",
        sections: [
          {
            heading: "Thay đổi chính",
            body:
              "Không gian team mới gom asset, các bản dựng, lịch chỉnh sửa và luồng phê duyệt vào một mặt phẳng quản trị duy nhất. Mục tiêu rõ ràng là giảm việc nhảy qua lại giữa công cụ chat, ổ cứng và lịch riêng."
          },
          {
            heading: "Tác động thực tế",
            body:
              "Nhiều công cụ sáng tạo nói nhiều về AI tạo nội dung, nhưng điểm nghẽn ở đội nhỏ thường nằm ở phối hợp. Vì vậy đây là kiểu cập nhật có thể đổi hiệu quả làm việc thực chứ không chỉ tạo hiệu ứng marketing."
          },
          {
            heading: "Điều đáng theo dõi tiếp",
            body:
              "Nếu Luma mở API hoặc tích hợp chặt hơn với kho file ngoài, team editor sẽ có lý do ở lại dài hơn thay vì chỉ dùng như công cụ điểm chạm ngắn."
          }
        ]
      },
      en: {
        slug: "luma-rolls-out-shared-workspaces-for-editors-and-creators",
        title: "Luma rolls out shared workspaces for editors and creators",
        summary:
          "Luma is pushing a team-spaces workflow that gathers projects, assets, and edit schedules into a more explicit coordination layer.",
        dek:
          "For collaborative creator teams, that may matter more than any single AI feature because the real bottleneck is often coordination, not generation.",
        sections: [
          {
            heading: "What changed",
            body:
              "The new team space gathers assets, builds, schedules, and approval steps into one working surface. The intended win is less hopping between chat, storage, and side spreadsheets."
          },
          {
            heading: "Why it matters in practice",
            body:
              "Creative tools often talk loudly about AI generation, but small teams typically lose more time to coordination drift. That makes this update more operationally important than it first sounds."
          },
          {
            heading: "What to watch next",
            body:
              "If Luma opens more APIs or deeper integrations with external storage, editor teams will have a stronger reason to keep it as a core workspace rather than a short-stop utility."
          }
        ]
      }
    }
  },
  {
    id: "messaging-app-dark-mode-leak",
    topic: "apps-software",
    content_type: "NewsArticle",
    verification_state: "trend",
    quality_score: 70,
    ad_eligible: false,
    show_editorial_label: true,
    store_link_mode: "off",
    related_store_items: [],
    author_id: "mai-linh",
    published_at: "2026-03-23T05:20:00.000Z",
    updated_at: "2026-03-23T05:20:00.000Z",
    source_set: [
      {
        source_type: "social-buzz",
        source_name: "Feature Leak Threads",
        source_url: "https://example.com/leak-threads-dark-mode",
        region: "Global",
        language: "en",
        trust_tier: "social-buzz",
        published_at: "2026-03-23T04:50:00.000Z"
      },
      {
        source_type: "community",
        source_name: "Beta UI Community",
        source_url: "https://example.com/beta-ui-community-dark-mode",
        region: "Global",
        language: "en",
        trust_tier: "community-signal",
        published_at: "2026-03-23T04:55:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "dark-mode-moi-cua-mot-app-nhan-tin-dang-gay-ban-tan-tren-social",
        title: "Dark mode mới của một app nhắn tin đang gây bàn tán trên social",
        summary:
          "Một loạt ảnh chụp beta đang khiến cộng đồng chú ý vì giao diện dark mode mới có vẻ đi theo hướng đậm chất dashboard hơn.",
        dek:
          "Hiện chưa có xác nhận từ đội sản phẩm, nên đây là bài social pulse được giữ để theo dõi xu hướng chứ không phải công bố chính thức.",
        sections: [
          {
            heading: "Tín hiệu đang đến từ đâu",
            body:
              "Nguồn lan truyền chủ yếu là các tài khoản chuyên săn tính năng beta và hội nhóm thiết kế giao diện. Tất cả hiện mới dừng ở ảnh chụp màn hình và suy đoán."
          },
          {
            heading: "Vì sao dân sản phẩm vẫn quan tâm",
            body:
              "Những đổi mới ở ứng dụng nhắn tin thường là tín hiệu cho xu hướng UI mobile lớn hơn, đặc biệt khi nhiều app đang đẩy trải nghiệm vừa chat vừa quản trị."
          },
          {
            heading: "Trạng thái của bài",
            body:
              "Bài này được index để bắt sóng chủ đề đang lan, nhưng chưa chạy quảng cáo và chưa nên xem là thông báo phát hành xác nhận."
          }
        ]
      },
      en: {
        slug: "a-new-dark-mode-for-a-messaging-app-is-circulating-across-social",
        title: "A new dark mode for a messaging app is circulating across social",
        summary:
          "A wave of beta screenshots has triggered conversation around a darker, more dashboard-like interface for a messaging app, but there is still no official confirmation.",
        dek:
          "This is a social pulse page meant to track a fast-moving signal, not a confirmed product announcement.",
        sections: [
          {
            heading: "Where the signal comes from",
            body:
              "The material is spreading through feature leak accounts and UI-focused communities. Right now the evidence is limited to screenshots and interpretation."
          },
          {
            heading: "Why product teams still care",
            body:
              "Messaging app redesigns often point to wider mobile UI shifts, especially when platforms are trying to merge communication and lightweight task management."
          },
          {
            heading: "Current status",
            body:
              "The story is indexed to capture discovery demand, but it remains outside ad inventory until stronger confirmation exists."
          }
        ]
      }
    }
  },
  {
    id: "patrick-tech-weekly-roundup",
    topic: "internet-business-tech",
    content_type: "Roundup",
    verification_state: "verified",
    quality_score: 89,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "soft",
    related_store_items: ["ai-workspace-bundle", "creator-software-stack"],
    author_id: "mai-linh",
    published_at: "2026-03-24T11:30:00.000Z",
    updated_at: "2026-03-24T12:00:00.000Z",
    source_set: [
      {
        source_type: "internal-roundup",
        source_name: "Patrick Tech Media Desk",
        source_url: "https://example.com/internal-roundup-source",
        region: "VN",
        language: "vi",
        trust_tier: "editorial",
        published_at: "2026-03-24T11:25:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "ban-tin-cong-nghe-cuoi-tuan-viet-nam-va-the-gioi",
        title: "Bản tin cuối tuần: nhịp công nghệ Việt Nam và thế giới",
        summary:
          "Roundup này gom những chuyển động đáng theo dõi nhất trong tuần từ AI, thiết bị, app làm việc đến các tín hiệu social đang nổi lên nhanh.",
        dek:
          "Thay vì chỉ liệt kê headline, bản tổng hợp này gom các tín hiệu theo mức độ ảnh hưởng để giúp độc giả quyết định nên đọc sâu chủ đề nào.",
        sections: [
          {
            heading: "Nhóm chuyện cần đọc ngay",
            body:
              "Pilot AI edge của Viettel, không gian làm việc mới cho editor và sóng laptop NPU ở châu Á là ba câu chuyện có xác nhận tốt và tác động thực tế rõ nhất tuần này."
          },
          {
            heading: "Nhóm chuyện nên để ý nhưng chưa chốt",
            body:
              "Dashboard pin Android mới và các thay đổi ở lớp UI mobile vẫn cần thêm xác nhận. Đây là kiểu chủ đề nên theo dõi hằng ngày thay vì coi là thông tin đã xong."
          },
          {
            heading: "Từ trend sang cơ hội",
            body:
              "Những sóng social nhanh không chỉ để kéo traffic. Chúng còn giúp newsroom quyết định chủ đề evergreen hoặc comparison nào nên được đầu tư tiếp theo."
          }
        ]
      },
      en: {
        slug: "the-weekly-brief-vietnam-and-global-tech-moves",
        title: "The weekly brief: Vietnam and global tech moves",
        summary:
          "This roundup packages the week’s most useful shifts across AI, devices, work apps, and fast social signals instead of treating every headline as equally important.",
        dek:
          "The goal is to help readers quickly decide which developments deserve deeper attention and which ones should stay on a watch list.",
        sections: [
          {
            heading: "What deserves immediate attention",
            body:
              "Viettel’s edge AI pilot, Luma’s team-space rollout, and the NPU laptop wave in Asia carry the clearest combination of confirmation and practical impact."
          },
          {
            heading: "What remains worth watching",
            body:
              "The smarter Android battery dashboard and several mobile UI shifts still need more confirmation. These are watch-list items rather than settled stories."
          },
          {
            heading: "How trend signals become durable coverage",
            body:
              "Fast social signals are not only about pageviews. They help the newsroom decide which evergreen guides and comparison pages deserve the next layer of investment."
          }
        ]
      }
    }
  },
  {
    id: "best-ai-note-taking-tools",
    topic: "ai",
    content_type: "EvergreenGuide",
    verification_state: "verified",
    quality_score: 95,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "full",
    related_store_items: ["ai-workspace-bundle"],
    author_id: "mai-linh",
    published_at: "2026-03-20T08:15:00.000Z",
    updated_at: "2026-03-24T07:10:00.000Z",
    source_set: [
      {
        source_type: "editorial-research",
        source_name: "Patrick Tech Research Desk",
        source_url: "https://example.com/editorial-research-note-taking",
        region: "Global",
        language: "en",
        trust_tier: "editorial",
        published_at: "2026-03-20T07:00:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "top-cong-cu-ghi-chu-ai-cho-doi-lam-viec-song-ngu",
        title: "Top công cụ ghi chú AI cho đội làm việc song ngữ",
        summary:
          "Bài evergreen này chọn ra những công cụ ghi chú AI thực sự hợp với đội vừa dùng tiếng Việt vừa dùng tiếng Anh trong họp, tài liệu và bàn giao.",
        dek:
          "Tiêu chí ưu tiên là tóm tắt tốt, tìm lại ý nhanh và không làm gãy quy trình giữa meeting, chat và tài liệu nội bộ.",
        sections: [
          {
            heading: "Tiêu chí chọn công cụ",
            body:
              "Chúng tôi ưu tiên khả năng tóm tắt hội thoại, tìm lại quyết định cũ, hỗ trợ đa ngôn ngữ và xuất dữ liệu sạch sang wiki hoặc task board."
          },
          {
            heading: "Nhóm công cụ đáng chú ý",
            body:
              "Các công cụ thắng điểm thường không cố làm mọi thứ. Chúng mạnh ở một hoặc hai việc như transcript tốt, khung hành động rõ hoặc tìm lại ngữ cảnh rất nhanh."
          },
          {
            heading: "Lời khuyên triển khai",
            body:
              "Đội nhỏ nên bắt đầu bằng một stack đơn giản: ghi lại cuộc họp, tóm tắt tự động và đẩy action items sang nơi theo dõi công việc. Đừng bật quá nhiều lớp AI cùng lúc."
          }
        ]
      },
      en: {
        slug: "best-ai-note-taking-tools-for-bilingual-teams",
        title: "Best AI note-taking tools for bilingual teams",
        summary:
          "This evergreen guide highlights note-taking tools that actually help teams working across Vietnamese and English meetings, documents, and handoffs.",
        dek:
          "The priority is not novelty. It is reliable summarization, fast retrieval, and a clean bridge between meetings, chat, and internal documentation.",
        sections: [
          {
            heading: "What the evaluation prioritizes",
            body:
              "The shortlist rewards tools that summarize conversations well, surface old decisions quickly, support multiple languages, and export cleanly into wikis or task systems."
          },
          {
            heading: "What the strongest tools share",
            body:
              "The most useful products do not try to do everything. They usually excel at one or two core jobs such as transcript quality, action framing, or contextual retrieval."
          },
          {
            heading: "How small teams should roll them out",
            body:
              "Start with a narrow stack: record the meeting, generate a summary, and send action items into the system where work is already tracked. Avoid stacking too many AI layers at once."
          }
        ]
      }
    }
  },
  {
    id: "chatgpt-gemini-claude-freelancer-compare",
    topic: "ai",
    content_type: "ComparisonPage",
    verification_state: "verified",
    quality_score: 94,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "full",
    related_store_items: ["ai-workspace-bundle"],
    author_id: "mai-linh",
    published_at: "2026-03-19T12:35:00.000Z",
    updated_at: "2026-03-24T04:00:00.000Z",
    source_set: [
      {
        source_type: "editorial-research",
        source_name: "Patrick Tech Bench Notes",
        source_url: "https://example.com/bench-notes-freelancer-compare",
        region: "Global",
        language: "en",
        trust_tier: "editorial",
        published_at: "2026-03-19T11:20:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "chatgpt-gemini-hay-claude-hop-hon-cho-freelancer-viet",
        title: "ChatGPT, Gemini hay Claude hợp hơn cho freelancer Việt?",
        summary:
          "Bài so sánh này không chấm điểm theo hào nhoáng. Nó tập trung vào tác vụ freelancer dùng mỗi ngày như viết nháp, sửa tiếng Anh, nghiên cứu và trả lời khách hàng.",
        dek:
          "Nếu mục tiêu là chọn một công cụ dùng thật mỗi ngày, câu hỏi quan trọng không phải model nào giỏi nhất tuyệt đối mà là model nào ít ma sát nhất với công việc của bạn.",
        sections: [
          {
            heading: "Khi nào ChatGPT hợp hơn",
            body:
              "ChatGPT phù hợp khi bạn cần một công cụ đa năng, giao diện ổn định và hệ sinh thái plugin hoặc workflow đã quen thuộc với đội nhóm."
          },
          {
            heading: "Khi nào Gemini đáng cân nhắc",
            body:
              "Gemini hợp với người đang sống trong hệ Google Workspace và muốn giữ công việc gần tài liệu, email và lịch mà không phải nối quá nhiều công cụ bên ngoài."
          },
          {
            heading: "Claude mạnh ở đâu",
            body:
              "Claude thường sáng ở các tác vụ đọc dài, sắp xếp lập luận và giữ giọng viết mềm. Với người làm proposal, research hoặc phân tích, đây là điểm cộng lớn."
          }
        ]
      },
      en: {
        slug: "chatgpt-gemini-or-claude-which-fits-vietnam-freelancers-better",
        title: "ChatGPT, Gemini, or Claude: which fits Vietnam freelancers better?",
        summary:
          "This comparison does not reward flash. It focuses on daily freelancer work such as drafting, polishing English, researching, and replying to clients.",
        dek:
          "If the goal is to pick a tool you will actually keep open every day, the most important question is not which model wins a benchmark but which one creates the least friction.",
        sections: [
          {
            heading: "When ChatGPT fits better",
            body:
              "ChatGPT makes sense when you want a broad tool, a stable interface, and a workflow ecosystem that many teams already know how to use."
          },
          {
            heading: "When Gemini is worth a serious look",
            body:
              "Gemini is a better fit when your work already lives in Google Workspace and you want email, documents, and scheduling to stay close together."
          },
          {
            heading: "Where Claude stands out",
            body:
              "Claude tends to shine in long reading, argument structuring, and soft writing tone. That matters for proposal work, research-heavy tasks, and analysis."
          }
        ]
      }
    }
  },
  {
    id: "asia-npu-laptop-wave",
    topic: "devices",
    content_type: "NewsArticle",
    verification_state: "emerging",
    quality_score: 86,
    ad_eligible: true,
    show_editorial_label: true,
    store_link_mode: "soft",
    related_store_items: ["ai-workspace-bundle"],
    author_id: "quang-huy",
    published_at: "2026-03-21T02:10:00.000Z",
    updated_at: "2026-03-21T05:35:00.000Z",
    source_set: [
      {
        source_type: "press",
        source_name: "Asia Device Report",
        source_url: "https://example.com/asia-device-report-npu-wave",
        region: "APAC",
        language: "en",
        trust_tier: "established-media",
        published_at: "2026-03-21T00:20:00.000Z"
      },
      {
        source_type: "official-site",
        source_name: "Vendor Launch Notes",
        source_url: "https://example.com/vendor-launch-notes-npu",
        region: "APAC",
        language: "en",
        trust_tier: "official",
        published_at: "2026-03-21T01:05:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "song-laptop-npu-tang-toc-tai-thi-truong-chau-a",
        title: "Sóng laptop có NPU đang tăng tốc ở thị trường châu Á",
        summary:
          "Nhiều hãng đang đồng loạt đẩy mạnh laptop có NPU và các gói phần mềm AI đi kèm, tạo ra một nhịp cạnh tranh mới ở phân khúc làm việc di động.",
        dek:
          "Tín hiệu này chưa đủ để chốt người dùng phổ thông sẽ đổi máy ngay, nhưng nó cho thấy phần cứng AI đang tiến gần hơn tới điểm thực dụng.",
        sections: [
          {
            heading: "Điểm mới của đợt sóng này",
            body:
              "Khác với các đợt marketing AI trước, nhiều hãng lần này bán cùng câu chuyện phần mềm, pin và workflow chứ không chỉ đẩy thông số NPU."
          },
          {
            heading: "Điều doanh nghiệp nhỏ nên đọc kỹ",
            body:
              "Laptop có NPU sẽ chỉ thật sự đáng tiền nếu stack phần mềm tận dụng được lợi thế đó. Nếu không, nó dễ trở thành cấu hình đẹp trên giấy nhưng lợi ích mờ nhạt."
          },
          {
            heading: "Vì sao bài vẫn ở trạng thái emerging",
            body:
              "Dù nguồn khá tốt, thị trường vẫn đang ở giai đoạn sớm. Cần thêm dữ liệu giá bán, pin thực tế và hành vi người mua trước khi xem đây là làn sóng đã chín."
          }
        ]
      },
      en: {
        slug: "the-npu-laptop-wave-is-accelerating-across-asia",
        title: "The NPU laptop wave is accelerating across Asia",
        summary:
          "Vendors are increasingly bundling AI-focused laptops with workflow software and battery claims, creating a more serious competitive rhythm in mobile productivity hardware.",
        dek:
          "That still does not mean mainstream buyers will upgrade immediately, but it suggests on-device AI is inching toward practical relevance.",
        sections: [
          {
            heading: "What is different this time",
            body:
              "Unlike earlier AI-heavy launch cycles, vendors are now tying NPU messaging to software bundles, battery expectations, and day-to-day workflow promises."
          },
          {
            heading: "What small businesses should read carefully",
            body:
              "NPU hardware only becomes meaningful when the surrounding software stack actually uses it. Otherwise the pitch risks becoming specification theater."
          },
          {
            heading: "Why the story remains emerging",
            body:
              "The sourcing is solid, but the market is still early. More pricing data, battery evidence, and buyer behavior are needed before this becomes a fully settled trend."
          }
        ]
      }
    }
  },
  {
    id: "passkeys-guide-vietnam-teams",
    topic: "security",
    content_type: "EvergreenGuide",
    verification_state: "verified",
    quality_score: 96,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "full",
    related_store_items: ["secure-access-kit"],
    author_id: "thao-nguyen",
    published_at: "2026-03-18T06:45:00.000Z",
    updated_at: "2026-03-24T03:35:00.000Z",
    source_set: [
      {
        source_type: "editorial-research",
        source_name: "Patrick Tech Security Desk",
        source_url: "https://example.com/security-desk-passkeys-guide",
        region: "VN",
        language: "vi",
        trust_tier: "editorial",
        published_at: "2026-03-18T05:30:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "cach-trien-khai-passkeys-cho-team-viet-ma-khong-gay-vo-quy-trinh",
        title: "Cách triển khai passkeys cho team Việt mà không gây vỡ quy trình",
        summary:
          "Passkeys nghe có vẻ đơn giản, nhưng đội nhỏ thường vấp ở khâu bàn giao thiết bị, chia sẻ tài khoản và fallback khi người dùng đổi máy.",
        dek:
          "Bài hướng dẫn này ưu tiên góc nhìn triển khai, không chỉ nhắc lại lợi ích bảo mật theo kiểu giáo khoa.",
        sections: [
          {
            heading: "Bắt đầu từ đâu",
            body:
              "Nên chọn một nhóm tài khoản có vòng đời rõ như email nội bộ, công cụ chat và nơi chứa tài liệu quan trọng. Đừng triển khai đồng loạt cho mọi hệ thống ngay tuần đầu."
          },
          {
            heading: "Điểm hay bị bỏ quên",
            body:
              "Nhiều đội quên chuẩn bị quy trình khi nhân sự đổi máy, mất thiết bị hoặc cần trao quyền tạm thời. Passkeys tốt nhưng chỉ phát huy khi kịch bản bàn giao được thiết kế trước."
          },
          {
            heading: "Góc nhìn thực dụng",
            body:
              "Nếu team còn dùng nhiều tài khoản chia sẻ, hãy xử lý governance trước khi bàn đến công nghệ. Khi lớp tổ chức rõ ràng, passkeys mới tạo ra lợi ích bền."
          }
        ]
      },
      en: {
        slug: "how-to-roll-out-passkeys-for-vietnam-teams-without-breaking-workflows",
        title: "How to roll out passkeys for Vietnam teams without breaking workflows",
        summary:
          "Passkeys sound simple, but small teams usually struggle with device handoff, shared accounts, and fallback paths when people switch hardware.",
        dek:
          "This guide focuses on implementation realities instead of repeating generic security talking points.",
        sections: [
          {
            heading: "Where to start",
            body:
              "Begin with account groups that have a clear lifecycle, such as internal email, chat tools, and document storage. Avoid switching every system at once during the first week."
          },
          {
            heading: "What teams often forget",
            body:
              "Many teams skip planning for device replacement, lost hardware, or temporary access needs. Passkeys help most when handoff scenarios are designed in advance."
          },
          {
            heading: "The practical view",
            body:
              "If your team still relies on shared accounts, governance needs attention before technology does. Once ownership is clear, passkeys become much more durable."
          }
        ]
      }
    }
  },
  {
    id: "vietnam-fiber-home-lab-trend",
    topic: "internet-business-tech",
    content_type: "EvergreenGuide",
    verification_state: "verified",
    quality_score: 91,
    ad_eligible: true,
    show_editorial_label: false,
    store_link_mode: "soft",
    related_store_items: ["secure-access-kit"],
    author_id: "quang-huy",
    published_at: "2026-03-17T10:15:00.000Z",
    updated_at: "2026-03-23T10:30:00.000Z",
    source_set: [
      {
        source_type: "editorial-research",
        source_name: "Patrick Tech Infrastructure Notes",
        source_url: "https://example.com/infrastructure-notes-home-lab",
        region: "VN",
        language: "vi",
        trust_tier: "editorial",
        published_at: "2026-03-17T09:20:00.000Z"
      }
    ],
    content: {
      vi: {
        slug: "vi-sao-home-lab-va-fiber-cao-cap-dang-duoc-dan-team-nho-chu-y",
        title: "Vì sao home lab và gói fiber cao cấp đang được dân team nhỏ chú ý",
        summary:
          "Không chỉ dân kỹ thuật, nhiều đội nội dung và thương mại số cũng bắt đầu quan tâm tới home lab mini và đường truyền ổn định hơn để chạy dịch vụ nội bộ.",
        dek:
          "Đây là bài evergreen giải thích vì sao xu hướng này tăng ở Việt Nam và khi nào nó là khoản đầu tư hợp lý thay vì chỉ là món đồ chơi kỹ thuật.",
        sections: [
          {
            heading: "Nhu cầu nào đang kéo xu hướng",
            body:
              "Các đội nhỏ muốn tự giữ file, tự đồng bộ nội bộ, chạy automation hoặc media library nhẹ mà không phụ thuộc hoàn toàn vào cloud. Điều đó kéo theo nhu cầu đường truyền và phần cứng ổn định hơn."
          },
          {
            heading: "Khi nào nên đầu tư",
            body:
              "Nếu team đã có quy trình rõ, dữ liệu đủ nhiều và chi phí đám mây bắt đầu khó kiểm soát, home lab mini có thể là lựa chọn đáng cân nhắc."
          },
          {
            heading: "Điểm cần tỉnh táo",
            body:
              "Đừng biến home lab thành dự án sở thích tốn thời gian. Mục tiêu phải là ổn định vận hành, backup rõ ràng và quyền truy cập có kỷ luật."
          }
        ]
      },
      en: {
        slug: "why-home-labs-and-premium-fiber-are-catching-on-with-small-digital-teams",
        title: "Why home labs and premium fiber are catching on with small digital teams",
        summary:
          "It is no longer just hobbyist infrastructure. More content and commerce teams are exploring mini home labs and more reliable fiber to run internal services.",
        dek:
          "This guide explains why the pattern is growing in Vietnam and when it is a sensible investment rather than a side-project distraction.",
        sections: [
          {
            heading: "What is pulling the trend",
            body:
              "Teams want to keep files, run internal automation, and maintain lightweight media libraries without relying entirely on cloud workflows. That increases demand for better connectivity and stable local hardware."
          },
          {
            heading: "When it makes sense",
            body:
              "If the workflow is already clear, the data footprint is growing, and cloud costs are becoming harder to justify, a small home lab can become a practical option."
          },
          {
            heading: "Where teams should stay disciplined",
            body:
              "Do not let a home lab become a hobby detour. The goal is stable operations, clean backups, and predictable access control."
          }
        ]
      }
    }
  }
];

export function getTopics() {
  return TOPICS.map((topic) => ({ ...topic }));
}

export function getAuthors() {
  return AUTHORS.map((author) => ({ ...author }));
}

export function getStoreItems() {
  return STORE_ITEMS.map((item) => ({ ...item }));
}

export function getPolicyPages() {
  return POLICY_PAGES.map((page) => ({ ...page }));
}

export function getContentTypeMeta() {
  return { ...CONTENT_TYPE_META };
}

export function buildArticles() {
  return CLUSTERS.flatMap((cluster) => buildLocalizedArticles(cluster));
}

function buildLocalizedArticles(cluster) {
  return ["vi", "en"].map((language) => {
    const localized = cluster.content[language];
    const typeMeta = CONTENT_TYPE_META[cluster.content_type];
    const topic = TOPICS.find((entry) => entry.id === cluster.topic);

    return {
      id: `${cluster.id}-${language}`,
      cluster_id: cluster.id,
      language,
      topic: cluster.topic,
      topic_label: topic.labels[language],
      topic_slug: topic.slugs[language],
      topic_accent: topic.accent,
      content_type: cluster.content_type,
      content_type_label: typeMeta.labels[language],
      path_segment: typeMeta.segments[language],
      slug: localized.slug,
      title: localized.title,
      summary: localized.summary,
      dek: localized.dek,
      sections: localized.sections.map((section) => ({ ...section })),
      verification_state: cluster.verification_state,
      quality_score: cluster.quality_score,
      ad_eligible: cluster.ad_eligible,
      show_editorial_label: cluster.show_editorial_label,
      indexable: true,
      store_link_mode: cluster.store_link_mode,
      related_store_items: [...cluster.related_store_items],
      source_set: cluster.source_set.map((source) => ({ ...source })),
      author_id: cluster.author_id,
      published_at: cluster.published_at,
      updated_at: cluster.updated_at,
      href: `/${language}/${typeMeta.segments[language]}/${localized.slug}`
    };
  });
}
