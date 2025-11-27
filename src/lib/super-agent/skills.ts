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
    basePrompt: `A modern tutorial infographic showing how to use {{PRODUCT_NAME}}. The image is divided into a step-by-step visual guide with numbered steps flowing from left to right. {{STEPS_CONTENT}} The overall design is clean, modern UI style with {{COLORS}} accent colors, dark mode interface, soft glow effects, professional product demonstration style, 4K resolution.`,
    variables: [
      {
        name: 'PRODUCT_NAME',
        description: '产品名称',
        type: 'text',
        required: true,
        examples: ['an AI infinite canvas platform', 'a photo editing app']
      },
      {
        name: 'STEPS_CONTENT',
        description: '步骤内容，每个步骤包含：描述 + 标签',
        type: 'list',
        required: true,
        examples: ['Step 1: A left sidebar panel showing tool icons with "AI智能体" highlighted, label "选择工具". Step 2: A canvas showing the node placed, label "放置节点".']
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
        userRequest: '帮我做一个AI画布的使用教程，包含选择工具、上传图片、输入提示词、生成图片4个步骤',
        filledPrompt: 'A modern tutorial infographic showing how to use an AI infinite canvas platform. The image is divided into a step-by-step visual guide with numbered steps flowing from left to right. Step 1: A left sidebar panel showing tool icons with "AI智能体" highlighted and being dragged with a cursor arrow, label "选择AI智能体 拖拽到画布". Step 2: A canvas workspace showing the agent node placed, with a photo being uploaded and connected by a glowing line to the agent node, label "上传照片 连线到节点". Step 3: A text input box showing creative prompt being typed, label "输入你的创意想法". Step 4: Multiple beautiful AI-generated images appearing on the canvas, label "精美图片生成完成". The overall design is clean, modern UI style with purple and cyan accent colors, dark mode interface, soft glow effects, professional product demonstration style, 4K resolution.',
        chineseTexts: ['AI智能体', '选择AI智能体 拖拽到画布', '上传照片 连线到节点', '输入你的创意想法', '精美图片生成完成']
      }
    ],
    qualityChecklist: [
      '步骤编号是否清晰可见',
      '每个步骤的标签文字是否正确',
      '步骤之间的流程箭头是否连贯',
      'UI元素是否符合现代设计风格',
      '整体布局是否平衡'
    ],
    commonIssues: [
      {
        issue: '步骤过多导致图片拥挤',
        solution: '限制在4-5个步骤',
        promptFix: 'with clear separation and generous white space between steps'
      },
      {
        issue: '步骤标签文字不清晰',
        solution: '使用更大的标签文字',
        promptFix: 'with large, clearly readable Chinese labels'
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
    basePrompt: `A modern tutorial infographic showing advanced AI canvas workflow for sequential Pixar-style cinematic story scene generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "角色创建": Shows {{CHARACTER_COUNT}} Pixar-style cinematic 3D character cards with dramatic lighting - {{CHARACTER_DESCRIPTIONS}} - each character in glowing card frames, title label "第一步：生成角色 选择主角".

MIDDLE SECTION "故事输入": Shows the selected character images connected with glowing cyan flow lines to a central glowing AI agent node icon, below it a text input panel clearly displaying the complete story prompt "{{STORY_PROMPT}}", and text requirement "{{TEXT_REQUIREMENT}}", title label "第二步：输入故事与文字要求".

RIGHT SECTION "成品呈现": Shows exactly {{SCENE_COUNT}} sequential Pixar-style cinematic story scene images in a horizontal filmstrip layout, all featuring the same characters in consistent Pixar cinematic style with dramatic film lighting and epic composition. {{SCENE_DESCRIPTIONS}} Title label "第三步：连贯场景生成".

All Chinese text must be exactly as specified with no other text. Bottom banner reads "{{FOOTER_TEXT}}". Clean modern UI design, glassmorphism style, Pixar cinematic animation aesthetic with dramatic lighting and epic scale, professional product illustration, 8K resolution.`,
    variables: [
      {
        name: 'CHARACTER_COUNT',
        description: '角色数量',
        type: 'text',
        required: true,
        examples: ['3', '2', '4']
      },
      {
        name: 'CHARACTER_DESCRIPTIONS',
        description: '角色详细描述',
        type: 'list',
        required: true,
        examples: ['a determined young astronaut girl with short black hair named 星河, a weathered robot companion named 锈铁']
      },
      {
        name: 'STORY_PROMPT',
        description: '故事梗概',
        type: 'text',
        required: true,
        examples: ['人类文明消亡千年后，少女星河在废墟中被唤醒...']
      },
      {
        name: 'TEXT_REQUIREMENT',
        description: '文字显示要求',
        type: 'text',
        required: false,
        defaultValue: '每张图片顶部显示场景标题，底部显示角色台词',
        examples: ['每张图片顶部显示场景标题，底部显示角色台词']
      },
      {
        name: 'SCENE_COUNT',
        description: '场景数量',
        type: 'text',
        required: true,
        examples: ['4', '6', '3']
      },
      {
        name: 'SCENE_DESCRIPTIONS',
        description: '各场景详细描述',
        type: 'list',
        required: true,
        examples: ['Scene 1: 星河 opening her eyes inside a cracked cryogenic pod, top text "觉醒", bottom dialogue "沉睡了多久...".']
      },
      {
        name: 'FOOTER_TEXT',
        description: '底部标语',
        type: 'text',
        required: false,
        defaultValue: '无限画布 · 让AI讲述你的故事',
        examples: ['无限画布 · 让AI讲述你的故事 · https://canvas.luzhipeng.com']
      }
    ],
    examples: [],
    qualityChecklist: [
      '角色在各场景中是否保持一致',
      '场景是否按剧情顺序排列',
      '标题和台词文字是否正确显示',
      '皮克斯动画风格是否到位',
      '光影效果是否有电影感'
    ],
    commonIssues: [
      {
        issue: '角色在不同场景中外观不一致',
        solution: '更详细地描述角色固定特征',
        promptFix: 'maintaining exact same character design, clothing, and proportions across all scenes'
      },
      {
        issue: '场景文字显示错误',
        solution: '明确指定文字位置和内容',
        promptFix: 'with text exactly positioned at top center for title and bottom center for dialogue'
      }
    ]
  },

  // ========== 技能4: PPT生成 ==========
  'ppt-generator': {
    metadata: {
      id: 'ppt-generator',
      name: 'PPT演示文稿生成',
      description: '生成专业的PPT演示文稿设计图，包含多页幻灯片预览',
      keywords: ['PPT', '演示文稿', '幻灯片', '汇报', '发布会', '商务演示', '年度报告', '提案', '路演', '展示'],
      category: 'data-visualization',
      difficulty: 'medium',
      requiredInputs: ['PPT主题', '页面内容列表'],
      optionalInputs: ['风格偏好', '颜色主题']
    },
    basePrompt: `A modern tutorial infographic showing AI canvas workflow for professional PPT presentation generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "输入需求": Shows a text input panel with glowing border, clearly displaying the complete prompt "{{USER_REQUIREMENT}}", title label "第一步：描述你的PPT需求".

MIDDLE SECTION "智能生成": Shows an AI agent node with magical processing particles and light beams, multiple content cards being generated and flowing outward showing outline structure, title label "第二步：AI自动规划结构与内容".

RIGHT SECTION "成品呈现": Shows exactly {{SLIDE_COUNT}} professional PPT slide previews in a cascading elegant layout, all in consistent modern tech style with {{STYLE_DESCRIPTION}}. {{SLIDES_CONTENT}} Title label "第三步：专业PPT一键生成".

All Chinese text must be exactly as specified with no other text. Bottom banner reads "{{FOOTER_TEXT}}". Clean modern UI design, glassmorphism style, professional product illustration, 8K resolution.`,
    variables: [
      {
        name: 'USER_REQUIREMENT',
        description: '用户的PPT需求描述',
        type: 'text',
        required: true,
        examples: ['为科技公司年度发布会制作一份产品发布PPT，主题是智能家居新品发布']
      },
      {
        name: 'SLIDE_COUNT',
        description: '幻灯片数量',
        type: 'text',
        required: true,
        examples: ['5', '6', '4']
      },
      {
        name: 'STYLE_DESCRIPTION',
        description: '风格描述',
        type: 'text',
        required: false,
        defaultValue: 'dark blue gradient backgrounds and cyan accent lighting',
        examples: ['dark blue gradient backgrounds and cyan accent lighting', 'minimalist white background with gold accents']
      },
      {
        name: 'SLIDES_CONTENT',
        description: '各幻灯片内容描述',
        type: 'list',
        required: true,
        examples: ['Slide 1: Title slide with large text "智领未来" as main title. Slide 2: Company intro slide with title "关于我们".']
      },
      {
        name: 'FOOTER_TEXT',
        description: '底部标语',
        type: 'text',
        required: false,
        defaultValue: '无限画布 · AI让演示更专业',
        examples: ['无限画布 · AI让演示更专业 · https://canvas.luzhipeng.com']
      }
    ],
    examples: [],
    qualityChecklist: [
      '幻灯片标题是否清晰可读',
      '内容层次是否分明',
      '设计风格是否统一',
      '颜色搭配是否协调',
      '整体布局是否专业'
    ],
    commonIssues: [
      {
        issue: '幻灯片内容过于拥挤',
        solution: '减少每页内容量',
        promptFix: 'with minimal text and generous white space on each slide'
      },
      {
        issue: '设计风格不统一',
        solution: '强调一致性',
        promptFix: 'maintaining exact same design language, fonts, and color scheme across all slides'
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
    basePrompt: `A modern tutorial infographic showing AI canvas workflow for enterprise architecture diagram generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "输入需求": Shows a text input panel with glowing border, clearly displaying the complete prompt "{{USER_REQUIREMENT}}", title label "第一步：描述你的架构图需求".

MIDDLE SECTION "智能解析": Shows an AI agent node with magical processing particles, title label "第二步：AI解析架构层级".

RIGHT SECTION "成品呈现": Shows a complete professional {{LAYER_COUNT}}-layer architecture diagram with large spacing between layers, dark background with glowing borders, each layer is a wide rounded rectangle container with colored left border:

{{LAYERS_CONTENT}}

Vertical flowing arrows connecting each layer from top to bottom. All boxes have generous padding and clear readable text. Title label "第三步：专业架构图一键生成".

All Chinese text must be exactly as specified with no other text. Bottom banner reads "{{FOOTER_TEXT}}". Clean modern UI design, glassmorphism style, 8K resolution.`,
    variables: [
      {
        name: 'USER_REQUIREMENT',
        description: '用户的架构图需求',
        type: 'text',
        required: true,
        examples: ['绘制一个电商平台技术架构图，包含用户端、网关层、业务层、数据层、基础设施层']
      },
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
        examples: ['LAYER 1 (top layer, orange left border) - Title "用户接入层": Contains 4 large boxes: "iOS APP", "Android APP", "小程序", "PC网页".']
      },
      {
        name: 'FOOTER_TEXT',
        description: '底部标语',
        type: 'text',
        required: false,
        defaultValue: '无限画布 · AI让架构更清晰',
        examples: ['无限画布 · AI让架构更清晰 · https://canvas.luzhipeng.com']
      }
    ],
    examples: [],
    qualityChecklist: [
      '层级关系是否清晰',
      '组件名称是否正确显示',
      '连接箭头是否正确',
      '颜色编码是否一致',
      '整体布局是否平衡'
    ],
    commonIssues: [
      {
        issue: '层级之间间距不足',
        solution: '增加层级间距',
        promptFix: 'with generous vertical spacing between layers (at least 50px visual gap)'
      },
      {
        issue: '组件框太小',
        solution: '增大组件框尺寸',
        promptFix: 'with large component boxes that have clear padding around text'
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
    basePrompt: `A modern tutorial infographic showing AI canvas workflow for travel itinerary visual guide generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "输入需求": Shows a text input panel with glowing border, clearly displaying the complete prompt "{{USER_REQUIREMENT}}", title label "第一步：描述你的旅行计划".

MIDDLE SECTION "智能规划": Shows an AI agent node with magical processing particles, travel-related icons floating around like plane, map pin, food, camera, title label "第二步：AI智能规划行程".

RIGHT SECTION "成品呈现": Shows a beautiful visual travel itinerary with {{DAY_COUNT}} day cards arranged horizontally, each card has consistent modern design with dark background and gradient colored top border, containing timeline and details:

{{DAYS_CONTENT}}

Below the day cards, a summary bar showing "{{SUMMARY_TEXT}}".

Title label "第三步：可视化行程一键生成".

All Chinese text must be exactly as specified with no other text. Bottom banner reads "{{FOOTER_TEXT}}". Clean modern UI design, glassmorphism style, professional product illustration, 8K resolution.`,
    variables: [
      {
        name: 'USER_REQUIREMENT',
        description: '用户的旅行需求',
        type: 'text',
        required: true,
        examples: ['计划国庆去成都旅行，4天3晚，预算5000元，两个人']
      },
      {
        name: 'DAY_COUNT',
        description: '天数',
        type: 'text',
        required: true,
        examples: ['4', '3', '5']
      },
      {
        name: 'DAYS_CONTENT',
        description: '每日行程内容',
        type: 'list',
        required: true,
        examples: ['DAY CARD 1 (orange top border) - Header "Day 1 · 初见成都": Timeline shows "14:00 抵达双流机场", "15:30 入住太古里民宿"...']
      },
      {
        name: 'SUMMARY_TEXT',
        description: '总结信息',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['总预算：2400元 · 剩余：2600元 · 人均：1200元']
      },
      {
        name: 'FOOTER_TEXT',
        description: '底部标语',
        type: 'text',
        required: false,
        defaultValue: '无限画布 · AI让旅行更精彩',
        examples: ['无限画布 · AI让旅行更精彩 · https://canvas.luzhipeng.com']
      }
    ],
    examples: [],
    qualityChecklist: [
      '日期卡片是否排列整齐',
      '时间线是否清晰',
      '地点名称是否正确',
      '预算信息是否准确',
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

  // ========== 技能7: 家庭记账 ==========
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
    basePrompt: `A modern tutorial infographic showing AI canvas workflow for family budget visualization generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "输入需求": Shows a text input panel with glowing border, clearly displaying the complete prompt "{{USER_REQUIREMENT}}", title label "第一步：输入收支明细".

MIDDLE SECTION "智能分析": Shows an AI agent node with magical processing particles and chart icons floating around, title label "第二步：AI智能分析".

RIGHT SECTION "成品呈现": Shows a beautiful financial dashboard with dark background containing {{CHART_COUNT}} visual elements:

{{CHARTS_CONTENT}}

Title label "第三步：可视化账单一键生成".

All Chinese text must be exactly as specified with no other text. Bottom banner reads "{{FOOTER_TEXT}}". Clean modern UI design, glassmorphism style, 8K resolution.`,
    variables: [
      {
        name: 'USER_REQUIREMENT',
        description: '用户的记账需求',
        type: 'text',
        required: true,
        examples: ['帮我生成11月家庭账单可视化图表，收入15000元，房贷5500元，餐饮2800元...']
      },
      {
        name: 'CHART_COUNT',
        description: '图表数量',
        type: 'text',
        required: true,
        examples: ['4', '3']
      },
      {
        name: 'CHARTS_CONTENT',
        description: '各图表内容描述',
        type: 'list',
        required: true,
        examples: ['ELEMENT 1 (top left): A summary card with title "11月家庭账单" showing "总收入：15000元" in green text...']
      },
      {
        name: 'FOOTER_TEXT',
        description: '底部标语',
        type: 'text',
        required: false,
        defaultValue: '无限画布 · AI让生活更清晰',
        examples: ['无限画布 · AI让生活更清晰 · https://canvas.luzhipeng.com']
      }
    ],
    examples: [],
    qualityChecklist: [
      '数据是否准确显示',
      '图表类型是否合适',
      '颜色编码是否清晰',
      '百分比计算是否正确',
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
