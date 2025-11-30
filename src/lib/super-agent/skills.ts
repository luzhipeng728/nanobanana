// 预设技能库 - 7个完整的提示词技能模板

import type { SkillTemplate } from '@/types/super-agent';

export const SKILL_LIBRARY: Record<string, SkillTemplate> = {

  // ========== 技能1: 产品名片展示 ==========
  'product-showcase': {
    metadata: {
      id: 'product-showcase',
      name: '产品名片展示图',
      description: '生成手持透明卡片风格的产品展示图，适合展示App、平台、品牌等',
      keywords: ['产品展示', '名片', '手持卡片', '透明卡片', 'App展示', '品牌展示', '玻璃卡片', '霓虹灯效果', '产品宣传', '应用展示'],
      category: 'product-display',
      difficulty: 'medium',
      requiredInputs: ['产品名称', '产品功能列表'],
      optionalInputs: ['用户名', '网站URL', 'slogan', '品牌颜色']
    },
    basePrompt: `A hand holding a glowing transparent glass card in the dark, the card displays {{PRODUCT_TYPE}} interface. The card shows a logo and title "{{PRODUCT_NAME}}" {{BADGE_TEXT}}, {{USERNAME_TEXT}}{{SLOGAN_TEXT}}{{URL_TEXT}}, featuring {{FEATURE_ICONS}}. The card has beautiful gradient neon edge lighting in {{COLORS}} colors, holographic glass material effect. Photorealistic, cinematic dramatic lighting, pure black background, shallow depth of field, professional photography, ultra high quality, 8K resolution.`,
    variables: [
      {
        name: 'PRODUCT_NAME',
        description: '产品名称，将显示在卡片标题位置',
        type: 'text',
        required: true,
        examples: ['智绘无限', 'CreativeAI', '灵感工坊']
      },
      {
        name: 'PRODUCT_TYPE',
        description: '产品类型描述',
        type: 'text',
        required: true,
        defaultValue: 'a creative AI platform',
        examples: ['a creative AI platform', 'a mobile app', 'a SaaS dashboard']
      },
      {
        name: 'SLOGAN_TEXT',
        description: '产品标语',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: [', tagline "AI无限画布 · 创意无界"', ', tagline "让创作更简单"', '']
      },
      {
        name: 'FEATURE_ICONS',
        description: '功能图标列表',
        type: 'list',
        required: true,
        examples: ['tool icons with labels: 图像生成 (Generator), AI智能体 (Agent), 视频生成 (Video)']
      },
      {
        name: 'COLORS',
        description: '霓虹灯颜色',
        type: 'color',
        required: false,
        defaultValue: 'purple, pink and cyan',
        examples: ['purple, pink and cyan', 'blue and gold', 'green and white']
      },
      {
        name: 'USERNAME_TEXT',
        description: '用户名显示',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['username "@luzhipeng", ', '']
      },
      {
        name: 'URL_TEXT',
        description: '网站URL',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: [', website URL "canvas.luzhipeng.com"', '']
      },
      {
        name: 'BADGE_TEXT',
        description: '认证徽章',
        type: 'text',
        required: false,
        defaultValue: 'with a verified blue badge',
        examples: ['with a verified blue badge', 'with a premium gold badge', '']
      }
    ],
    examples: [
      {
        userRequest: '帮我生成一个产品展示图，展示我的AI绘画平台"智绘无限"，功能有图像生成、AI智能体、视频生成',
        filledPrompt: 'A hand holding a glowing transparent glass card in the dark, the card displays a creative AI platform interface. The card shows a logo and title "智绘无限" with a verified blue badge, tagline "AI无限画布 · 创意无界", featuring tool icons with labels: 图像生成 (Generator), AI智能体 (Agent), 视频生成 (Video). The card has beautiful gradient neon edge lighting in purple, pink and cyan colors, holographic glass material effect. Photorealistic, cinematic dramatic lighting, pure black background, shallow depth of field, professional photography, ultra high quality, 8K resolution.',
        chineseTexts: ['智绘无限', 'AI无限画布 · 创意无界', '图像生成', 'AI智能体', '视频生成']
      }
    ],
    qualityChecklist: [
      '产品名称是否完整显示（中文无乱码）',
      '功能列表是否清晰可读',
      '霓虹灯效果是否美观',
      '卡片是否有玻璃质感',
      '背景是否为纯黑色'
    ],
    commonIssues: [
      {
        issue: '中文文字显示不完整或乱码',
        solution: '使用更少的中文文字，或将长文字拆分',
        promptFix: 'with Chinese text "XXX" clearly and completely displayed'
      },
      {
        issue: '功能图标过于拥挤',
        solution: '减少功能数量（建议4-5个）',
        promptFix: 'with generous spacing between each icon'
      },
      {
        issue: '卡片不够透明',
        solution: '强调玻璃材质',
        promptFix: 'highly transparent frosted glass with visible light refraction'
      }
    ]
  },

  // ========== 技能2: 基础教程图 ==========
  'tutorial-infographic': {
    metadata: {
      id: 'tutorial-infographic',
      name: '基础玩法教程图',
      description: '生成分步骤的产品使用教程图，现代UI风格，适合展示操作流程',
      keywords: ['教程', '使用说明', '操作指南', '步骤图', '流程图', '新手引导', 'UI教程', '功能介绍', '使用方法', '操作流程'],
      category: 'tutorial',
      difficulty: 'hard',
      requiredInputs: ['产品名称', '步骤列表'],
      optionalInputs: ['品牌颜色', '风格偏好']
    },
    basePrompt: `A modern step-by-step tutorial infographic with {{STEP_COUNT}} numbered steps arranged horizontally. Each step shows a clear UI screenshot or illustration with a numbered circle badge and Chinese label below. {{STEPS_CONTENT}} Clean modern design with {{COLORS}} accent colors, dark gradient background, glassmorphism card style, soft glow effects, arrows connecting each step. All Chinese text must be exactly as specified with no other text. Professional infographic style, 8K resolution.`,
    variables: [
      {
        name: 'STEP_COUNT',
        description: '步骤数量',
        type: 'text',
        required: true,
        examples: ['4', '3', '5']
      },
      {
        name: 'STEPS_CONTENT',
        description: '步骤内容，每个步骤包含：描述 + 中文标签',
        type: 'list',
        required: true,
        examples: ['Step 1 shows a sidebar with tool selection, Chinese label "选择工具". Step 2 shows dragging to canvas, Chinese label "拖拽到画布".']
      },
      {
        name: 'COLORS',
        description: '主题色',
        type: 'color',
        required: false,
        defaultValue: 'purple and cyan',
        examples: ['purple and cyan', 'blue and orange']
      }
    ],
    examples: [
      {
        userRequest: '做一个4步骤的使用教程',
        filledPrompt: 'A modern step-by-step tutorial infographic with 4 numbered steps arranged horizontally. Each step shows a clear UI screenshot or illustration with a numbered circle badge and Chinese label below. Step 1 shows selecting a tool from sidebar, Chinese label "选择工具". Step 2 shows dragging to canvas, Chinese label "拖拽到画布". Step 3 shows typing prompt, Chinese label "输入提示词". Step 4 shows generated images, Chinese label "生成完成". Clean modern design with purple and cyan accent colors, dark gradient background, glassmorphism card style, soft glow effects, arrows connecting each step. All Chinese text must be exactly as specified with no other text. Professional infographic style, 8K resolution.',
        chineseTexts: ['选择工具', '拖拽到画布', '输入提示词', '生成完成']
      }
    ],
    qualityChecklist: [
      '步骤编号是否清晰可见',
      '每个步骤的中文标签是否正确',
      '步骤之间的流程箭头是否连贯',
      '整体布局是否平衡'
    ],
    commonIssues: [
      {
        issue: '步骤过多导致图片拥挤',
        solution: '限制在4-5个步骤',
        promptFix: 'with clear separation and generous white space between steps'
      }
    ]
  },

  // ========== 技能3: 皮克斯风格连续故事 ==========
  'pixar-story-sequence': {
    metadata: {
      id: 'pixar-story-sequence',
      name: '皮克斯风格连续故事场景',
      description: '生成皮克斯/迪士尼动画风格的连续故事场景图，包含角色一致性和剧情发展',
      keywords: ['皮克斯', '迪士尼', '动画风格', '故事场景', '连续剧情', '角色设计', '3D动画', '电影感', '动画电影', '故事板'],
      category: 'storytelling',
      difficulty: 'hard',
      requiredInputs: ['角色描述', '故事大纲', '场景数量'],
      optionalInputs: ['场景标题', '角色台词']
    },
    basePrompt: `A Pixar-style cinematic 3D animation scene. {{SCENE_DESCRIPTION}} The character is {{CHARACTER_DESCRIPTION}}, maintaining consistent design throughout. {{TEXT_PLACEMENT}} Pixar animation style with dramatic cinematic lighting, rich vibrant colors, expressive character emotions, epic film composition, shallow depth of field, professional animation quality. All Chinese text must be exactly as specified with no other text. 8K resolution, masterpiece quality.`,
    variables: [
      {
        name: 'CHARACTER_DESCRIPTION',
        description: '角色详细描述（保持一致性）',
        type: 'text',
        required: true,
        examples: ['a curious 8-year-old girl with pigtails wearing a yellow dress', 'a brave young boy with messy brown hair and a red scarf']
      },
      {
        name: 'SCENE_DESCRIPTION',
        description: '场景详细描述',
        type: 'text',
        required: true,
        examples: ['The character discovers a magical glowing fairy in an enchanted forest clearing with dappled sunlight']
      },
      {
        name: 'TEXT_PLACEMENT',
        description: '中文文字及位置',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['Chinese text "初次相遇" at top center as scene title, Chinese text "你是谁？" at bottom as dialogue in speech bubble style.']
      }
    ],
    examples: [
      {
        userRequest: '皮克斯风格故事，小女孩遇见小精灵',
        filledPrompt: 'A Pixar-style cinematic 3D animation scene. A curious young girl discovers a tiny glowing fairy creature in a magical forest clearing, sunlight streaming through the trees creating a warm atmosphere. The character is an 8-year-old girl with pigtails wearing a simple yellow dress, maintaining consistent design throughout. Chinese text "初次相遇" displayed at top center as scene title, Chinese text "你好，小精灵！" at bottom center as dialogue. Pixar animation style with dramatic cinematic lighting, rich vibrant colors, expressive character emotions, epic film composition, shallow depth of field, professional animation quality. All Chinese text must be exactly as specified with no other text. 8K resolution, masterpiece quality.',
        chineseTexts: ['初次相遇', '你好，小精灵！']
      }
    ],
    qualityChecklist: [
      '角色设计是否符合皮克斯风格',
      '场景氛围是否有电影感',
      '中文文字是否正确显示',
      '光影效果是否戏剧化'
    ],
    commonIssues: [
      {
        issue: '角色风格不够皮克斯',
        solution: '强调3D动画特征',
        promptFix: 'with exaggerated Pixar-style proportions, large expressive eyes, smooth 3D rendered skin'
      }
    ]
  },

  // ========== 技能4: PPT生成 ==========
  'ppt-generator': {
    metadata: {
      id: 'ppt-generator',
      name: 'PPT演示文稿生成',
      description: '生成专业的PPT演示文稿页面设计',
      keywords: ['PPT', '演示文稿', '幻灯片', '汇报', '发布会', '商务演示', '年度报告', '提案', '路演', '展示'],
      category: 'data-visualization',
      difficulty: 'medium',
      requiredInputs: ['PPT主题', '页面内容'],
      optionalInputs: ['风格偏好', '颜色主题']
    },
    basePrompt: `A professional PPT slide design with {{STYLE_DESCRIPTION}}. {{SLIDE_CONTENT}} Clean modern presentation design with professional typography, balanced layout, consistent color scheme. All Chinese text must be exactly as specified with no other text. High quality presentation graphic, 16:9 aspect ratio, 4K resolution.`,
    variables: [
      {
        name: 'STYLE_DESCRIPTION',
        description: '风格描述',
        type: 'text',
        required: false,
        defaultValue: 'dark gradient background and glowing accent colors',
        examples: ['dark blue gradient background with cyan accents', 'minimalist white background with gold accents', 'tech style with neon glow effects']
      },
      {
        name: 'SLIDE_CONTENT',
        description: '幻灯片内容描述',
        type: 'text',
        required: true,
        examples: ['Title slide showing large Chinese title "智领未来" at center, subtitle "2024年度产品发布会" below, company logo at bottom right.']
      }
    ],
    examples: [
      {
        userRequest: '科技公司发布会PPT封面页',
        filledPrompt: 'A professional PPT slide design with dark blue gradient background and glowing cyan accent lights. Title slide showing large Chinese title "智领未来" prominently at center with futuristic font style, subtitle "2024年度产品发布会" below in smaller text, abstract tech patterns in background, company logo placeholder at bottom right. Clean modern presentation design with professional typography, balanced layout, consistent color scheme. All Chinese text must be exactly as specified with no other text. High quality presentation graphic, 16:9 aspect ratio, 4K resolution.',
        chineseTexts: ['智领未来', '2024年度产品发布会']
      }
    ],
    qualityChecklist: [
      '标题是否清晰可读',
      '内容层次是否分明',
      '设计风格是否专业',
      '颜色搭配是否协调'
    ],
    commonIssues: [
      {
        issue: '内容过于拥挤',
        solution: '减少内容量',
        promptFix: 'with minimal text and generous white space'
      }
    ]
  },

  // ========== 技能5: 架构图 ==========
  'architecture-diagram': {
    metadata: {
      id: 'architecture-diagram',
      name: '技术架构图生成',
      description: '生成清晰的技术架构图，分层展示系统结构',
      keywords: ['架构图', '系统架构', '技术架构', '分层架构', '微服务', '系统设计', '技术文档', '组件图', '部署图'],
      category: 'architecture',
      difficulty: 'medium',
      requiredInputs: ['架构层级', '各层组件'],
      optionalInputs: ['颜色主题', '连接关系']
    },
    basePrompt: `A professional {{LAYER_COUNT}}-layer technical architecture diagram with dark gradient background. {{LAYERS_CONTENT}} Each layer is a wide rounded rectangle with colored left border and contains component boxes inside. Vertical arrows connect layers from top to bottom. All boxes have generous padding and clear readable Chinese text. Clean modern tech style with glassmorphism effects, glowing borders, professional diagram aesthetic. All Chinese text must be exactly as specified with no other text. 8K resolution.`,
    variables: [
      {
        name: 'LAYER_COUNT',
        description: '架构层数',
        type: 'text',
        required: true,
        examples: ['5', '4', '6']
      },
      {
        name: 'LAYERS_CONTENT',
        description: '各层内容描述',
        type: 'list',
        required: true,
        examples: ['Top layer (orange border) with title "用户接入层" contains boxes: "iOS APP", "Android APP", "小程序", "PC网页". Second layer (blue border) with title "网关层" contains boxes: "API网关", "负载均衡".']
      }
    ],
    examples: [
      {
        userRequest: '电商平台技术架构图',
        filledPrompt: 'A professional 4-layer technical architecture diagram with dark gradient background. Top layer (orange left border) with Chinese title "用户接入层" contains component boxes: "iOS APP", "Android APP", "小程序", "Web端". Second layer (cyan left border) with title "网关层" contains: "API网关", "负载均衡", "CDN". Third layer (green left border) with title "业务层" contains: "用户服务", "订单服务", "商品服务", "支付服务". Bottom layer (purple left border) with title "数据层" contains: "MySQL", "Redis", "MongoDB". Each layer is a wide rounded rectangle with colored left border and contains component boxes inside. Vertical arrows connect layers from top to bottom. All boxes have generous padding and clear readable Chinese text. Clean modern tech style with glassmorphism effects, glowing borders, professional diagram aesthetic. All Chinese text must be exactly as specified with no other text. 8K resolution.',
        chineseTexts: ['用户接入层', '网关层', '业务层', '数据层', 'iOS APP', 'Android APP', '小程序', 'Web端', 'API网关', '负载均衡', 'CDN', '用户服务', '订单服务', '商品服务', '支付服务', 'MySQL', 'Redis', 'MongoDB']
      }
    ],
    qualityChecklist: [
      '层级关系是否清晰',
      '组件名称是否正确显示',
      '连接箭头是否正确',
      '颜色编码是否一致'
    ],
    commonIssues: [
      {
        issue: '层级之间间距不足',
        solution: '增加层级间距',
        promptFix: 'with generous vertical spacing between layers'
      }
    ]
  },

  // ========== 技能6: 旅行攻略 ==========
  'travel-itinerary': {
    metadata: {
      id: 'travel-itinerary',
      name: '旅行攻略可视化',
      description: '生成精美的旅行行程可视化图，包含每日安排和预算',
      keywords: ['旅行', '攻略', '行程', '旅游', '出行计划', '每日安排', '旅行预算', '自由行', '游记', '路线'],
      category: 'lifestyle',
      difficulty: 'medium',
      requiredInputs: ['目的地', '天数', '每日行程'],
      optionalInputs: ['预算', '偏好']
    },
    basePrompt: `A beautiful travel itinerary visualization with {{DAY_COUNT}} day cards arranged horizontally. Dark gradient background with subtle glow effects. {{HEADER_TEXT}} Each day card has dark background with colored top border gradient, containing a timeline with time and activity icons. {{DAYS_CONTENT}} {{SUMMARY_BAR}} Modern glassmorphism card style, clean typography, travel icons, professional infographic design. All Chinese text must be exactly as specified with no other text. 8K resolution.`,
    variables: [
      {
        name: 'DAY_COUNT',
        description: '天数',
        type: 'text',
        required: true,
        examples: ['4', '3', '5']
      },
      {
        name: 'HEADER_TEXT',
        description: '顶部标题',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['Large title at top: "苏州四日游 · 品味江南古韵"']
      },
      {
        name: 'DAYS_CONTENT',
        description: '每日行程内容',
        type: 'list',
        required: true,
        examples: ['Day 1 card (orange gradient top) with header "Day 1 · 初见姑苏" shows timeline: "09:00 抵达苏州站", "10:30 游览拙政园", "14:00 平江路古街".']
      },
      {
        name: 'SUMMARY_BAR',
        description: '底部总结栏',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['Summary bar at bottom showing: "总预算: 3200元 · 人均: 1600元 · 住宿2晚 · 精选15个景点"']
      }
    ],
    examples: [
      {
        userRequest: '苏州4日游行程可视化',
        filledPrompt: 'A beautiful travel itinerary visualization with 4 day cards arranged horizontally. Dark gradient background with subtle purple and cyan glow effects. Large title at top: "苏州四日游 · 品味江南古韵". Each day card has dark background with colored top border gradient, containing a timeline with time and activity icons. Day 1 card (orange gradient top) with header "Day 1 · 初见姑苏" shows: "09:00 抵达苏州站", "10:30 游览拙政园", "14:00 平江路古街", "16:30 苏州博物馆". Day 2 card (red gradient top) with header "Day 2 · 园林之美" shows: "08:30 游览虎丘", "11:00 留园参观", "14:00 狮子林". Day 3 card (cyan gradient top) with header "Day 3 · 水乡古镇" shows: "08:00 前往周庄", "10:00 游船体验", "12:30 古镇午餐". Day 4 card (yellow gradient top) with header "Day 4 · 文化体验" shows: "09:00 寒山寺", "14:00 苏州丝绸博物馆", "18:00 返程". Summary bar at bottom: "总预算: 3200元 · 人均: 1600元 · 住宿2晚 · 精选15个景点". Modern glassmorphism card style, clean typography, travel icons, professional infographic design. All Chinese text must be exactly as specified with no other text. 8K resolution.',
        chineseTexts: ['苏州四日游 · 品味江南古韵', 'Day 1 · 初见姑苏', 'Day 2 · 园林之美', 'Day 3 · 水乡古镇', 'Day 4 · 文化体验']
      }
    ],
    qualityChecklist: [
      '日期卡片是否排列整齐',
      '时间线是否清晰',
      '地点名称是否正确',
      '整体设计是否美观'
    ],
    commonIssues: [
      {
        issue: '时间线条目过多',
        solution: '精简每日活动数量',
        promptFix: 'with maximum 5-6 timeline items per day card'
      }
    ]
  },

  // ========== 技能7: 新闻速报卡片 ==========
  'news-infographic': {
    metadata: {
      id: 'news-infographic',
      name: '新闻速报卡片',
      description: '生成简洁的新闻速报卡片，从上到下排列6条新闻，每条包含标题和内容简介，适合快速阅读和分享',
      keywords: ['新闻', '资讯', '热点', '头条', '早报', '晚报', '日报', '快讯', '速报', '要闻', '大事件', '今日新闻', '热点新闻', '新闻速递', '新闻摘要'],
      category: 'news',
      difficulty: 'medium',
      requiredInputs: ['新闻标题', '新闻内容列表'],
      optionalInputs: ['日期', '主题']
    },
    basePrompt: `A clean, modern news digest card with dark gradient background. Vertical layout with 6 news items stacked from top to bottom.

HEADER (top 10%):
Chinese title "{{MAIN_TITLE}}" in bold white sans-serif, left-aligned. Date "{{DATE_SUBTITLE}}" in smaller grey text on the right. Thin gold horizontal line below header.

NEWS LIST (6 items, each ~14% height, stacked vertically with equal spacing):

{{NEWS_ITEMS}}

DESIGN STYLE:
- Clean vertical list layout, each item clearly separated
- Dark navy to charcoal gradient background (#1a1f3c to #2d2d2d)
- Each news item has: category tag (colored pill badge) + headline (white bold) + description (grey lighter text)
- Thin gold divider lines between items
- Left-aligned text, generous padding
- No complex grids, no hero sections, just simple top-to-bottom list
- Professional, minimalist, easy to read

COLOR CODING for categories:
- 科技/AI: electric blue (#00d4ff)
- 商业/投资: gold (#d4af37)
- 政策: burgundy red (#722f37)
- 国际: emerald green (#26a69a)
- 产品: purple (#9b59b6)
- 市场: amber (#f39c12)

All Chinese text must be exactly as specified with no other text. Ultra high quality, 8K resolution.`,
    variables: [
      {
        name: 'MAIN_TITLE',
        description: '主标题',
        type: 'text',
        required: true,
        defaultValue: '今日速报',
        examples: ['今日AI速报', '科技快讯', '每日要闻']
      },
      {
        name: 'DATE_SUBTITLE',
        description: '日期',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['2025年11月30日', '11月30日 周日']
      },
      {
        name: 'NEWS_ITEMS',
        description: '6条新闻列表，从上到下排列，每条包含分类标签、标题（10-15字）、内容简介（15-25字）',
        type: 'list',
        required: true,
        examples: [
          'Item 1: Blue "科技" tag, headline "Gemini 3正式发布" in white bold, description "LMArena评分1501创新高 全面超越竞品" in grey.',
          'Item 2: Gold "商业" tag, headline "OpenAI获AWS投资" in white bold, description "380亿美元七年战略合作 提供海量GPU算力" in grey.',
          'Item 3: Purple "产品" tag, headline "Claude Opus 4.5上线" in white bold, description "代码能力提升15% 成本降低76%" in grey.'
        ]
      }
    ],
    examples: [
      {
        userRequest: '帮我生成今日AI新闻速报',
        filledPrompt: `A clean, modern news digest card with dark gradient background (#1a1f3c to #2d2d2d). Vertical layout with 6 news items stacked from top to bottom.

HEADER (top 10%):
Chinese title "今日AI速报" in bold white sans-serif (32pt), left-aligned. Date "2025年11月30日" in smaller grey text (18pt) on the right. Thin gold horizontal line below header.

NEWS LIST (6 items, stacked vertically with equal spacing, each item has colored category tag + bold headline + grey description):

Item 1: Electric blue pill badge "科技", then headline "Gemini 3正式发布" in white bold (24pt), below description "LMArena评分1501分创新高 性能全面超越GPT-5" in light grey (16pt).

Item 2: Gold pill badge "商业", headline "OpenAI获AWS巨额投资" in white bold, description "达成380亿美元七年战略合作 获数十万GPU算力支持" in grey.

Item 3: Purple pill badge "产品", headline "Claude Opus 4.5发布" in white bold, description "代码能力提升至80.9% API成本降低76%" in grey.

Item 4: Emerald green pill badge "国际", headline "微软英伟达联手Anthropic" in white bold, description "150亿美元战略投资 深化AI基础设施合作" in grey.

Item 5: Burgundy red pill badge "政策", headline "美国启动Genesis计划" in white bold, description "十年AI科学计划 目标提升科研生产力一倍" in grey.

Item 6: Amber pill badge "市场", headline "黑五AI销售创纪录" in white bold, description "AI驱动在线销售达142亿美元 同比增长9%" in grey.

Thin gold divider lines between each item. Dark navy to charcoal gradient background. Clean vertical list layout, left-aligned text, generous padding. Professional minimalist design.

All Chinese text must be exactly as specified with no other text. Ultra high quality, 8K resolution.`,
        chineseTexts: ['今日AI速报', '2025年11月30日', '科技', 'Gemini 3正式发布', 'LMArena评分1501分创新高 性能全面超越GPT-5', '商业', 'OpenAI获AWS巨额投资', '达成380亿美元七年战略合作 获数十万GPU算力支持', '产品', 'Claude Opus 4.5发布', '代码能力提升至80.9% API成本降低76%', '国际', '微软英伟达联手Anthropic', '150亿美元战略投资 深化AI基础设施合作', '政策', '美国启动Genesis计划', '十年AI科学计划 目标提升科研生产力一倍', '市场', '黑五AI销售创纪录', 'AI驱动在线销售达142亿美元 同比增长9%']
      }
    ],
    qualityChecklist: [
      '是否有6条完整新闻（标题+内容）',
      '布局是否从上到下清晰排列',
      '每条新闻是否有分类标签',
      '标题是否简洁有力（10-15字）',
      '内容简介是否具体（15-25字）',
      '配色是否专业（深色背景+彩色标签）',
      '中文文字是否正确显示'
    ],
    commonIssues: [
      {
        issue: '布局变成复杂网格',
        solution: '强调简单的垂直列表布局',
        promptFix: 'with simple vertical list layout, 6 items stacked from top to bottom, no complex grids or hero sections'
      },
      {
        issue: '新闻只有标题没有内容',
        solution: '每条必须有标题+内容简介',
        promptFix: 'each news item MUST have: category tag + headline (10-15 chars) + description (15-25 chars explaining the news)'
      },
      {
        issue: '内容太笼统',
        solution: '内容简介要有具体数字或细节',
        promptFix: 'description should include specific numbers, percentages, or concrete details, not vague statements'
      }
    ]
  },

  // ========== 技能8: 家庭记账 ==========
  'budget-visualization': {
    metadata: {
      id: 'budget-visualization',
      name: '家庭记账可视化',
      description: '生成家庭收支可视化图表，包含饼图、柱状图等数据展示',
      keywords: ['记账', '账单', '收支', '预算', '财务', '家庭开销', '数据图表', '可视化', '月度账单', '收入支出'],
      category: 'data-visualization',
      difficulty: 'medium',
      requiredInputs: ['收入', '支出明细'],
      optionalInputs: ['时间范围', '分析建议']
    },
    basePrompt: `A beautiful financial dashboard visualization with dark gradient background. {{TITLE_TEXT}} The dashboard contains: {{CHARTS_CONTENT}} Modern glassmorphism card style, clean data visualization, professional financial infographic design with green for income and red/orange for expenses. All Chinese text must be exactly as specified with no other text. 8K resolution.`,
    variables: [
      {
        name: 'TITLE_TEXT',
        description: '标题',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['Large title at top: "11月家庭账单"']
      },
      {
        name: 'CHARTS_CONTENT',
        description: '图表内容描述',
        type: 'list',
        required: true,
        examples: ['A summary card showing "总收入: 15000元" in green and "总支出: 12300元" in orange. A colorful pie chart showing expense breakdown with legend: "房贷 45%", "餐饮 23%", "交通 12%". A bar chart showing monthly comparison.']
      }
    ],
    examples: [
      {
        userRequest: '11月家庭账单可视化',
        filledPrompt: 'A beautiful financial dashboard visualization with dark gradient background. Large title at top: "11月家庭账单". The dashboard contains: Top summary card showing "总收入: 15000元" in green text and "总支出: 12300元" in orange text, with "结余: 2700元" highlighted. A colorful donut pie chart showing expense breakdown with legend items: "房贷 5500元 (45%)" in blue, "餐饮 2800元 (23%)" in orange, "交通 1500元 (12%)" in green, "其他 2500元 (20%)" in purple. A horizontal bar chart comparing this month vs last month. Modern glassmorphism card style, clean data visualization, professional financial infographic design with green for income and red/orange for expenses. All Chinese text must be exactly as specified with no other text. 8K resolution.',
        chineseTexts: ['11月家庭账单', '总收入', '总支出', '结余', '房贷', '餐饮', '交通', '其他']
      }
    ],
    qualityChecklist: [
      '数据是否准确显示',
      '图表类型是否合适',
      '颜色编码是否清晰',
      '整体布局是否平衡'
    ],
    commonIssues: [
      {
        issue: '饼图标签重叠',
        solution: '使用图例代替直接标签',
        promptFix: 'with legend on the side instead of labels on pie slices'
      }
    ]
  }
};

