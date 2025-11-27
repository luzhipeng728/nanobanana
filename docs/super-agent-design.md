# 超级提示词智能体系统设计

## 一、系统架构概览

```
┌────────────────────────────────────────────────────────────────────────┐
│                         用户输入                                        │
│    "帮我生成一个产品展示图，手持透明卡片风格，展示我的AI平台"              │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    🧠 超级智能体核心 (ReAct Loop)                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Thought: 分析用户需求，识别场景类型                               │  │
│  │  Action: 调用 skill_matcher 工具匹配预设技能                       │  │
│  │  Observation: 匹配到 "product-showcase" 技能                      │  │
│  │                                                                   │  │
│  │  Thought: 需要获取技能详情和模板                                   │  │
│  │  Action: 调用 load_skill 工具加载完整技能内容                      │  │
│  │  Observation: 获得完整的提示词模板和参数说明                        │  │
│  │                                                                   │  │
│  │  Thought: 需要根据用户具体需求填充模板                             │  │
│  │  Action: 调用 generate_prompt 工具生成初版提示词                   │  │
│  │  Observation: 生成了 V1 版本提示词                                 │  │
│  │                                                                   │  │
│  │  Thought: 需要验证提示词质量，可能需要搜索参考资料                  │  │
│  │  Action: 调用 web_search 工具搜索最佳实践                          │  │
│  │  Observation: 找到一些优化技巧                                     │  │
│  │                                                                   │  │
│  │  Thought: 结合搜索结果优化提示词                                   │  │
│  │  Action: 调用 optimize_prompt 工具                                │  │
│  │  Observation: 生成了 V2 版本提示词                                 │  │
│  │                                                                   │  │
│  │  Thought: 提示词已足够完善，可以输出                               │  │
│  │  Action: 调用 finalize_output 工具                                │  │
│  │  Observation: 任务完成                                            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         最终输出                                        │
│    完整的英文提示词 + 中文文字清单 + 生成建议                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、技能库设计 (Skills Library)

### 2.1 技能元数据结构

```typescript
// src/types/super-agent.ts

export interface SkillMetadata {
  id: string;                    // 技能唯一标识
  name: string;                  // 技能名称
  description: string;           // 技能描述（用于匹配）
  keywords: string[];            // 触发关键词
  category: SkillCategory;       // 技能分类
  difficulty: 'easy' | 'medium' | 'hard';  // 复杂度
  requiredInputs: string[];      // 必需的用户输入
  optionalInputs: string[];      // 可选的用户输入
}

export interface SkillTemplate {
  metadata: SkillMetadata;
  basePrompt: string;            // 基础提示词模板
  variables: SkillVariable[];    // 可替换变量
  examples: SkillExample[];      // 使用示例
  qualityChecklist: string[];    // 质量检查清单
  commonIssues: CommonIssue[];   // 常见问题及解决方案
}

export type SkillCategory =
  | 'product-display'    // 产品展示
  | 'tutorial'           // 教程图解
  | 'storytelling'       // 故事场景
  | 'data-visualization' // 数据可视化
  | 'architecture'       // 架构图
  | 'lifestyle';         // 生活场景

export interface SkillVariable {
  name: string;          // 变量名
  description: string;   // 变量说明
  type: 'text' | 'list' | 'color' | 'style';
  required: boolean;
  defaultValue?: string;
  examples: string[];
}

export interface SkillExample {
  userRequest: string;   // 用户原始需求
  filledPrompt: string;  // 填充后的提示词
  chineseTexts: string[]; // 中文文字清单
}

export interface CommonIssue {
  issue: string;         // 问题描述
  solution: string;      // 解决方案
  promptFix: string;     // 提示词修复语句
}
```

### 2.2 预设技能定义

```typescript
// src/data/skills/index.ts

