// 预设技能库 - 8个完整的提示词技能模板
// 基于 Gemini 图片生成最佳实践优化：叙事化描述、摄影术语、分步指令
// 支持 Seedream 模型的 hex 颜色转换

import type { SkillTemplate } from '@/types/super-agent';

/**
 * Hex 颜色到描述性名称的映射表
 * 用于将提示词中的 hex 颜色代码转换为描述性名称，避免图片模型将其渲染为文字
 */
const HEX_COLOR_MAP: Record<string, string> = {
  // 深色背景
  '#0a0a0f': 'deep space black',
  '#0f172a': 'deep navy blue',
  '#1a1a2e': 'dark purple-blue',
  '#16213e': 'midnight blue',
  '#1e293b': 'dark charcoal gray',

  // 浅色/纸张背景
  '#fefce8': 'warm cream',
  '#fffbeb': 'antique white',
  '#f5f5f4': 'cool white',
  '#fef3c7': 'light yellow',
  '#fef9c3': 'pale yellow',
  '#d6cfc7': 'kraft brown',
  '#f5f5dc': 'beige',

  // 霓虹/强调色
  '#00f0ff': 'bright cyan',
  '#06b6d4': 'cyan',
  '#3b82f6': 'electric blue',
  '#8b5cf6': 'violet purple',
  '#a855f7': 'vibrant purple',
  '#d946ef': 'magenta purple',
  '#ec4899': 'hot pink',
  '#10b981': 'emerald green',
  '#34d399': 'light emerald',
  '#22c55e': 'green',
  '#f59e0b': 'warm amber',
  '#fbbf24': 'golden yellow',
  '#f97316': 'bright orange',
  '#f43f5e': 'rose red',
  '#ef4444': 'bright red',
  '#6b7280': 'medium gray',
  '#9ca3af': 'light gray',

  // 手绘风格常用色
  '#e07a5f': 'terracotta',
  '#81b29a': 'sage green',
  '#f2cc8f': 'golden yellow',
  '#e5989b': 'dusty rose',
  '#92400e': 'warm brown',
};

/**
 * 将提示词中的 hex 颜色代码转换为描述性颜色名称
 * 避免图片生成模型将 hex 代码当作文字渲染（如 #fefce8 显示在图片中）
 * 适用于所有图片模型
 */
export function convertPromptForSeedream(prompt: string): string {
  let converted = prompt;

  // 替换所有已知的 hex 颜色
  for (const [hex, name] of Object.entries(HEX_COLOR_MAP)) {
    // 匹配带括号的格式: (#0f172a) 或不带括号的格式
    const patterns = [
      new RegExp(`\\(${hex}\\)`, 'gi'),
      new RegExp(hex, 'gi'),
    ];

    for (const pattern of patterns) {
      converted = converted.replace(pattern, name);
    }
  }

  // 处理未知的 hex 颜色 - 转换为通用描述
  converted = converted.replace(
    /#([0-9A-Fa-f]{6})\b/g,
    (match) => {
      // 简单的颜色分析
      const hex = match.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);

      // 根据 RGB 值判断大致颜色
      const brightness = (r + g + b) / 3;
      if (brightness < 50) return 'very dark color';
      if (brightness < 100) return 'dark color';
      if (brightness > 200) return 'light color';

      if (r > g && r > b) return 'reddish color';
      if (g > r && g > b) return 'greenish color';
      if (b > r && b > g) return 'bluish color';

      return 'neutral color';
    }
  );

  // 移除任何剩余的括号中的颜色代码格式
  converted = converted.replace(/\s*\([^)]*#[0-9A-Fa-f]{6}[^)]*\)/g, '');

  return converted;
}

/**
 * 判断是否为 Seedream 模型
 */
export function isSeedreamModel(model: string): boolean {
  return model.toLowerCase().includes('seedream');
}