// 获取所有技能的元数据摘要（用于技能匹配）
export function getSkillsSummary(): Array<{
  id: string;
  name: string;
  description: string;
  keywords: string[];
  category: string;
}> {
  return Object.values(SKILL_LIBRARY).map(skill => ({
    id: skill.metadata.id,
    name: skill.metadata.name,
    description: skill.metadata.description,
    keywords: skill.metadata.keywords,
    category: skill.metadata.category
  }));
}

// 根据关键词匹配技能
export function matchSkillByKeywords(userRequest: string): {
  matched: boolean;
  skillId: string | null;
  skillName: string | null;
  confidence: number;
  allMatches: Array<{ id: string; name: string; score: number }>;
} {
  const scores = Object.entries(SKILL_LIBRARY).map(([id, skill]) => {
    let score = 0;
    const keywords = skill.metadata.keywords;
    const lowerRequest = userRequest.toLowerCase();

    keywords.forEach(keyword => {
      if (lowerRequest.includes(keyword.toLowerCase())) {
        score += 10;
      }
    });

    // 额外匹配技能描述
    if (lowerRequest.includes(skill.metadata.name.toLowerCase())) {
      score += 20;
    }

    return { id, name: skill.metadata.name, score };
  });

  scores.sort((a, b) => b.score - a.score);

  const topMatch = scores[0];
  const isMatched = topMatch.score >= 10;

  return {
    matched: isMatched,
    skillId: isMatched ? topMatch.id : null,
    skillName: isMatched ? topMatch.name : null,
    confidence: Math.min(topMatch.score / 50, 1),
    allMatches: scores.filter(s => s.score > 0).slice(0, 3)
  };
}