export const SKILL_LIBRARY: Record<string, SkillTemplate> = {

  // ========== 技能1: 产品名片展示 ==========
  'product-showcase': {
    metadata: {
      id: 'product-showcase',
      name: '产品名片展示图',
      description: '生成手持透明卡片风格的产品展示图，适合展示App、平台、品牌等',
      keywords: ['产品展示', '名片', '手持卡片', '透明卡片', 'App展示', '品牌展示', '玻璃卡片', '霓虹灯效果'],
      category: 'product-display',
      difficulty: 'medium',
      requiredInputs: ['产品名称', '产品功能列表'],
      optionalInputs: ['用户名', '网站URL', 'slogan', '品牌颜色']
    },
    basePrompt: `A hand holding a glowing transparent glass card in the dark, the card displays {{PRODUCT_TYPE}} interface. The card shows a logo and title "{{PRODUCT_NAME}}" {{BADGE_TEXT}}, {{USERNAME_TEXT}}, tagline "{{SLOGAN}}", {{URL_TEXT}}, featuring {{FEATURE_ICONS}}. The card has beautiful gradient neon edge lighting in {{COLORS}} colors, holographic glass material effect. Photorealistic, cinematic dramatic lighting, pure black background, shallow depth of field, professional photography, ultra high quality, 8K resolution.`,
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
        name: 'SLOGAN',
        description: '产品标语',
        type: 'text',
        required: false,
        examples: ['AI无限画布 · 创意无界', '让创作更简单']
      },
      {
        name: 'FEATURE_ICONS',
        description: '功能图标列表，格式：tool icons with labels: 功能1, 功能2...',
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
        examples: ['username "@luzhipeng"', '']
      },
      {
        name: 'URL_TEXT',
        description: '网站URL',
        type: 'text',
        required: false,
        examples: ['website URL "canvas.luzhipeng.com"', '']
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
      keywords: ['教程', '使用说明', '操作指南', '步骤图', '流程图', '新手引导', 'UI教程', '功能介绍'],
      category: 'tutorial',
      difficulty: 'hard',
      requiredInputs: ['产品名称', '步骤列表'],
      optionalInputs: ['品牌颜色', '风格偏好']
    },
    basePrompt: `A modern tutorial infographic showing how to use {{PRODUCT_NAME}}. The image is divided into a step-by-step visual guide with numbered steps flowing from left to right. {{STEPS_CONTENT}}. The overall design is clean, modern UI style with {{COLORS}} accent colors, dark mode interface, soft glow effects, professional product demonstration style, 4K resolution.`,
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
        examples: ['Step 1: A left sidebar panel showing tool icons with "AI智能体" highlighted, label "选择工具". Step 2: A canvas showing the node placed, label "放置节点"']
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
      keywords: ['皮克斯', '迪士尼', '动画风格', '故事场景', '连续剧情', '角色设计', '3D动画', '电影感'],
      category: 'storytelling',
      difficulty: 'hard',
      requiredInputs: ['角色描述', '故事大纲', '场景数量'],
      optionalInputs: ['场景标题', '角色台词']
    },
    basePrompt: `A modern tutorial infographic showing advanced AI canvas workflow for sequential Pixar-style cinematic story scene generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "角色创建": Shows {{CHARACTER_COUNT}} Pixar-style cinematic 3D character cards with dramatic lighting - {{CHARACTER_DESCRIPTIONS}} - each character in glowing card frames, title label "第一步：生成角色 选择主角".

MIDDLE SECTION "故事输入": Shows the selected character images connected with glowing cyan flow lines to a central glowing AI agent node icon, below it a text input panel clearly displaying the complete story prompt "{{STORY_PROMPT}}", and text requirement "{{TEXT_REQUIREMENT}}", title label "第二步：输入故事与文字要求".

RIGHT SECTION "成品呈现": Shows exactly {{SCENE_COUNT}} sequential Pixar-style cinematic story scene images in a horizontal filmstrip layout, all featuring the same characters in consistent Pixar cinematic style with dramatic film lighting and epic composition. {{SCENE_DESCRIPTIONS}}. Title label "第三步：连贯场景生成".

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
        examples: ['Scene 1: 星河 opening her eyes inside a cracked cryogenic pod, top text "觉醒", bottom dialogue "沉睡了多久..."']
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
      keywords: ['PPT', '演示文稿', '幻灯片', '汇报', '发布会', '商务演示', '年度报告'],
      category: 'data-visualization',
      difficulty: 'medium',
      requiredInputs: ['PPT主题', '页面内容列表'],
      optionalInputs: ['风格偏好', '颜色主题']
    },
    basePrompt: `A modern tutorial infographic showing AI canvas workflow for professional PPT presentation generation. Dark gradient background with glowing purple and cyan neon accents. The image displays a complete creative workflow.

