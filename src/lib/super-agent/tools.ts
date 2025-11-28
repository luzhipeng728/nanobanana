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
    description: '加载指定技能的完整内容，包括提示词模板、变量定义、示例和常见问题解决方案。',
    parameters: [
      {
        name: 'skill_id',
        type: 'string',
        description: '技能ID，如 product-showcase, tutorial-infographic 等',
        required: true
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

  // 工具4.5: 深度研究智能体（多轮自主探索）
  {
    name: 'deep_research',
    description: `🔬 深度研究智能体 - 一个独立的子智能体，能够自主探索、收集和整理信息。

**核心能力：**
- 自主决策：智能判断信息是否充足，自动决定继续搜索还是停止
- Google 搜索：使用 Google Custom Search 获取高质量结果
- 智能分类：自动将信息分为背景、关键事实、最新动态、观点、统计、案例等类别
- 质量评估：规则+LLM 混合评估，确保信息真正有用

**适用场景：**
- 需要实时信息：天气、新闻、股票、活动（⚠️ 需要设置 date_restrict 参数！）
- 需要全面了解：旅游攻略、产品对比、技术调研
- 需要多角度：争议话题、不同观点、专业分析

**输出格式：**
返回结构化研究报告，包含概述、关键发现、分类信息和来源列表。

**⚠️ 重要：时效性查询必须设置 date_restrict！**
- 查询"今日新闻"时 → date_restrict: "d1"
- 查询"本周热点"时 → date_restrict: "d7"
- 查询"最近一个月"时 → date_restrict: "m1"
否则可能返回过时的历史内容！`,
    parameters: [
      {
        name: 'topic',
        type: 'string',
        description: '研究主题，如 "苏州下周天气预报"、"2024年AI发展趋势"、"特斯拉Model 3评测"',
        required: true
      },
      {
        name: 'required_info',
        type: 'array',
        description: '需要收集的具体信息类型，如 ["每日天气", "温度", "穿衣建议"] 或 ["技术规格", "用户评价", "价格对比"]。智能体会确保这些信息都被收集到。',
        required: false
      },
      {
        name: 'context',
        type: 'string',
        description: '补充背景信息，帮助智能体更好理解需求，如 "用户计划下周出差"、"需要用于购买决策"',
        required: false
      },
      {
        name: 'date_restrict',
        type: 'string',
        description: '⚠️ 时效性限制（重要！）。格式：d[N]=N天内, w[N]=N周内, m[N]=N月内, y[N]=N年内。例如：d1=今天, d3=3天内, w1=一周内, m1=一个月内。对于"今日新闻"、"本周热点"等时效性查询必须设置此参数！',
        required: false
      },
      {
        name: 'output_mode',
        type: 'string',
        description: '输出模式：summary(精炼摘要)、detailed(详细报告含原始数据)、adaptive(根据信息量自适应)',
        required: false,
        enum: ['summary', 'detailed', 'adaptive']
      },
      {
        name: 'max_rounds',
        type: 'number',
        description: '最大探索轮数，默认10轮。每轮会执行多个搜索查询。',
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
