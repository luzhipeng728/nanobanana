// Reveal.js 演示文稿 Agent 工具定义

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
    name: 'plan_structure',
    description: `规划演示文稿的整体结构，包括幻灯片划分、叙事线索、AI 生图提示词等。

⚠️ 重要：
1. 用户提供的图片仅作参考，不直接展示
2. 每张幻灯片需要的图片都由 AI 生成
3. 必须为每张需要图片的幻灯片编写详细的生图提示词

这是第一步，基于参考图片分析主题和风格。`,
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
        slides: {
          type: 'array',
          description: '幻灯片规划列表',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: '幻灯片标题'
              },
              layout: {
                type: 'string',
                enum: ['title', 'content', 'image-left', 'image-right', 'full-image', 'two-column', 'data'],
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
              animations: {
                type: 'array',
                items: { type: 'string' },
                description: '动画效果，如：fade-in, zoom, slide-up, count-up 等'
              }
            },
            required: ['title', 'layout', 'key_points']
          }
        },
        transitions: {
          type: 'string',
          description: '幻灯片转场效果，如：slide, fade, convex, zoom 等'
        },
        interaction_preferences: {
          type: 'array',
          items: { type: 'string' },
          description: '期望的交互类型，如：tabs、timeline、cards、charts、counters、progress-bars 等'
        }
      },
      required: ['theme_style', 'narrative_approach', 'slides']
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
1. 并发生成所有幻灯片的 AI 图片
2. 等待图片生成完成
3. 使用 Gemini 生成 reveal.js HTML`,
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