LEFT SECTION "输入需求": Shows a text input panel with glowing border, clearly displaying the complete prompt "{{USER_REQUIREMENT}}", title label "第一步：描述你的PPT需求".

MIDDLE SECTION "智能生成": Shows an AI agent node with magical processing particles and light beams, multiple content cards being generated and flowing outward showing outline structure, title label "第二步：AI自动规划结构与内容".

RIGHT SECTION "成品呈现": Shows exactly {{SLIDE_COUNT}} professional PPT slide previews in a cascading elegant layout, all in consistent modern tech style with {{STYLE_DESCRIPTION}}. {{SLIDES_CONTENT}}. Title label "第三步：专业PPT一键生成".

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
        examples: ['Slide 1: Title slide with large text "智领未来" as main title. Slide 2: Company intro slide with title "关于我们"']
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
      keywords: ['架构图', '系统架构', '技术架构', '分层架构', '微服务', '系统设计', '技术文档'],
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
      keywords: ['旅行', '攻略', '行程', '旅游', '出行计划', '每日安排', '旅行预算'],
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
      keywords: ['记账', '账单', '收支', '预算', '财务', '家庭开销', '数据图表', '可视化'],
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
```

---

## 三、工具定义 (Tools Definition)

### 3.1 工具类型定义

```typescript
// src/types/super-agent.ts

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  handler: (params: Record<string, any>) => Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  shouldContinue: boolean;  // 是否需要继续 ReAct 循环
}
```

### 3.2 核心工具集

```typescript
// src/lib/super-agent/tools.ts

