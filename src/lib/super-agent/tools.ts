// 超级智能体工具定义

import type { AgentTool, ToolParameter } from '@/types/super-agent';

// Claude API 工具格式
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

// 工具定义
export const SUPER_AGENT_TOOLS: AgentTool[] = [
  // 工具1: 技能匹配器
  {
    name: 'skill_matcher',
    description: '分析用户需求，匹配最合适的预设技能。返回匹配结果和置信度。如果没有匹配的技能，返回 matched: false。',
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
    ]
  },

  // 工具2: 技能加载器
  {
    name: 'load_skill',
    description: '加载指定技能的完整内容，包括提示词模板、变量定义、示例和常见问题解决方案。会根据 image_model 自动转换提示词格式（如 Seedream 不支持 hex 颜色代码）。',
    parameters: [
      {
        name: 'skill_id',
        type: 'string',
        description: '技能ID，如 product-showcase, tutorial-infographic 等',
        required: true
      },
      {
        name: 'image_model',
        type: 'string',
        description: '目标图片生成模型，如 nano-banana, nano-banana-pro, seedream-4.5。不同模型有不同的提示词格式要求。',
        required: false
      }
    ]
  },

  // 工具3: 提示词生成器
  {
    name: 'generate_prompt',
    description: '根据用户需求生成完整的提示词。如果有匹配的技能模板则使用模板填充，否则自主创作。必须保留中文原文不翻译。',
    parameters: [
      {
        name: 'user_request',
        type: 'string',
        description: '用户原始需求',
        required: true
      },
      {
        name: 'skill_id',
        type: 'string',
        description: '使用的技能ID（如果有匹配）',
        required: false
      },
      {
        name: 'variables',
        type: 'object',
        description: '技能模板变量填充值',
        required: false
      },
      {
        name: 'reference_analysis',
        type: 'string',
        description: '参考图分析结果',
        required: false
      },
      {
        name: 'search_insights',
        type: 'string',
        description: '搜索获得的优化技巧',
        required: false
      }
    ]
  },

  // 工具4: 网络搜索（单次快速搜索）
  {
    name: 'web_search',
    description: '单次快速搜索网络。适用于简单查询。如果需要深入研究某个主题（如天气、旅游、技术细节），请使用 research_topic 工具。',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: '搜索查询关键词',
        required: true
      },
      {
        name: 'search_type',
        type: 'string',
        description: '搜索类型：prompt_techniques(提示词技巧), style_reference(风格参考), problem_solving(问题解决), trend_research(趋势研究)',
        required: true,
        enum: ['prompt_techniques', 'style_reference', 'problem_solving', 'trend_research']
      }
    ]
  },

  // 工具4.5: 深度研究智能体（使用 HyprLab sonar-deep-research）
  {
    name: 'deep_research',
    description: `🔬 深度研究智能体 - 使用 Perplexity sonar-deep-research 模型进行深度互联网研究。

**核心能力：**
- 深度搜索：自动执行数十次搜索查询，全面收集信息
- 智能推理：根据 reasoning_effort 级别进行不同深度的分析
- 实时数据：获取最新的互联网信息
- 结构化输出：返回详细报告和引用来源

**研究强度 (reasoning_effort)：**
- low: 快速研究，约 1-3 分钟（适合简单问题）
- medium: 标准研究，约 3-7 分钟（适合一般话题）
- high: 深度研究，约 7-15 分钟（适合复杂话题）

**适用场景：**
- 新闻资讯：今日AI大事件、科技动态、行业新闻
- 深度分析：技术趋势、市场调研、竞品分析
- 综合研究：多角度观点、专业领域探索

**输出格式：**
返回完整研究报告 + 引用来源列表 + 搜索结果摘要。
报告内容可直接用于生成信息图表的提示词。`,
    parameters: [
      {
        name: 'topic',
        type: 'string',
        description: '研究主题，如 "今日AI大事件速报"、"2025年AI发展趋势"、"特斯拉最新动态"',
        required: true
      },
      {
        name: 'reasoning_effort',
        type: 'string',
        description: '研究强度：low(1-3分钟快速)、medium(3-7分钟标准)、high(7-15分钟深度)。默认 low。',
        required: false,
        enum: ['low', 'medium', 'high']
      },
      {
        name: 'context',
        type: 'string',
        description: '补充背景信息，帮助更好理解需求，如 "用于生成新闻资讯图"、"需要用于购买决策"',
        required: false
      }
    ]
  },

  // 工具5: 图片分析
  {
    name: 'analyze_image',
    description: '分析参考图片，提取风格特征、布局结构、颜色方案等信息。当用户提供参考图片时使用。',
    parameters: [
      {
        name: 'image_url',
        type: 'string',
        description: '图片URL地址',
        required: true
      },
      {
        name: 'analysis_focus',
        type: 'array',
        description: '分析重点，如 style, layout, colors, elements, text',
        required: false
      }
    ]
  },

  // 工具6: 提示词优化
  {
    name: 'optimize_prompt',
    description: '根据评估结果或搜索到的技巧，优化现有提示词。',
    parameters: [
      {
        name: 'current_prompt',
        type: 'string',
        description: '当前版本的提示词',
        required: true
      },
      {
        name: 'chinese_texts',
        type: 'array',
        description: '需要保留的中文文字列表',
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
    ]
  },

  // 工具7: 质量评估
  {
    name: 'evaluate_prompt',
    description: '评估提示词质量，检查是否满足所有要求。返回分数（0-100）和问题列表。',
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
        description: '技能质量检查清单（如果使用了技能模板）',
        required: false
      }
    ]
  },

  // 工具8: 最终输出（支持多提示词）
  // 注意：这个工具使用特殊的 schema 定义，在 formatToolsForClaude 中单独处理
  {
    name: 'finalize_output',
    description: '当提示词达到质量要求时（评估分数>=85或迭代次数达到上限），输出最终结果。支持输出多个提示词（如PPT多页、教程多步骤等）。这个工具会结束ReAct循环。',
    parameters: [
      {
        name: 'prompts',
        type: 'array',
        description: '提示词列表，每个元素包含 { scene: "场景名称", prompt: "提示词内容", chinese_texts: ["中文1", "中文2"] }。对于PPT、教程等多页场景，应生成多个提示词。',
        required: true
      },
      {
        name: 'generation_tips',
        type: 'array',
        description: '生成建议列表',
        required: false
      },
      {
        name: 'recommended_model',
        type: 'string',
        description: '推荐使用的生成模型',
        required: false
      },
      {
        name: 'matched_skill',
        type: 'string',
        description: '匹配使用的技能名称（如果有）',
        required: false
      }
    ]
  }
];