/**
 * Gemini 图片生成最佳实践（来自官方文档）：
 *
 * 1. 叙事化描述 > 关键词堆砌：用自然语言完整描述场景
 * 2. 详细具体：描述材质、结构、元素细节（如"精灵板甲 + 银色叶纹 + 高领 + 鹰翼肩甲"）
 * 3. 提供上下文与用途：说明图片用于什么场景
 * 4. 分步指令：复杂场景分段描述（先背景、再前景、最后关键道具）
 * 5. 语义负面提示：描述想要的而非"不要什么"
 * 6. 摄影/电影术语：wide-angle shot、macro shot、low-angle perspective 等
 * 7. 中文文字：用双引号包裹，限制 ≤200 字/张
 */

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
    basePrompt: `A cinematic close-up photograph captures a human hand elegantly holding a transparent glass card that emits a soft, ethereal glow. The scene is set against a pure black background, creating dramatic contrast.

CARD DESIGN:
The card displays {{PRODUCT_TYPE}} interface with the title "{{PRODUCT_NAME}}" rendered in clean, modern typography {{BADGE_TEXT}}. {{USERNAME_TEXT}}{{SLOGAN_TEXT}}{{URL_TEXT}} The interface showcases {{FEATURE_ICONS}}, each icon designed with subtle luminosity.

MATERIAL & LIGHTING:
The card features holographic glass material with prismatic light refraction along its edges. Beautiful gradient neon edge lighting in {{COLORS}} creates a mesmerizing glow effect. The frosted glass has visible depth with internal light diffusion.

PHOTOGRAPHY STYLE:
Shot with a 50mm lens at f/1.4 for shallow depth of field, cinematic dramatic lighting from top-left, professional studio photography quality. The hand is naturally posed, skin texture visible but not distracting.

Technical: Photorealistic rendering, ultra high quality, 8K resolution, ray-traced reflections.`,
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
    basePrompt: `A beautifully designed horizontal tutorial infographic that guides users through {{STEP_COUNT}} sequential steps. The composition flows naturally from left to right, inviting the viewer on a visual journey.

LAYOUT STRUCTURE:
Each step is presented as an individual glassmorphism card with a prominent numbered circle badge (1, 2, 3...) in the top-left corner. Below each illustration is a Chinese label clearly identifying the action. Elegant curved arrows with subtle gradient fills connect each step, creating visual continuity.

STEP CONTENT:
{{STEPS_CONTENT}}

VISUAL DESIGN:
The background features a sophisticated dark gradient (deep navy to charcoal) that makes the content pop. Each card has frosted glass effect with {{COLORS}} accent colors creating soft glowing edges. The icons within each step use consistent stroke weights and rounded corners for a friendly, approachable feel.

TYPOGRAPHY & SPACING:
Chinese labels are rendered in a clean sans-serif font with adequate letter-spacing for readability. Generous padding between steps (at least 40px) ensures the design breathes. The numbered badges use bold typography with contrasting background circles.

Technical: Professional infographic design, 8K resolution, balanced composition with clear visual hierarchy. All Chinese text must be exactly as specified with no other text.`,
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
    basePrompt: `A breathtaking Pixar-quality 3D animated scene that captures a pivotal moment in an emotional story. The frame is composed like a cinematic still from a feature film, with every element contributing to the narrative.

SCENE NARRATIVE:
{{SCENE_DESCRIPTION}}

CHARACTER DESIGN (Consistent Across All Scenes):
{{CHARACTER_DESCRIPTION}}
The character features exaggerated Pixar-style proportions: slightly larger head-to-body ratio, oversized expressive eyes with visible catch lights, smooth subsurface-scattered skin with subtle blush on cheeks, and meticulously detailed clothing with realistic fabric folds.

CINEMATOGRAPHY:
Shot with a virtual 35mm lens equivalent, employing the rule of thirds for character placement. Dramatic three-point lighting setup: warm key light from 45° above-left, cool fill light opposite, and soft rim light to separate character from background. Shallow depth of field (f/2.8 equivalent) blurs the background into painterly bokeh.

ENVIRONMENT & ATMOSPHERE:
The background tells its own story with environmental storytelling details. Volumetric light rays pierce through, dust particles float in the air, and color temperature shifts create emotional depth. Rich, saturated Pixar color palette with complementary color harmony.

TEXT ELEMENTS:
{{TEXT_PLACEMENT}}

Technical: Pixar-quality 3D rendering, subsurface scattering on skin, ray-traced global illumination, 8K resolution masterpiece. All Chinese text must be exactly as specified with no other text.`,
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
    basePrompt: `A stunning presentation slide that commands attention and communicates with clarity. This is a single slide from a premium keynote presentation, designed to impress executives and stakeholders.

VISUAL FOUNDATION:
{{STYLE_DESCRIPTION}}
The background uses subtle texture and gradient transitions that add depth without distraction. A consistent visual language ties together all elements.

CONTENT LAYOUT:
{{SLIDE_CONTENT}}
The information hierarchy is crystal clear: primary message dominates, supporting details are organized in logical groupings, and visual elements reinforce the narrative.

DESIGN PRINCIPLES:
Following the golden ratio for element placement, the slide maintains ample white space (at least 30% of total area). Typography uses a maximum of two font families: a bold display font for headlines and a readable sans-serif for body text. Text sizes follow a clear hierarchy (title 48pt equivalent, subtitle 24pt, body 18pt).

PROFESSIONAL POLISH:
Subtle drop shadows create depth without looking dated. Icon sets are consistent in style (outlined or filled, not mixed). Color accents draw attention to key data points. Alignment is pixel-perfect with invisible grid structure.

Technical: High-fidelity presentation graphic, 16:9 aspect ratio, 4K resolution, print-ready quality. All Chinese text must be exactly as specified with no other text.`,
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
    basePrompt: `A sophisticated {{LAYER_COUNT}}-layer technical architecture diagram that clearly communicates system design to both technical and non-technical stakeholders. The diagram tells the story of how data flows through the system.

BACKGROUND & CANVAS:
A deep gradient background transitioning from dark navy (#0f172a) at the top to charcoal (#1e293b) at the bottom, providing excellent contrast for the diagram elements. Subtle grid lines at 10% opacity suggest precision and engineering rigor.

LAYER STRUCTURE:
{{LAYERS_CONTENT}}

Each layer is represented as a wide rounded rectangle (border-radius: 12px) with a distinctive colored left border (4px width) that acts as a visual identifier. Layer titles appear in bold at the top-left of each container. Components within each layer are arranged horizontally with consistent spacing (24px gaps).

COMPONENT DESIGN:
Individual component boxes feature glassmorphism styling: frosted glass background (rgba(255,255,255,0.1)), subtle backdrop blur, and thin glowing borders matching the layer color. Each box has generous internal padding (16px) ensuring Chinese text remains clearly readable.

CONNECTIONS & DATA FLOW:
Vertical arrows with gradient fills connect layers from top to bottom, indicating data flow direction. Arrow heads are subtle but clear. Optional horizontal lines within layers show inter-component communication.

VISUAL HIERARCHY:
From top (user-facing) to bottom (infrastructure), colors shift from warm (orange, red) to cool (blue, purple), intuitively mapping to the abstraction levels. Icon badges (optional) in each component box reinforce meaning.

Technical: Modern tech documentation style, 8K resolution, balanced symmetry, professional aesthetic. All Chinese text must be exactly as specified with no other text.`,
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
    basePrompt: `An elegant travel itinerary visualization that transforms trip planning into an inspiring visual experience. The design evokes wanderlust while maintaining practical utility.

OVERALL COMPOSITION:
{{DAY_COUNT}} day cards arranged horizontally across the canvas, creating a timeline narrative of the journey. The layout suggests progression from Day 1 to the final day, with subtle connecting elements between cards.

BACKGROUND ATMOSPHERE:
A rich dark gradient background (deep purple-blue #1a1a2e transitioning to midnight #16213e) with subtle ambient glow effects. Delicate travel-themed patterns at very low opacity (5-10%): compass roses, dotted flight paths, or landmark silhouettes create atmosphere without distraction.

HEADER SECTION:
{{HEADER_TEXT}}
The destination name appears in elegant serif typography, complemented by decorative elements that hint at the location's character.

DAY CARDS:
Each day card features:
- Colored top border gradient (Day 1: warm orange, Day 2: coral red, Day 3: teal, etc.) creating a rainbow progression
- Dark glassmorphism body (frosted glass effect with subtle blur)
- Day header in bold with a themed subtitle (e.g., "Day 1 · 初见姑苏")
- Timeline layout with time markers on the left, activity descriptions on the right
- Small travel icons (location pins, cameras, food utensils, museums) beside each activity
{{DAYS_CONTENT}}

SUMMARY FOOTER:
{{SUMMARY_BAR}}
Key trip statistics displayed in a unified bar: total budget, accommodation count, highlighted attractions, with appropriate icons.

VISUAL POLISH:
Consistent icon style throughout, subtle drop shadows for depth, hover-state-ready design. Typography hierarchy: day number (bold, 24pt), day subtitle (medium, 16pt), timeline items (regular, 14pt).

Technical: Premium travel infographic quality, 8K resolution, social-media-ready aspect ratio. All Chinese text must be exactly as specified with no other text.`,
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

  // ========== 技能7: 科技新闻速报 ==========
  'news-infographic': {
    metadata: {
      id: 'news-infographic',
      name: '科技新闻速报',
      description: '生成高端科技感的新闻速报图，采用深色渐变背景、霓虹光效、数据可视化元素，展示6条新闻，适合科技/AI领域分享',
      keywords: ['新闻', '资讯', '热点', '头条', '早报', '晚报', '日报', '快讯', '速报', '要闻', '大事件', '今日新闻', '热点新闻', '新闻速递', '新闻摘要', 'AI新闻', '科技新闻'],
      category: 'news',
      difficulty: 'hard',
      requiredInputs: ['新闻标题', '新闻内容列表'],
      optionalInputs: ['日期', '主题']
    },
    basePrompt: `A cutting-edge tech news dashboard that feels like stepping into a Bloomberg terminal crossed with a Blade Runner command center. The design communicates authority, urgency, and technological sophistication.

ATMOSPHERIC FOUNDATION:
The canvas is set on a deep space black (#0a0a0f) base, gradually transitioning to dark navy (#0f172a) at the edges. Subtle visual effects add life without distraction: matrix-style data streams cascade at 5% opacity along the far edges, holographic particles drift slowly across the scene, and circuit board patterns emerge faintly in the lower corners. A gentle blue-purple gradient glow emanates from behind the content area, suggesting hidden computational power.

HEADER SECTION (Top 12% of canvas):
On the left, the Chinese title "{{MAIN_TITLE}}" commands attention in bold white typography (48pt equivalent) with a cyan (#00f0ff) outer glow that suggests energy and immediacy. The font is futuristic sans-serif, clean yet distinctive.
On the right, the date "{{DATE_SUBTITLE}}" sits within a holographic pill badge - semi-transparent background with thin cyan border and soft luminescence. Below the header, a horizontal scanning line in cyan (2px height) pulses subtly from left to right, mimicking real-time data feeds.

MAIN CONTENT - 6 NEWS CARDS IN ASYMMETRIC 2×3 GRID:
{{NEWS_CARDS}}

CARD DESIGN SYSTEM:
Each card embodies glassmorphism principles: frosted glass effect with backdrop blur (20px), semi-transparent background (rgba(255,255,255,0.05)), and thin glowing borders in category-specific colors. Cards cast subtle shadows that suggest depth without heaviness.

Category color coding creates instant visual hierarchy:
- 突发/Breaking: Rose red (#f43f5e) - urgent, attention-grabbing
- 产品/Product: Purple (#a855f7) - innovative, premium
- 投资/Investment: Amber (#f59e0b) - financial, opportunity
- 商业/Business: Emerald (#10b981) - growth, success
- 科技/Tech: Electric blue (#3b82f6) - cutting-edge, digital
- 安全/Safety: Rose (#f43f5e) - warning, important

Each card contains: holographic category icon (top-left), colored category badge pill, bold headline in white, two-line description in soft gray, and a stats bar at the bottom showing relevant metrics with emoji indicators.

DECORATIVE ELEMENTS:
Floating translucent hexagons and triangles drift in the corners, suggesting data nodes in a network. Small data visualization patterns (line graphs, bar charts) appear at 5% opacity within card backgrounds. Lens flare from top creates sense of light source. Particle dust floats throughout.

Technical: Cyberpunk-meets-Bloomberg aesthetic, ultra high quality, 8K resolution, cinematic lighting with depth of field on background elements. All Chinese text must be exactly as specified with no other text.`,
    variables: [
      {
        name: 'MAIN_TITLE',
        description: '主标题',
        type: 'text',
        required: true,
        defaultValue: '今日AI速报',
        examples: ['今日AI速报', '科技快讯', 'AI Daily']
      },
      {
        name: 'DATE_SUBTITLE',
        description: '日期',
        type: 'text',
        required: false,
        defaultValue: '',
        examples: ['2025.11.30', '11月30日 周日']
      },
      {
        name: 'NEWS_CARDS',
        description: '6张新闻卡片，2x3网格布局，每张包含：图标、分类、标题、内容、数据指标',
        type: 'list',
        required: true,
        examples: [
          'Card 1 (top-left, HERO size spans 2 columns): Glassmorphism card with cyan border glow. AI brain hologram icon. Category badge "突发" in rose red. Large headline "OpenAI办公室紧急封锁" in white bold. Subtext "收到反AI极端分子暴力威胁 旧金山总部全面戒备" in grey. Bottom stats bar: "🔥 热度 98" "📍 旧金山".',
          'Card 2: Purple border glow. Rocket icon. Badge "产品" in purple. Headline "Gemini 3登顶榜首" in white. Subtext "LMArena评分1501创历史新高" in grey. Stats: "📊 +15%" "🏆 #1".'
        ]
      }
    ],
    examples: [
      {
        userRequest: '帮我生成今日AI新闻速报',
        filledPrompt: `A futuristic tech news dashboard with cyberpunk-inspired design. Dark background with holographic elements and data visualization aesthetics.

BACKGROUND:
Deep space black (#0a0a0f) to dark navy (#0f172a) gradient. Subtle circuit board pattern overlay at 3% opacity. Floating holographic particles in cyan and purple. Soft blue light bloom from top-left corner. Matrix-style vertical data streams on far edges at 5% opacity.

HEADER SECTION (top 12%):
Left: Bold Chinese title "今日AI速报" in large white text (48pt) with cyan (#00f0ff) outer glow effect, modern geometric sans-serif font style.
Right: "2025.11.30" in a holographic pill badge - semi-transparent background with thin cyan border and soft glow, white text.
Below header: Horizontal cyan scanning line effect (2px) with gradient fade on edges, suggesting real-time data feed.

MAIN CONTENT - 6 NEWS CARDS in 2x3 asymmetric grid:

ROW 1:
CARD 1 (HERO - spans left 60% width, taller): Large glassmorphism card with frosted glass effect and rose red (#f43f5e) glowing border. Top-left: Warning triangle hologram icon in red. Category badge "突发" in rose red pill with white text. Large headline "OpenAI办公室紧急封锁" in bold white (28pt). Below: "收到反AI极端分子暴力威胁" in light grey (16pt), next line "旧金山总部全面戒备 员工居家办公" in grey. Bottom of card: mini stats bar with "🔥 热度 98%" and "📍 旧金山" in small cyan text.

CARD 2 (right 40%): Glassmorphism card with purple (#a855f7) border glow. Rocket launch hologram icon. Badge "产品" in purple. Headline "Gemini 3登顶AI榜首" in white bold (22pt). Subtext "LMArena评分1501创历史新高 全面超越GPT-5" in grey (14pt). Stats: "📊 评分1501" "🏆 排名#1".

ROW 2:
CARD 3: Glassmorphism with cyan (#00f0ff) border. Dollar sign hologram icon. Badge "投资" in amber (#f59e0b). Headline "外资抢筹中国AI资产" in white bold. Subtext "瑞银看涨恒科技7100点 一级市场LP重返聚焦AI" in grey. Stats: "💰 目标7100" "📈 +12%".

CARD 4: Glassmorphism with emerald (#10b981) border. Handshake hologram icon. Badge "商业" in emerald. Headline "Anthropic获150亿投资" in white bold. Subtext "微软英伟达战略合作 估值达350亿美元" in grey. Stats: "💵 $150亿" "🎯 估值$350亿".

ROW 3:
CARD 5: Glassmorphism with electric blue (#3b82f6) border. Chip/processor hologram icon. Badge "科技" in blue. Headline "OpenAI推出GPT-5.1" in white bold. Subtext "对话能力大幅提升 支持更个性化定制" in grey. Stats: "🚀 新版本" "⚡ 性能+40%".

CARD 6: Glassmorphism with rose (#f43f5e) border. Scale/balance hologram icon. Badge "安全" in rose. Headline "AI诉讼案件激增" in white bold. Subtext "7起ChatGPT情感操纵诉讼 涉及自杀教唆指控" in grey. Stats: "⚖️ 7起诉讼" "⚠️ 高风险".

DECORATIVE ELEMENTS:
- Floating translucent hexagons in corners
- Small data visualization charts as card backgrounds (line graphs, bar charts at 5% opacity)
- Holographic lens flare from top
- Subtle particle dust floating throughout

All Chinese text must be exactly as specified with no other text. Ultra high quality, 8K resolution, cinematic lighting, depth of field effect on background elements.`,
        chineseTexts: ['今日AI速报', '2025.11.30', '突发', 'OpenAI办公室紧急封锁', '收到反AI极端分子暴力威胁', '旧金山总部全面戒备 员工居家办公', '产品', 'Gemini 3登顶AI榜首', 'LMArena评分1501创历史新高 全面超越GPT-5', '投资', '外资抢筹中国AI资产', '瑞银看涨恒科技7100点 一级市场LP重返聚焦AI', '商业', 'Anthropic获150亿投资', '微软英伟达战略合作 估值达350亿美元', '科技', 'OpenAI推出GPT-5.1', '对话能力大幅提升 支持更个性化定制', '安全', 'AI诉讼案件激增', '7起ChatGPT情感操纵诉讼 涉及自杀教唆指控']
      }
    ],
    qualityChecklist: [
      '是否有6条完整新闻（标题+详细内容+数据指标）',
      '是否采用2x3网格布局，头条新闻更大更突出',
      '是否有科技感元素（霓虹光效、玻璃态、全息图标）',
      '每条新闻是否有分类标签和数据指标',
      '背景是否有深色渐变和科技纹理',
      '配色是否协调（深色背景+霓虹点缀）',
      '中文文字是否正确显示且清晰易读'
    ],
    commonIssues: [
      {
        issue: '科技感不够强',
        solution: '增加霓虹光效、全息元素、数据可视化',
        promptFix: 'with stronger cyberpunk elements: neon glow borders (#00f0ff cyan, #a855f7 purple), holographic icons, matrix-style data streams, glassmorphism cards with frosted glass effect'
      },
      {
        issue: '布局太单调',
        solution: '使用2x3不对称网格，头条更大',
        promptFix: 'with asymmetric 2x3 grid layout where the HERO card (breaking news) spans 60% width and is taller, creating visual hierarchy'
      },
      {
        issue: '信息不够丰富',
        solution: '每条新闻添加数据指标和统计',
        promptFix: 'each card MUST have: category badge, headline, 2-line description, and bottom stats bar with relevant metrics (percentages, rankings, amounts)'
      },
      {
        issue: '缺少视觉层次',
        solution: '用颜色和大小区分重要性',
        promptFix: 'with clear visual hierarchy: breaking news in rose/red accent, product news in purple, investment in amber, business in emerald, tech in blue, safety in rose'
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
    basePrompt: `A sophisticated personal finance dashboard that transforms mundane budgeting into an insightful visual experience. The design balances data density with aesthetic elegance, making financial health easy to understand at a glance.

VISUAL FOUNDATION:
A calming dark gradient background transitions from deep slate (#0f172a) to charcoal (#1e293b), providing a professional canvas that reduces eye strain while highlighting the data. Subtle grid patterns at 5% opacity suggest precision and financial rigor.

HEADER BANNER:
{{TITLE_TEXT}}
The month and year appear in clean, confident typography, possibly with a subtle icon (calendar or wallet) beside it.

DASHBOARD LAYOUT:
{{CHARTS_CONTENT}}

The dashboard is organized into logical zones:
- Summary Cards (top): Key metrics in glassmorphism cards - total income (green accent #10b981), total expenses (warm orange #f97316), and net balance (highlighted based on positive/negative)
- Main Visualization (center): A beautifully rendered donut/pie chart with smooth gradients, showing expense breakdown by category. Each segment has a distinct color from a harmonious palette.
- Category Legend (beside chart): Clean list with color swatches, category names in Chinese, amounts, and percentages
- Trend Area (optional): Small sparkline or bar chart showing month-over-month comparison

COLOR SEMANTICS:
Income/positive values use variations of green (#10b981, #34d399)
Expenses use a warm, non-alarming palette: soft blue (#3b82f6) for essential expenses, purple (#8b5cf6) for discretionary, orange (#f97316) for variable costs
Red (#ef4444) reserved only for budget overruns or warnings

CHART DESIGN:
Pie/donut charts feature subtle shadows creating 3D lift, smooth color gradients within segments, and generous spacing between slices. Data labels are positioned for clarity - either in legend or with leader lines. Numbers are formatted with thousand separators and ¥ symbol.

GLASSMORPHISM CARDS:
Each data card has frosted glass effect (backdrop-blur: 20px), thin white border at 10% opacity, subtle inner glow, and rounded corners (12px). Cards cast soft shadows to create hierarchy.

Technical: Premium financial dashboard aesthetic, 8K resolution, professional data visualization standards. All Chinese text must be exactly as specified with no other text.`,
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
  },

  // ========== 技能9: 手绘风格插画 ==========
  'hand-drawn-illustration': {
    metadata: {
      id: 'hand-drawn-illustration',
      name: '手绘风格插画',
      description: '生成水彩、马克笔、铅笔等传统媒介的手绘风格插画，包含纸张质感、手写字体、装饰性涂鸦元素',
      keywords: ['手绘', '水彩', '马克笔', '铅笔', '素描', '插画', '手写', '涂鸦', '草图', '手工', 'watercolor', 'sketch', 'doodle', '艺术', '手账', '笔记', '草稿', '手绘风'],
      category: 'illustration',
      difficulty: 'medium',
      requiredInputs: ['主题内容'],
      optionalInputs: ['媒介类型', '纸张风格', '配色方案']
    },
    basePrompt: `A {{STYLE_INTENSITY}} hand-drawn {{CONTENT_TYPE}}, {{MEDIUM_TYPE}} illustration style.

PAPER & TEXTURE FOUNDATION:
{{PAPER_DESCRIPTION}} texture background ({{PAPER_COLOR}}) with {{PAPER_DETAILS}} like a {{PAPER_METAPHOR}}. The paper itself tells a story - slightly worn edges, subtle fiber texture visible, perhaps a coffee ring stain or tape marks for authenticity.

MAIN COMPOSITION:
{{MAIN_CONTENT}}

HAND-DRAWN TYPOGRAPHY:
All text elements use authentic hand-lettering styles:
- Titles: {{TITLE_FONT_STYLE}} with decorative flourishes
- Labels: {{LABEL_FONT_STYLE}}
- Annotations: {{ANNOTATION_FONT_STYLE}}
Chinese text rendered in brush calligraphy or neat handwriting style, maintaining readability while feeling personal and crafted.

TRADITIONAL MEDIA TECHNIQUES:
{{MEDIA_TECHNIQUES}}
Key authenticity markers:
- Visible pencil construction lines (partially erased but still detectable)
- Watercolor texture bleeds where colors meet
- Marker bold outlines with slight wobble (not perfectly straight)
- Ink pooling at stroke endpoints
- Color slightly outside the lines in places
- Paper warping from wet media

DECORATIVE HAND-DRAWN ELEMENTS:
Scattered throughout the composition: {{DECORATIVE_ELEMENTS}}
These imperfect, spontaneous touches are the soul of hand-drawn aesthetic.

COLOR APPLICATION:
{{COLOR_SCHEME}}
Colors applied with visible brushstrokes or marker streaks, not flat digital fills. Gradients achieved through layered washes, not smooth transitions. White paper showing through in places adds luminosity.

Professional illustration quality, 8K resolution, {{LIGHTING_STYLE}}. All Chinese text must be exactly as specified with no other text.`,
    variables: [
      {
        name: 'STYLE_INTENSITY',
        description: '风格强度',
        type: 'text',
        required: false,
        defaultValue: 'vibrant',
        examples: ['vibrant', 'warm', 'playful', 'elegant', 'whimsical', 'cozy']
      },
      {
        name: 'CONTENT_TYPE',
        description: '内容类型',
        type: 'text',
        required: true,
        examples: ['infographic', 'illustration', 'diagram', 'poster', 'journal page', 'recipe card', 'travel sketch']
      },
      {
        name: 'MEDIUM_TYPE',
        description: '媒介类型',
        type: 'text',
        required: false,
        defaultValue: 'watercolor and marker',
        examples: ['watercolor and marker', 'pencil sketch', 'ink and watercolor', 'colored pencil', 'pen and ink', 'chalk pastel', 'mixed media']
      },
      {
        name: 'PAPER_DESCRIPTION',
        description: '纸张描述',
        type: 'text',
        required: false,
        defaultValue: 'Light warm cream paper',
        examples: ['Light warm cream paper', 'Aged vintage parchment', 'Clean white sketchbook', 'Kraft brown paper', 'Textured watercolor paper', 'Grid notebook']
      },
      {
        name: 'PAPER_COLOR',
        description: '纸张颜色（用描述性名称，不要用 hex 代码）',
        type: 'text',
        required: false,
        defaultValue: 'warm cream',
        examples: ['warm cream', 'antique white', 'cool white', 'kraft brown', 'pale yellow']
      },
      {
        name: 'PAPER_DETAILS',
        description: '纸张细节',
        type: 'text',
        required: false,
        defaultValue: 'subtle grid lines',
        examples: ['subtle grid lines', 'faint ruled lines', 'torn edges', 'aged spots and stains', 'visible paper grain', 'ring binder holes']
      },
      {
        name: 'PAPER_METAPHOR',
        description: '纸张类比',
        type: 'text',
        required: false,
        defaultValue: "designer's sketchpad",
        examples: ["designer's sketchpad", 'vintage notebook', "artist's journal", 'grandmother\'s recipe book', 'travel diary', 'student notebook']
      },
      {
        name: 'MAIN_CONTENT',
        description: '主要内容描述',
        type: 'text',
        required: true,
        examples: ['A collection of hand-drawn food illustrations arranged in a grid, each item labeled in Chinese calligraphy']
      },
      {
        name: 'TITLE_FONT_STYLE',
        description: '标题字体风格',
        type: 'text',
        required: false,
        defaultValue: 'bold brush calligraphy',
        examples: ['bold brush calligraphy', 'playful hand-lettering', 'elegant script', 'chunky marker text', 'vintage signage style']
      },
      {
        name: 'LABEL_FONT_STYLE',
        description: '标签字体风格',
        type: 'text',
        required: false,
        defaultValue: 'casual handwriting',
        examples: ['casual handwriting', 'neat print letters', 'cursive script', 'typewriter style']
      },
      {
        name: 'ANNOTATION_FONT_STYLE',
        description: '注释字体风格',
        type: 'text',
        required: false,
        defaultValue: 'small neat script in margins',
        examples: ['small neat script in margins', 'scribbled notes', 'circled callouts', 'arrow labels']
      },
      {
        name: 'MEDIA_TECHNIQUES',
        description: '媒介技法描述',
        type: 'text',
        required: false,
        defaultValue: 'Watercolor washes with wet-on-wet blending, marker outlines with varying line weights, pencil underdrawing visible in places',
        examples: [
          'Watercolor washes with wet-on-wet blending, marker outlines with varying line weights, pencil underdrawing visible in places',
          'Loose pencil sketching with cross-hatching for shadows, eraser marks and smudges for texture',
          'Bold ink outlines with confident strokes, watercolor fills that bleed slightly beyond borders'
        ]
      },
      {
        name: 'DECORATIVE_ELEMENTS',
        description: '装饰元素',
        type: 'text',
        required: false,
        defaultValue: 'hand-drawn stars, arrows, underlines, margin notes, sketch bubbles, checkmark doodles, small hearts, asterisks',
        examples: [
          'hand-drawn stars, arrows, underlines, margin notes, sketch bubbles, checkmark doodles',
          'floral doodles, vine borders, small birds, swirls and flourishes',
          'geometric shapes, dots and dashes, bracket frames, banner ribbons'
        ]
      },
      {
        name: 'COLOR_SCHEME',
        description: '配色方案（用描述性颜色名称，不要用 hex 代码）',
        type: 'text',
        required: false,
        defaultValue: 'Warm palette with terracotta, sage green, golden yellow, and dusty rose',
        examples: [
          'Warm palette with terracotta, sage green, golden yellow, and dusty rose',
          'Cool tones: navy blue, teal, lavender, with pops of coral',
          'Earth tones: burnt sienna, olive green, ochre, cream',
          'Vibrant rainbow: purple-pink gradient, cyan, emerald, amber'
        ]
      },
      {
        name: 'LIGHTING_STYLE',
        description: '光线风格',
        type: 'text',
        required: false,
        defaultValue: 'natural warm lighting as if photographed on a sunny desk',
        examples: ['natural warm lighting as if photographed on a sunny desk', 'soft diffused studio lighting', 'cozy evening lamp light']
      }
    ],
    examples: [
      {
        userRequest: '帮我生成一个手绘风格的科技新闻信息图',
        filledPrompt: `A vibrant hand-drawn infographic illustrating tech giants' strategic shifts, watercolor and marker illustration style.

PAPER & TEXTURE FOUNDATION:
Light warm cream paper texture background with subtle grid lines like a designer's sketchpad. The paper shows slight wear and authenticity.

MAIN COMPOSITION:
Top banner in watercolor wash (purple-pink gradient): hand-lettered title "科技巨头：路线之争" in white brush calligraphy with decorative flourishes.
Main layout: Three distinct sections separated by sketched dividing lines.
LEFT SECTION (Meta's Pivot): Illustration of a VR headset being crossed out in red marker, with green upward arrow (+3.4%) drawn next to it. Chinese text "Meta领衔元宇宙大撤退" in bold handwriting at top, followed by bullet points in casual script.
CENTER SECTION (Hardware Revival): Collection of hand-drawn product sketches (computers, servers, chips) in blue and teal markers. Chinese heading "硬件派逆袭" in energetic brush font.
RIGHT SECTION (AI Throne): Nvidia logo sketch in green marker with crown doodle above it. Chinese text "英伟达稳守AI王座" in bold.

HAND-DRAWN TYPOGRAPHY:
- Titles: bold brush calligraphy with decorative flourishes
- Labels: casual handwriting
- Annotations: small neat script in margins

TRADITIONAL MEDIA TECHNIQUES:
Watercolor washes with wet-on-wet blending, marker outlines with varying line weights, pencil underdrawing visible in places.
Visible pencil construction lines, watercolor texture bleeds, marker bold outlines with slight wobble.

DECORATIVE HAND-DRAWN ELEMENTS:
hand-drawn stars, arrows, underlines, margin notes, sketch bubbles, percentage symbols, checkmark doodles scattered throughout.

COLOR APPLICATION:
Vibrant palette with magenta purple, hot pink, electric blue, emerald green, medium gray for contrast notes.

Professional illustration, 8K resolution, natural warm lighting. All Chinese text must be exactly as specified with no other text.`,
        chineseTexts: ['科技巨头：路线之争', 'Meta领衔元宇宙大撤退', '硬件派逆袭', '英伟达稳守AI王座']
      },
      {
        userRequest: '画一个手绘食谱卡片',
        filledPrompt: `A cozy hand-drawn recipe card, watercolor and ink illustration style.

PAPER & TEXTURE FOUNDATION:
Vintage antique white paper texture background with faint ruled lines and slightly yellowed edges like grandmother's recipe book. Small splatter stains add authenticity.

MAIN COMPOSITION:
A recipe card layout with hand-illustrated ingredients arranged around the border (tomatoes, garlic, herbs in loose watercolor style). Center contains the recipe steps with numbered circles. Chinese title "番茄炒蛋" in playful brush lettering at top with a small heart doodle.

HAND-DRAWN TYPOGRAPHY:
- Title: playful hand-lettering with food doodle accents
- Ingredients list: neat print letters
- Steps: casual handwriting with circled numbers

TRADITIONAL MEDIA TECHNIQUES:
Loose watercolor food illustrations with visible brushstrokes, ink outlines that vary in thickness, pencil guidelines still faintly visible.

DECORATIVE HAND-DRAWN ELEMENTS:
small steam swirls above hot dishes, herb sprigs in corners, dotted borders, arrow pointing to tips, small stars next to key steps.

COLOR APPLICATION:
Appetizing palette: tomato red, golden yellow for eggs, green for herbs, warm brown for cooking vessels.

Professional illustration, 8K resolution, warm kitchen lighting. All Chinese text must be exactly as specified with no other text.`,
        chineseTexts: ['番茄炒蛋']
      }
    ],
    qualityChecklist: [
      '是否有明显的手绘质感（线条不完美、颜色溢出边界）',
      '纸张纹理是否真实（非纯白数字背景）',
      '是否包含手绘装饰元素（星星、箭头、涂鸦等）',
      '字体是否像手写而非数字字体',
      '颜色是否有笔触感（非平涂）',
      '是否有铅笔构图线等真实感细节',
      '中文文字是否正确显示'
    ],
    commonIssues: [
      {
        issue: '看起来太数字化，缺乏手绘感',
        solution: '强调传统媒介的不完美特征',
        promptFix: 'with visible pencil construction lines (partially erased), watercolor texture bleeds where colors meet, marker outlines with slight wobble, color slightly outside the lines in places'
      },
      {
        issue: '纸张背景太干净',
        solution: '添加真实纸张细节',
        promptFix: 'on aged paper texture with subtle coffee stains, worn edges, visible paper grain and fiber texture, slight yellowing'
      },
      {
        issue: '缺少手绘装饰元素',
        solution: '添加涂鸦和注释',
        promptFix: 'with hand-drawn decorative elements scattered throughout: stars, arrows, underlines, margin notes, sketch bubbles, checkmark doodles, small hearts, asterisks'
      },
      {
        issue: '颜色看起来是平涂',
        solution: '强调笔触和渐变技法',
        promptFix: 'colors applied with visible brushstrokes or marker streaks, not flat digital fills, gradients achieved through layered watercolor washes with wet-on-wet blending'
      },
      {
        issue: '字体太规整',
        solution: '使用手写字体描述',
        promptFix: 'text in authentic hand-lettering: bold brush calligraphy for titles with decorative flourishes, casual handwriting for labels, small neat script for annotations'
      }
    ]
  },

  // ========== 技能9: 装修3D效果图 ==========
  'interior-design-3d': {
    metadata: {
      id: 'interior-design-3d',
      name: '平面图转3D装修效果图',
      description: '将平面户型图/设计图转换为多角度3D室内装修实景效果图，支持多种装修风格',
      keywords: ['装修', '效果图', '平面图', '户型图', '设计图', '室内设计', '家装', '翻新', '改造', '实景图', '3D效果', '室内效果图', '装修风格', '室内渲染', '家居设计', '空间设计', '房间设计', '客厅', '卧室', '厨房'],
      category: 'interior-design',
      difficulty: 'hard',
      requiredInputs: ['平面设计图（参考图）'],
      optionalInputs: ['装修风格', '重点空间', '特殊要求']
    },
    basePrompt: `Based on the uploaded floor plan, generate a photorealistic 3D interior rendering of {{ROOM_TYPE}}.

DESIGN STYLE: {{DESIGN_STYLE_PROMPT}}

SCENE COMPOSITION:
Wide-angle architectural photography shot at eye level (1.2m height), capturing the full depth of the room. {{LAYOUT_DESCRIPTION}} The camera uses a 24mm wide-angle lens with slight perspective correction, f/8 aperture for maximum depth of field, ensuring every element from foreground to background is razor-sharp.

MATERIALS & FINISHES:
{{MATERIAL_DETAILS}} All surfaces rendered with physically-based rendering (PBR): subtle light reflections on polished floors, visible grain in wood textures, soft sheen on upholstery fabrics. No plastic-looking surfaces.

LIGHTING:
{{LIGHTING_DESCRIPTION}} Soft natural light streams through floor-to-ceiling windows with sheer curtains diffusing the light into a warm, even glow. Supplementary warm-toned recessed lighting creates layered illumination. Global illumination with accurate light bouncing off walls.

QUALITY REQUIREMENTS:
Photorealistic architectural visualization, 8K resolution, professional interior photography quality. Sharp focus throughout, no motion blur, accurate perspective geometry. The rendering should be indistinguishable from a professional interior photography shoot.`,
    variables: [
      {
        name: 'ROOM_TYPE',
        description: '主要展示的房间类型',
        type: 'text',
        required: true,
        defaultValue: 'the living room and dining area',
        examples: ['the living room and dining area', 'the master bedroom', 'the open-plan kitchen', 'the full apartment layout']
      },
      {
        name: 'DESIGN_STYLE_PROMPT',
        description: '装修风格的详细英文描述',
        type: 'text',
        required: true,
        defaultValue: 'Modern Minimalist — clean lines, neutral palette of white and warm gray, light oak wood flooring, minimal decorative elements, functional furniture with hidden storage',
        examples: [
          'Modern Minimalist — clean lines, neutral palette of white and warm gray, light oak wood flooring, minimal decorative elements, functional furniture with hidden storage',
          'Scandinavian — warm birch wood, cozy textiles in muted tones (oatmeal, sage green, dusty rose), hygge atmosphere, abundant natural light, sheepskin throws and ceramic accents',
          'Japandi — wabi-sabi aesthetic, natural materials (bamboo, linen, raw concrete), earthy neutral palette (warm beige, charcoal, moss green), low-profile furniture, bonsai and stone garden accents',
          'Contemporary Luxury — marble accent walls, brushed brass hardware, velvet upholstery in deep jewel tones (navy, emerald, burgundy), statement pendant lighting, curated art pieces',
          'Industrial — exposed brick and concrete, raw steel beams, Edison bulb pendants, reclaimed wood shelving, leather and iron furniture, urban loft atmosphere',
          'American Farmhouse — shiplap walls, distressed wood floors, subway tile kitchen, farmhouse sink, mix of vintage and rustic elements, warm cream and navy color scheme'
        ]
      },
      {
        name: 'LAYOUT_DESCRIPTION',
        description: '空间布局描述（根据平面图分析得出）',
        type: 'text',
        required: false,
        defaultValue: 'Open-plan layout with living area flowing seamlessly into dining space.',
        examples: [
          'Open-plan layout with living area flowing seamlessly into dining space.',
          'Bedroom with dedicated reading nook by the window and walk-in wardrobe zone.',
          'L-shaped kitchen island as the central feature with breakfast bar seating.'
        ]
      },
      {
        name: 'MATERIAL_DETAILS',
        description: '材质细节描述',
        type: 'text',
        required: false,
        defaultValue: 'Light oak hardwood flooring throughout, white plaster walls with subtle texture, linen upholstery on sofa.',
        examples: [
          'Light oak hardwood flooring throughout, white plaster walls with subtle texture, linen upholstery on sofa.',
          'Polished concrete floors with underfloor heating, exposed brick feature wall, walnut veneer cabinetry.',
          'Herringbone parquet flooring, marble fireplace surround, bouclé fabric armchairs.'
        ]
      },
      {
        name: 'LIGHTING_DESCRIPTION',
        description: '光线和氛围描述',
        type: 'text',
        required: false,
        defaultValue: 'Golden hour afternoon light creating long warm shadows across the floor.',
        examples: [
          'Golden hour afternoon light creating long warm shadows across the floor.',
          'Bright midday light with cool blue sky visible through windows, crisp and airy atmosphere.',
          'Dusk interior lighting with warm ambient glow, cozy evening atmosphere.'
        ]
      }
    ],
    examples: [
      {
        userRequest: '帮我把这个户型图转成现代简约风格的3D效果图',
        filledPrompt: 'Based on the uploaded floor plan, generate a photorealistic 3D interior rendering of the living room and dining area. DESIGN STYLE: Modern Minimalist — clean lines, neutral palette of white and warm gray, light oak wood flooring, minimal decorative elements. Wide-angle architectural photography, 24mm lens, f/8 aperture. Light oak hardwood flooring, white plaster walls, linen sofa. Golden hour light. 8K resolution, professional interior photography quality.',
        chineseTexts: []
      }
    ],
    qualityChecklist: [
      '空间比例是否符合平面图布局',
      '装修风格是否统一（材质/颜色/家具风格一致）',
      '光线是否自然真实（有明暗层次）',
      '材质细节是否清晰（木纹/石材/织物肌理）',
      '家具陈设是否合理（符合人体工程学）',
      '整体是否达到专业室内摄影水准'
    ],
    commonIssues: [
      {
        issue: '空间比例失真',
        solution: '明确指定相机高度和镜头焦距',
        promptFix: 'camera at 1.2m eye-level height, 24mm wide-angle lens, perspective correction applied, accurate architectural proportions'
      },
      {
        issue: '材质看起来像CGI塑料',
        solution: '强调PBR材质和真实光线反射',
        promptFix: 'physically-based rendering (PBR) materials, subtle specular highlights on surfaces, visible material imperfections and texture variation, photorealistic not CGI'
      },
      {
        issue: '光线太平均没有层次',
        solution: '添加定向光和阴影描述',
        promptFix: 'directional sunlight casting defined shadows, layered lighting with ambient fill and accent spotlights, warm-to-cool light temperature variation'
      },
      {
        issue: '房间太空或家具太少',
        solution: '明确要求完整陈设',
        promptFix: 'fully furnished and styled room with complete furniture arrangement, decorative accessories, plants, cushions, and art pieces as per the design style'
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