export const SUPER_AGENT_TOOLS: AgentTool[] = [

  // ========== 工具1: 技能匹配器 ==========
  {
    name: 'skill_matcher',
    description: '分析用户需求，匹配最合适的预设技能。如果没有匹配的技能，返回 null 表示需要自主生成。',
    parameters: [
      {
        name: 'user_request',
        type: 'string',
        description: '用户的原始需求描述',
        required: true
      },
      {
        name: 'reference_image_analysis',
        type: 'string',
        description: '参考图片的分析结果（如果有）',
        required: false
      }
    ],
    handler: async (params) => {
      // 实现技能匹配逻辑
      const { user_request, reference_image_analysis } = params;

      // 遍历技能库，计算匹配分数
      const scores = Object.entries(SKILL_LIBRARY).map(([id, skill]) => {
        let score = 0;
        const keywords = skill.metadata.keywords;

        keywords.forEach(keyword => {
          if (user_request.includes(keyword)) {
            score += 10;
          }
        });

        // 如果有参考图分析，进一步匹配
        if (reference_image_analysis) {
          keywords.forEach(keyword => {
            if (reference_image_analysis.includes(keyword)) {
              score += 5;
            }
          });
        }

        return { id, skill, score };
      });

      // 排序并返回最佳匹配
      scores.sort((a, b) => b.score - a.score);

      if (scores[0].score >= 10) {
        return {
          success: true,
          data: {
            matched_skill: scores[0].id,
            confidence: Math.min(scores[0].score / 50, 1),
            all_matches: scores.slice(0, 3).map(s => ({
              id: s.id,
              name: s.skill.metadata.name,
              score: s.score
            }))
          },
          shouldContinue: true
        };
      }

      return {
        success: true,
        data: { matched_skill: null, reason: '没有匹配的预设技能，将自主生成' },
        shouldContinue: true
      };
    }
  },

  // ========== 工具2: 技能加载器 ==========
  {
    name: 'load_skill',
    description: '加载指定技能的完整内容，包括模板、变量定义、示例和常见问题解决方案。',
    parameters: [
      {
        name: 'skill_id',
        type: 'string',
        description: '技能ID',
        required: true
      }
    ],
    handler: async (params) => {
      const skill = SKILL_LIBRARY[params.skill_id];
      if (!skill) {
        return {
          success: false,
          error: `技能 ${params.skill_id} 不存在`,
          shouldContinue: false
        };
      }

      return {
        success: true,
        data: skill,
        shouldContinue: true
      };
    }
  },

  // ========== 工具3: 提示词生成器 ==========
  {
    name: 'generate_prompt',
    description: '根据用户需求和技能模板，生成完整的提示词。如果没有匹配技能，则自主创作。',
    parameters: [
      {
        name: 'user_request',
        type: 'string',
        description: '用户原始需求',
        required: true
      },
      {
        name: 'skill_template',
        type: 'object',
        description: '技能模板（如果有）',
        required: false
      },
      {
        name: 'variables',
        type: 'object',
        description: '变量填充值',
        required: false
      },
      {
        name: 'reference_analysis',
        type: 'string',
        description: '参考图分析结果',
        required: false
      }
    ],
    handler: async (params) => {
      // 这个工具的实际逻辑由 Claude 执行
      // 这里只是结构定义
      return {
        success: true,
        data: {
          prompt_v1: '',  // Claude 会填充
          chinese_texts: [],
          generation_notes: ''
        },
        shouldContinue: true
      };
    }
  },

  // ========== 工具4: 网络搜索 ==========
  {
    name: 'web_search',
    description: '搜索网络获取最新的提示词技巧、风格参考、最佳实践等信息。当需要了解最新趋势或解决特定问题时使用。',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: '搜索查询',
        required: true
      },
      {
        name: 'search_type',
        type: 'string',
        description: '搜索类型',
        required: true,
        enum: ['prompt_techniques', 'style_reference', 'problem_solving', 'trend_research']
      }
    ],
    handler: async (params) => {
      // 调用实际的搜索 API
      // 这里是结构定义
      return {
        success: true,
        data: {
          results: [],
          summary: ''
        },
        shouldContinue: true
      };
    }
  },

  // ========== 工具5: 图片分析 ==========
  {
    name: 'analyze_image',
    description: '分析参考图片，提取风格特征、布局结构、颜色方案等信息。',
    parameters: [
      {
        name: 'image_url',
        type: 'string',
        description: '图片URL',
        required: true
      },
      {
        name: 'analysis_focus',
        type: 'array',
        description: '分析重点',
        required: false
      }
    ],
    handler: async (params) => {
      // 调用 Claude Vision API
      return {
        success: true,
        data: {
          style: '',
          layout: '',
          colors: [],
          elements: [],
          suggestions: []
        },
        shouldContinue: true
      };
    }
  },

  // ========== 工具6: 提示词优化 ==========
  {
    name: 'optimize_prompt',
    description: '根据评估结果或搜索到的技巧，优化现有提示词。',
    parameters: [
      {
        name: 'current_prompt',
        type: 'string',
        description: '当前提示词',
        required: true
      },
      {
        name: 'issues',
        type: 'array',
        description: '需要解决的问题列表',
        required: false
      },
      {
        name: 'optimization_tips',
        type: 'array',
        description: '优化技巧',
        required: false
      },
      {
        name: 'iteration',
        type: 'number',
        description: '当前迭代次数',
        required: true
      }
    ],
    handler: async (params) => {
      return {
        success: true,
        data: {
          optimized_prompt: '',
          changes_made: [],
          version: params.iteration + 1
        },
        shouldContinue: true
      };
    }
  },

  // ========== 工具7: 质量评估 ==========
  {
    name: 'evaluate_prompt',
    description: '评估提示词质量，检查是否满足所有要求。',
    parameters: [
      {
        name: 'prompt',
        type: 'string',
        description: '待评估的提示词',
        required: true
      },
      {
        name: 'user_requirements',
        type: 'string',
        description: '用户原始需求',
        required: true
      },
      {
        name: 'chinese_texts',
        type: 'array',
        description: '需要显示的中文文字列表',
        required: true
      },
      {
        name: 'skill_checklist',
        type: 'array',
        description: '技能质量检查清单',
        required: false
      }
    ],
    handler: async (params) => {
      return {
        success: true,
        data: {
          score: 0,  // 0-100
          passed: false,
          issues: [],
          suggestions: []
        },
        shouldContinue: true  // 如果分数不够，继续优化
      };
    }
  },

  // ========== 工具8: 最终输出 ==========
  {
    name: 'finalize_output',
    description: '当提示词达到质量要求时，输出最终结果。',
    parameters: [
      {
        name: 'final_prompt',
        type: 'string',
        description: '最终提示词',
        required: true
      },
      {
        name: 'chinese_texts',
        type: 'array',
        description: '中文文字清单',
        required: true
      },
      {
        name: 'generation_tips',
        type: 'array',
        description: '生成建议',
        required: false
      },
      {
        name: 'recommended_model',
        type: 'string',
        description: '推荐的生成模型',
        required: false
      }
    ],
    handler: async (params) => {
      return {
        success: true,
        data: params,
        shouldContinue: false  // 结束 ReAct 循环
      };
    }
  }
];
```

---

## 四、ReAct 循环实现

### 4.1 核心系统提示词

```typescript
// src/lib/super-agent/system-prompt.ts

