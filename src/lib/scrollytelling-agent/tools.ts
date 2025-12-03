// Scrollytelling 动效网站 Agent 工具定义

export interface ScrollytellingTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

// 工具列表
export const SCROLLYTELLING_TOOLS: ScrollytellingTool[] = [
  {
    name: 'deep_research',
    description: `深度研究工具 - 使用 HyprLab sonar-deep-research (medium 级别)

⚠️ 使用场景：
- 当用户没有提供参考图片时，必须首先调用此工具！
- 用户只提供了文字描述/主题，需要深入了解背景

功能：
1. 使用 Perplexity sonar-deep-research 模型进行深度网络研究
2. 自动搜索并整合多个来源的信息
3. 提供结构化的研究报告和设计建议
4. 返回引用来源列表

⚠️ 重要提示：
- 此操作使用 medium 级别，预计耗时 3-7 分钟
- 会返回引用来源数量和研究耗时
- 完成后请调用 plan_structure 规划网站结构`,
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '用户提供的主题/需求描述（必填）'
        },
        research_focus: {
          type: 'array',
          items: { type: 'string' },
          description: '研究重点方向，如：行业背景、设计趋势、竞品分析、数据统计、用户画像'
        },
        style_preferences: {
          type: 'string',
          description: '用户期望的视觉风格（可选），如：科技感、极简、商务、艺术'
        }
      },
      required: ['topic']
    }
  },
  {
    name: 'plan_structure',
    description: `规划 Scrollytelling 动效网站的整体结构，包括 section 划分、叙事线索、AI 生图提示词和 GSAP 动画效果。

⚠️ 调用条件：
- 如果有参考图片：直接调用此工具
- 如果无参考图片：必须先调用 deep_research，然后再调用此工具

⚠️ 重要：
1. 用户提供的图片仅作参考，不直接展示
2. 每个 section 需要的图片都由 AI 生成
3. 必须为每个需要图片的 section 编写详细的生图提示词
4. 必须设计丰富的 GSAP ScrollTrigger 动画效果`,
    parameters: {
      type: 'object',
      properties: {
        theme_style: {
          type: 'string',
          description: '整体主题风格，如：科技感、自然清新、商务专业、艺术创意、手绘温馨等'
        },
        narrative_approach: {
          type: 'string',
          description: '叙事方式，如：时间线、对比展示、渐进深入、问题解答等'
        },
        global_transition: {
          type: 'string',
          enum: ['fade', 'slide-up', 'slide-left', 'scale', 'parallax'],
          description: '全局默认入场动画效果'
        },
        slides: {
          type: 'array',
          description: 'Section 规划列表（网站各个全屏区块）',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '幻灯片标题'
              },
              subtitle: {
                type: 'string',
                description: '副标题（可选）'
              },
              layout: {
                type: 'string',
                enum: ['title', 'content', 'image-left', 'image-right', 'full-image', 'two-column', 'data', 'comparison'],
                description: '布局类型'
              },
              key_points: {
                type: 'array',
                items: { type: 'string' },
                description: '关键内容点'
              },
              image_prompt: {
                type: 'string',
                description: '⚠️ AI 生图提示词（必填！详细描述需要生成的图片，包括主体、风格、色调、构图）'
              },
              image_aspect_ratio: {
                type: 'string',
                enum: ['16:9', '1:1', '4:3', '3:4', '9:16'],
                description: '图片比例，默认 16:9'
              },
              chart_type: {
                type: 'string',
                enum: ['line', 'bar', 'pie', 'gauge', 'radar', 'none'],
                description: '图表类型，如果不需要图表填 none'
              },
              // GSAP ScrollTrigger 动画配置
              scroll_animation: {
                type: 'string',
                enum: ['fade-in', 'slide-up', 'slide-left', 'slide-right', 'scale-in', 'parallax', 'pin', 'stagger'],
                description: '滚动触发的入场动画类型'
              },
              pin_section: {
                type: 'boolean',
                description: '是否在滚动时固定此 section（Pin 效果）'
              },
              scrub: {
                type: 'boolean',
                description: '动画进度是否与滚动位置同步（Scrub 效果）'
              },
              background_color: {
                type: 'string',
                description: '背景颜色，如 #0f172a'
              },
              background_gradient: {
                type: 'string',
                description: '背景渐变，如 linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              },
              text_animations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    element: {
                      type: 'string',
                      description: '元素描述（如：标题、段落、列表）'
                    },
                    effect: {
                      type: 'string',
                      enum: ['letter-by-letter', 'word-by-word', 'line-by-line', 'fade-in', 'slide-up', 'typewriter', 'gradient-reveal'],
                      description: '文字动画效果'
                    },
                    stagger: {
                      type: 'number',
                      description: '错落延迟时间（秒），如 0.05'
                    }
                  }
                },
                description: '文字动画配置'
              },
              special_effects: {
                type: 'array',
                items: { type: 'string' },
                description: '特殊效果，如：counter（计数）、progress-bar、parallax-image、hover-card、glassmorphism'
              }
            },
            required: ['title', 'layout', 'key_points']
          }
        },
        interaction_preferences: {
          type: 'array',
          items: { type: 'string' },
          description: '期望的交互类型，如：tabs、timeline、cards、charts、counters、progress-bars、r-stack 等'
        }
      },
      required: ['theme_style', 'narrative_approach', 'slides', 'global_transition']
    }
  },
  {
    name: 'web_search',
    description: '搜索网络获取相关信息，用于丰富幻灯片内容。可以搜索数据、背景知识、趋势等。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询词'
        },
        search_type: {
          type: 'string',
          enum: ['facts', 'statistics', 'trends', 'background', 'news'],
          description: '搜索类型'
        },
        slide_index: {
          type: 'number',
          description: '关联的幻灯片索引（从0开始）'
        }
      },
      required: ['query', 'search_type']
    }
  },
  {
    name: 'generate_chart_data',
    description: '为指定幻灯片生成图表数据配置，包括 ECharts 配置对象。',
    parameters: {
      type: 'object',
      properties: {
        slide_index: {
          type: 'number',
          description: '幻灯片索引（从0开始）'
        },
        chart_type: {
          type: 'string',
          enum: ['line', 'bar', 'pie', 'gauge', 'radar', 'scatter'],
          description: '图表类型'
        },
        data_description: {
          type: 'string',
          description: '数据描述，说明图表要展示什么'
        },
        data_points: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' }
            }
          },
          description: '数据点数组'
        }
      },
      required: ['slide_index', 'chart_type', 'data_description', 'data_points']
    }
  },
  {
    name: 'finalize_prompt',
    description: `整合所有收集的材料，生成最终的详细提示词。这是最后一步。

调用后将：
1. 并发生成所有 section 的 AI 图片
2. 等待图片生成完成
3. 使用 Gemini 生成 GSAP Scrollytelling 动效网站 HTML`,
    parameters: {
      type: 'object',
      properties: {
        additional_requirements: {
          type: 'array',
          items: { type: 'string' },
          description: '额外的设计要求'
        },
        special_effects: {
          type: 'array',
          items: { type: 'string' },
          description: '特殊效果要求，如：3D 转场、粒子效果、进度条动画等'
        }
      },
      required: []
    }
  }
];

// 转换为 Claude API 格式
export function formatToolsForClaude(): any[] {
  return SCROLLYTELLING_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
}