// finalize_output 工具的详细 JSON Schema（用于 structured outputs）
export const FINALIZE_OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    prompts: {
      type: 'array',
      description: '提示词列表',
      items: {
        type: 'object',
        properties: {
          scene: {
            type: 'string',
            description: '场景名称'
          },
          prompt: {
            type: 'string',
            description: '提示词内容'
          },
          chinese_texts: {
            type: 'array',
            items: { type: 'string' },
            description: '中文文字列表'
          }
        },
        required: ['scene', 'prompt']
      }
    },
    generation_tips: {
      type: 'array',
      items: { type: 'string' },
      description: '生成建议列表'
    },
    recommended_model: {
      type: 'string',
      description: '推荐使用的生成模型'
    },
    matched_skill: {
      type: 'string',
      description: '匹配使用的技能名称'
    }
  },
  required: ['prompts']
};

// 工具格式化选项
export interface FormatToolsOptions {
  enableDeepResearch?: boolean; // 是否启用深度研究工具
}

// 转换为 Claude API 工具格式
export function formatToolsForClaude(options: FormatToolsOptions = {}): ClaudeTool[] {
  const { enableDeepResearch = false } = options;

  // 根据选项过滤工具
  let tools = SUPER_AGENT_TOOLS;
  if (!enableDeepResearch) {
    tools = tools.filter(t => t.name !== 'deep_research');
  }

  return tools.map(tool => {
    // finalize_output 使用详细的 JSON Schema（支持 structured outputs）
    if (tool.name === 'finalize_output') {
      return {
        name: tool.name,
        description: tool.description,
        input_schema: FINALIZE_OUTPUT_SCHEMA
      };
    }

    // 其他工具使用通用格式
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.reduce((acc, param) => {
          const prop: any = {
            type: param.type === 'array' ? 'array' : param.type,
            description: param.description
          };
          if (param.enum) {
            prop.enum = param.enum;
          }
          if (param.type === 'array') {
            prop.items = { type: 'string' };
          }
          acc[param.name] = prop;
          return acc;
        }, {} as Record<string, any>),
        required: tool.parameters.filter(p => p.required).map(p => p.name)
      }
    };
  });
}

// 获取工具名称列表
export function getToolNames(): string[] {
  return SUPER_AGENT_TOOLS.map(t => t.name);
}