export const SUPER_AGENT_SYSTEM_PROMPT = `你是一个专业的 AI 绘图提示词专家，采用 ReAct（推理-行动）策略来完成任务。

## 你的核心能力

1. **技能匹配**：识别用户需求，匹配预设的提示词技能模板
2. **自主创作**：当没有匹配技能时，自主创作高质量提示词
3. **迭代优化**：通过多轮优化，确保提示词质量
4. **工具使用**：智能决定何时使用搜索、图片分析等工具

## 可用工具

你可以使用以下工具：
- \`skill_matcher\`: 匹配预设技能
- \`load_skill\`: 加载技能详情
- \`generate_prompt\`: 生成提示词
- \`web_search\`: 搜索最佳实践
- \`analyze_image\`: 分析参考图片
- \`optimize_prompt\`: 优化提示词
- \`evaluate_prompt\`: 评估质量
- \`finalize_output\`: 输出最终结果

## ReAct 工作流程

每一轮你需要：
1. **Thought**: 分析当前状态，决定下一步行动
2. **Action**: 选择并调用合适的工具
3. **Observation**: 观察工具返回结果
4. 重复以上步骤直到任务完成

## 决策指南

### 何时使用 web_search
- 用户需求涉及最新趋势（如"2024年流行风格"）
- 遇到不确定的技术问题
- 需要了解特定领域的最佳实践
- 需要参考真实案例

### 何时使用 analyze_image
- 用户提供了参考图片
- 需要复制特定风格
- 需要理解图片结构用于重现

### 何时进行迭代优化
- 评估分数低于 85 分
- 存在明显问题（文字、布局、风格）
- 用户有额外要求未满足

### 何时结束
- 评估分数 >= 85 分
- 已达到最大迭代次数（5次）
- 所有用户需求都已满足

## 中文文字处理规则（最重要！）

1. **保留中文原文**：用户需要显示的中文必须原样保留在提示词中
2. **引号包裹**：中文文字必须用英文双引号 "" 包裹
3. **禁止翻译**：绝对不能将中文翻译成英文
4. **明确位置**：指明文字在图片中的显示位置
5. **添加约束**：使用 "All Chinese text must be exactly as specified with no other text"

### 正确示例
用户需求：生成一张海报，上面写着"新年快乐"
✓ 正确：A vibrant poster featuring Chinese text "新年快乐" displayed prominently in the center
✗ 错误：A vibrant poster with Happy New Year

## 输出格式

最终输出必须包含：
1. **英文提示词**：完整的、可直接使用的提示词
2. **中文文字清单**：列出所有需要在图片中显示的中文
3. **生成建议**：模型选择、参数设置等建议

现在，请根据用户需求开始工作。记住：始终保持 ReAct 思维模式，每一步都要思考、行动、观察。`;
```

### 4.2 ReAct 循环处理器

```typescript
// src/lib/super-agent/react-loop.ts

import Anthropic from '@anthropic-ai/sdk';
import { SUPER_AGENT_TOOLS } from './tools';
import { SUPER_AGENT_SYSTEM_PROMPT } from './system-prompt';

interface ReActState {
  iteration: number;
  maxIterations: number;
  thoughtHistory: ThoughtStep[];
  currentPrompt: string | null;
  evaluationScore: number;
  isComplete: boolean;
}

interface ThoughtStep {
  thought: string;
  action: string;
  actionInput: Record<string, any>;
  observation: string;
}

