// Scrollytelling Agent 工具定义

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
    name: 'analyze_images',
    description: '分析所有图片内容，提取关键信息、主题、元素等。这是第一步，帮助理解用户提供的素材。',
    parameters: {
      type: 'object',
      properties: {
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: '需要关注的分析方向，如：主题、情感、色调、元素、场景等'
        }
      },
      required: []
    }
  },
  {
    name: 'plan_structure',
    description: '规划网页的整体结构，包括章节划分、叙事线索、交互设计等。基于图片分析结果来规划。',
    parameters: {
      type: 'object',
      properties: {
        theme_style: {
          type: 'string',
          description: '整体主题风格，如：科技感、自然清新、商务专业、艺术创意等'
        },
        narrative_approach: {
          type: 'string',
          description: '叙事方式，如：时间线、对比展示、渐进深入、问题解答等'
        },
        interaction_preferences: {
          type: 'array',
          items: { type: 'string' },
          description: '期望的交互类型，如：tabs、timeline、cards、charts、counters等'
        }
      },
      required: ['theme_style', 'narrative_approach']
    }
  },
  {
    name: 'web_search',
    description: '搜索网络获取相关信息，用于丰富内容。可以搜索数据、背景知识、趋势等。',
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
        chapter_index: {
          type: 'number',
          description: '关联的章节索引（从0开始）'
        }
      },
      required: ['query', 'search_type']
    }
  },
  {
    name: 'generate_chart_data',
    description: '为指定章节生成图表数据配置，包括 ECharts 配置对象。',
    parameters: {
      type: 'object',
      properties: {
        chapter_index: {
          type: 'number',
          description: '章节索引（从0开始）'
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
      required: ['chapter_index', 'chart_type', 'data_description', 'data_points']
    }
  },
  {
    name: 'finalize_prompt',
    description: '整合所有收集的材料，生成最终的详细提示词。这是最后一步，调用后将进入 HTML 生成阶段。',
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
          description: '特殊效果要求，如：视差滚动、数字计数、固定场景等'
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