export async function runReActLoop(
  userRequest: string,
  referenceImages?: string[],
  onProgress?: (step: ThoughtStep) => void
): Promise<FinalOutput> {
  const anthropic = new Anthropic();

  const state: ReActState = {
    iteration: 0,
    maxIterations: 5,
    thoughtHistory: [],
    currentPrompt: null,
    evaluationScore: 0,
    isComplete: false
  };

  // 构建初始消息
  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildInitialPrompt(userRequest, referenceImages)
    }
  ];

  // ReAct 循环
  while (!state.isComplete && state.iteration < state.maxIterations) {
    state.iteration++;

    // 调用 Claude 进行推理
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 4096,
      system: SUPER_AGENT_SYSTEM_PROMPT,
      tools: formatToolsForClaude(SUPER_AGENT_TOOLS),
      messages
    });

    // 处理响应
    for (const block of response.content) {
      if (block.type === 'text') {
        // 解析 Thought
        const thought = extractThought(block.text);
        if (thought) {
          console.log(`[Iteration ${state.iteration}] Thought: ${thought}`);
        }
      } else if (block.type === 'tool_use') {
        // 执行工具调用
        const toolName = block.name;
        const toolInput = block.input as Record<string, any>;

        console.log(`[Iteration ${state.iteration}] Action: ${toolName}`);
        console.log(`[Iteration ${state.iteration}] Input:`, toolInput);

        // 找到并执行工具
        const tool = SUPER_AGENT_TOOLS.find(t => t.name === toolName);
        if (tool) {
          const result = await tool.handler(toolInput);

          console.log(`[Iteration ${state.iteration}] Observation:`, result);

          // 记录步骤
          const step: ThoughtStep = {
            thought: '',  // 从前面的 text block 获取
            action: toolName,
            actionInput: toolInput,
            observation: JSON.stringify(result.data)
          };
          state.thoughtHistory.push(step);

          // 通知进度
          if (onProgress) {
            onProgress(step);
          }

          // 检查是否完成
          if (toolName === 'finalize_output' && result.success) {
            state.isComplete = true;
            return result.data as FinalOutput;
          }

          // 检查评估分数
          if (toolName === 'evaluate_prompt' && result.data?.score) {
            state.evaluationScore = result.data.score;
            if (result.data.score >= 85) {
              // 分数够了，下一步应该是 finalize
            }
          }

          // 添加工具结果到消息
          messages.push({
            role: 'assistant',
            content: response.content
          });
          messages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            }]
          });
        }
      }
    }

    // 检查是否需要继续
    if (response.stop_reason === 'end_turn' && !state.isComplete) {
      // Claude 主动结束但任务未完成，可能需要提示继续
      messages.push({
        role: 'user',
        content: '请继续完成任务。如果提示词已经足够好（评估分数 >= 85），请使用 finalize_output 工具输出最终结果。'
      });
    }
  }

  // 达到最大迭代次数
  throw new Error('达到最大迭代次数，任务未完成');
}

function buildInitialPrompt(userRequest: string, referenceImages?: string[]): string {
  let prompt = `## 用户需求\n${userRequest}\n`;

  if (referenceImages && referenceImages.length > 0) {
    prompt += `\n## 参考图片\n用户提供了 ${referenceImages.length} 张参考图片，请先使用 analyze_image 工具分析。\n`;
  }

  prompt += `\n请开始 ReAct 流程，首先思考应该如何处理这个需求。`;

  return prompt;
}

function formatToolsForClaude(tools: AgentTool[]): Anthropic.Tool[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.parameters.reduce((acc, param) => {
        acc[param.name] = {
          type: param.type,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {})
        };
        return acc;
      }, {} as Record<string, any>),
      required: tool.parameters.filter(p => p.required).map(p => p.name)
    }
  }));
}

function extractThought(text: string): string | null {
  const match = text.match(/Thought:\s*(.+?)(?=Action:|$)/s);
  return match ? match[1].trim() : null;
}
```

---

## 五、API 路由实现

### 5.1 流式 API 端点

```typescript
// src/app/api/super-agent/generate/route.ts

import { NextRequest } from 'next/server';
import { runReActLoopStream } from '@/lib/super-agent/react-loop-stream';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: SuperAgentStreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const body = await request.json();
      const { userRequest, referenceImages } = body;

      // 发送开始事件
      await sendEvent({
        type: 'start',
        message: '开始分析需求...'
      });

      // 运行 ReAct 循环
      const result = await runReActLoopStream(
        userRequest,
        referenceImages,
        async (step) => {
          // 发送每一步的进度
          await sendEvent({
            type: 'thought_step',
            iteration: step.iteration,
            thought: step.thought,
            action: step.action,
            actionInput: step.actionInput
          });
        },
        async (observation) => {
          // 发送观察结果
          await sendEvent({
            type: 'observation',
            data: observation
          });
        }
      );

      // 发送完成事件
      await sendEvent({
        type: 'complete',
        result: {
          finalPrompt: result.final_prompt,
          chineseTexts: result.chinese_texts,
          generationTips: result.generation_tips,
          recommendedModel: result.recommended_model,
          iterationCount: result.iteration_count,
          matchedSkill: result.matched_skill
        }
      });

    } catch (error) {
      await sendEvent({
        type: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
```

---

## 六、前端组件实现

### 6.1 SuperAgentNode 组件结构

```typescript
// src/components/nodes/SuperAgentNode.tsx

import { useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';

interface SuperAgentNodeProps {
  data: SuperAgentNodeData;
  id: string;
}

export function SuperAgentNode({ data, id }: SuperAgentNodeProps) {
  const [userRequest, setUserRequest] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>([]);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [result, setResult] = useState<FinalOutput | null>(null);
  const [matchedSkill, setMatchedSkill] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setIsProcessing(true);
    setThoughtSteps([]);
    setResult(null);

    try {
      const response = await fetch('/api/super-agent/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRequest,
          referenceImages: connectedImages
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case 'thought_step':
                setThoughtSteps(prev => [...prev, {
                  iteration: event.iteration,
                  thought: event.thought,
                  action: event.action,
                  actionInput: event.actionInput,
                  observation: ''
                }]);
                setCurrentIteration(event.iteration);
                break;

              case 'observation':
                setThoughtSteps(prev => {
                  const updated = [...prev];
                  if (updated.length > 0) {
                    updated[updated.length - 1].observation =
                      JSON.stringify(event.data, null, 2);
                  }
                  return updated;
                });
                break;

              case 'skill_matched':
                setMatchedSkill(event.skillName);
                break;

              case 'complete':
                setResult(event.result);
                break;

              case 'error':
                console.error('Error:', event.error);
                break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [userRequest, connectedImages]);

  return (
    <div className="super-agent-node">
      {/* 输入区域 */}
      <div className="input-section">
        <textarea
          value={userRequest}
          onChange={(e) => setUserRequest(e.target.value)}
          placeholder="描述你想要生成的图片..."
          disabled={isProcessing}
        />
        <button onClick={handleGenerate} disabled={isProcessing}>
          {isProcessing ? '思考中...' : '生成提示词'}
        </button>
      </div>

      {/* 技能匹配显示 */}
      {matchedSkill && (
        <div className="skill-badge">
          🎯 匹配技能: {matchedSkill}
        </div>
      )}

      {/* ReAct 过程可视化 */}
      <div className="react-visualization">
        {thoughtSteps.map((step, index) => (
          <div key={index} className="thought-step">
            <div className="iteration">迭代 {step.iteration}</div>
            <div className="thought">
              <span className="label">💭 思考:</span>
              {step.thought}
            </div>
            <div className="action">
              <span className="label">🔧 行动:</span>
              {step.action}
            </div>
            {step.observation && (
              <div className="observation">
                <span className="label">👁 观察:</span>
                <pre>{step.observation}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 最终结果 */}
      {result && (
        <div className="result-section">
          <h3>✨ 最终提示词</h3>
          <pre className="final-prompt">{result.finalPrompt}</pre>

          <h4>📝 中文文字清单</h4>
          <ul>
            {result.chineseTexts.map((text, i) => (
              <li key={i}>"{text}"</li>
            ))}
          </ul>

          <h4>💡 生成建议</h4>
          <ul>
            {result.generationTips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>

          <div className="meta-info">
            <span>推荐模型: {result.recommendedModel}</span>
            <span>迭代次数: {result.iterationCount}</span>
          </div>
        </div>
      )}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

---

## 七、典型工作流示例

### 示例1: 匹配预设技能

```
用户输入: "帮我生成一个手持透明卡片的产品展示图，展示我的AI平台'创意无限'"

Iteration 1:
  Thought: 用户需要产品展示图，提到了"手持透明卡片"，这是一个典型的产品展示场景。
           让我先匹配预设技能。
  Action: skill_matcher
  Input: { user_request: "帮我生成一个手持透明卡片的产品展示图..." }
  Observation: { matched_skill: "product-showcase", confidence: 0.85 }

Iteration 2:
  Thought: 匹配到了 product-showcase 技能，置信度很高。让我加载完整的技能模板。
  Action: load_skill
  Input: { skill_id: "product-showcase" }
  Observation: { ... 完整的技能模板 ... }

Iteration 3:
  Thought: 获得了技能模板，需要从用户需求中提取变量值来填充模板。
           产品名称是"创意无限"，但没有提供具体功能列表，需要合理补充。
  Action: generate_prompt
  Input: {
    user_request: "...",
    skill_template: { ... },
    variables: {
      PRODUCT_NAME: "创意无限",
      PRODUCT_TYPE: "a creative AI platform",
      FEATURE_ICONS: "tool icons with labels: 图像生成, AI智能体, 创意工具"
    }
  }
  Observation: { prompt_v1: "A hand holding a glowing transparent glass card..." }

Iteration 4:
  Thought: 初版提示词已生成，让我评估质量。
  Action: evaluate_prompt
  Input: { prompt: "...", user_requirements: "...", chinese_texts: ["创意无限", ...] }
  Observation: { score: 88, passed: true, issues: [] }

Iteration 5:
  Thought: 评估分数88分，超过85分阈值，可以输出最终结果。
  Action: finalize_output
  Input: { final_prompt: "...", chinese_texts: [...], generation_tips: [...] }

完成！
```

### 示例2: 自主生成（无匹配技能）

```
用户输入: "帮我生成一张赛博朋克风格的城市夜景，天空中有巨大的全息广告"

Iteration 1:
  Thought: 这是一个风格化场景生成需求，让我先尝试匹配技能。
  Action: skill_matcher
  Input: { user_request: "..." }
  Observation: { matched_skill: null, reason: "没有匹配的预设技能" }

Iteration 2:
  Thought: 没有匹配的预设技能，需要自主生成。
           赛博朋克风格有特定的视觉语言，让我搜索一下最佳实践。
  Action: web_search
  Input: { query: "cyberpunk style AI image prompt best practices", search_type: "style_reference" }
  Observation: { results: [...], summary: "赛博朋克风格关键词：neon lights, rain-soaked streets, holographic displays..." }

Iteration 3:
  Thought: 获得了风格参考，现在可以生成提示词了。
  Action: generate_prompt
  Input: { user_request: "...", reference_analysis: "...", optimization_tips: [...] }
  Observation: { prompt_v1: "A breathtaking cyberpunk cityscape at night..." }

Iteration 4:
  Thought: 检查提示词质量。
  Action: evaluate_prompt
  Input: { ... }
  Observation: { score: 78, issues: ["缺少具体的霓虹灯颜色描述"] }

Iteration 5:
  Thought: 分数不够，需要优化。
  Action: optimize_prompt
  Input: { current_prompt: "...", issues: ["缺少具体的霓虹灯颜色描述"], iteration: 1 }
  Observation: { optimized_prompt: "...with vibrant neon lights in pink, cyan and purple..." }

Iteration 6:
  Thought: 再次评估优化后的提示词。
  Action: evaluate_prompt
  Input: { ... }
  Observation: { score: 91, passed: true }

Iteration 7:
  Thought: 分数达标，输出最终结果。
  Action: finalize_output
  Input: { ... }

完成！
```

---

## 八、下一步实现计划

1. **Phase 1**: 实现技能库数据结构和基础工具
2. **Phase 2**: 实现 ReAct 循环核心逻辑
3. **Phase 3**: 实现流式 API 和前端组件
4. **Phase 4**: 集成搜索和图片分析工具
5. **Phase 5**: 测试和优化迭代逻辑
