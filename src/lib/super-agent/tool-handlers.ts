// 工具处理器 - 实际执行工具调用的逻辑

import Anthropic from '@anthropic-ai/sdk';
import { SKILL_LIBRARY, matchSkillByKeywords, convertPromptForSeedream, isSeedreamModel } from './skills';
import type { ToolResult, FinalOutput, SuperAgentStreamEvent } from '@/types/super-agent';
// 旧版 DeepResearch（基于 Google + Tavily + LLM 评估）
import { runDeepResearch, ResearchProgressEvent as LegacyResearchProgressEvent } from './deep-research';
// 新版 HyprLab DeepResearch（基于 Perplexity sonar-deep-research）
import {
  callHyprLabDeepResearch,
  parseHyprLabResponse,
  formatResearchForImagePrompt,
  type ReasoningEffort,
  type ResearchProgressEvent as HyprLabProgressEvent,
  type HyprLabResponse,
  REASONING_EFFORT_TIME
} from './hyprlab-research';
import { fetchAndCompressImage } from '@/lib/image-utils';
import { CLAUDE_LIGHT_MODEL, CLAUDE_LIGHT_MAX_TOKENS, DEEP_RESEARCH_MAX_ROUNDS } from '@/lib/claude-config';

// 初始化 Anthropic 客户端
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined
  });
}

// 工具处理器类型
type ToolHandler = (
  params: Record<string, any>,
  sendEvent: (event: SuperAgentStreamEvent) => Promise<void>
) => Promise<ToolResult>;

// 工具1: 技能匹配器
export const handleSkillMatcher: ToolHandler = async (params, sendEvent) => {
  const { user_request, reference_image_analysis } = params;

  await sendEvent({
    type: 'skill_matching',
    status: '正在分析需求并匹配技能...'
  });

  // 使用关键词匹配
  const matchResult = matchSkillByKeywords(user_request);

  // 如果有参考图分析，进一步调整匹配
  if (reference_image_analysis && matchResult.allMatches.length > 0) {
    // 可以根据图片分析结果调整匹配分数
    const imageKeywords = reference_image_analysis.toLowerCase();
    matchResult.allMatches.forEach(match => {
      const skill = SKILL_LIBRARY[match.id];
      if (skill) {
        skill.metadata.keywords.forEach(keyword => {
          if (imageKeywords.includes(keyword.toLowerCase())) {
            match.score += 5;
          }
        });
      }
    });
    // 重新排序
    matchResult.allMatches.sort((a, b) => b.score - a.score);
  }

  if (matchResult.matched && matchResult.skillId) {
    await sendEvent({
      type: 'skill_matched',
      skillId: matchResult.skillId,
      skillName: matchResult.skillName!,
      confidence: matchResult.confidence
    });

    return {
      success: true,
      data: {
        matched: true,
        skill_id: matchResult.skillId,
        skill_name: matchResult.skillName,
        confidence: matchResult.confidence,
        all_matches: matchResult.allMatches
      },
      shouldContinue: true
    };
  }

  await sendEvent({
    type: 'skill_not_matched',
    reason: '没有匹配的预设技能，将自主创作'
  });

  return {
    success: true,
    data: {
      matched: false,
      reason: '没有匹配的预设技能，将根据用户需求自主创作提示词',
      suggestions: [
        '可以使用 web_search 工具搜索相关的提示词技巧',
        '如果用户提供了参考图片，可以使用 analyze_image 分析'
      ]
    },
    shouldContinue: true
  };
};

// 工具2: 技能加载器
export const handleLoadSkill: ToolHandler = async (params, sendEvent) => {
  const { skill_id, image_model } = params;
  const skill = SKILL_LIBRARY[skill_id];

  if (!skill) {
    return {
      success: false,
      error: `技能 "${skill_id}" 不存在。可用技能: ${Object.keys(SKILL_LIBRARY).join(', ')}`,
      shouldContinue: true
    };
  }

  // 根据图片模型转换提示词（Seedream 不支持 hex 颜色代码）
  let basePrompt = skill.basePrompt;
  let examples = skill.examples;

  if (image_model && isSeedreamModel(image_model)) {
    console.log(`[LoadSkill] Converting prompts for Seedream model: ${image_model}`);
    basePrompt = convertPromptForSeedream(skill.basePrompt);

    // 也转换示例中的提示词
    examples = skill.examples.map(example => ({
      ...example,
      filledPrompt: convertPromptForSeedream(example.filledPrompt)
    }));
  }

  return {
    success: true,
    data: {
      metadata: skill.metadata,
      basePrompt,
      variables: skill.variables,
      examples,
      qualityChecklist: skill.qualityChecklist,
      commonIssues: skill.commonIssues,
      _seedreamMode: image_model ? isSeedreamModel(image_model) : false
    },
    shouldContinue: true
  };
};

// 工具3: 提示词生成器 - 这个工具的主要逻辑由 Claude 执行
// 这里只是验证和格式化
export const handleGeneratePrompt: ToolHandler = async (params, sendEvent) => {
  const { user_request, skill_id, variables, reference_analysis, search_insights } = params;

  // 如果使用技能模板
  if (skill_id && SKILL_LIBRARY[skill_id]) {
    const skill = SKILL_LIBRARY[skill_id];

    // 验证必需变量
    const missingVars = skill.variables
      .filter(v => v.required && !variables?.[v.name])
      .map(v => v.name);

    if (missingVars.length > 0) {
      return {
        success: false,
        error: `缺少必需变量: ${missingVars.join(', ')}`,
        data: {
          skill_template: skill.basePrompt,
          required_variables: skill.variables.filter(v => v.required)
        },
        shouldContinue: true
      };
    }
  }

  // 返回成功，实际的提示词生成由 Claude 完成
  return {
    success: true,
    data: {
      message: '请根据以上信息生成完整的提示词',
      guidelines: [
        '1. 保留所有中文原文，用英文双引号包裹',
        '2. 禁止翻译中文为英文',
        '3. 明确指定中文文字的显示位置',
        '4. 添加 "All Chinese text must be exactly as specified with no other text"',
        '5. 添加质量控制词如 8K resolution, professional photography 等'
      ]
    },
    shouldContinue: true
  };
};

// 工具4: 网络搜索 - 使用 Tavily API
export const handleWebSearch: ToolHandler = async (params, sendEvent) => {
  const { query, search_type } = params;

  await sendEvent({
    type: 'search_start',
    query
  });

  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!tavilyApiKey) {
      console.warn('[WebSearch] TAVILY_API_KEY not configured, using fallback data');
      // 如果没有配置 API key，返回备用数据
      return getFallbackSearchResults(query, search_type, sendEvent);
    }

    console.log(`[WebSearch] Searching for: ${query}`);

    // 调用 Tavily API
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[WebSearch] Found ${data.results?.length || 0} results`);

    // 提取搜索结果
    const results = data.results?.map((r: any) => ({
      title: r.title,
      content: r.content,
      url: r.url,
    })) || [];

    const summary = data.answer || results.map((r: any) => r.content).join('\n\n');

    await sendEvent({
      type: 'search_result',
      summary: `找到 ${results.length} 条相关信息`
    });

    return {
      success: true,
      data: {
        query,
        search_type,
        answer: data.answer,
        results,
        summary
      },
      shouldContinue: true
    };
  } catch (error) {
    console.error('[WebSearch] Error:', error);
    // 出错时返回备用数据
    return getFallbackSearchResults(query, search_type, sendEvent);
  }
};

// 工具4.5: 深度研究智能体（使用 HyprLab sonar-deep-research）
export const handleDeepResearch: ToolHandler = async (params, sendEvent) => {
  const { topic, reasoning_effort, context } = params;

  // 验证并设置研究强度
  const effort: ReasoningEffort = ['low', 'medium', 'high'].includes(reasoning_effort)
    ? reasoning_effort as ReasoningEffort
    : 'low';

  const estimatedTime = REASONING_EFFORT_TIME[effort];
  console.log(`[DeepResearch] Starting HyprLab research on: "${topic}" with effort: ${effort} (estimated ${estimatedTime.min}-${estimatedTime.max} min)`);

  // 创建进度事件处理器
  const onProgress = async (event: HyprLabProgressEvent): Promise<void> => {
    switch (event.type) {
      case 'start':
        await sendEvent({
          type: 'research_start',
          topic,
          requiredInfo: []
        });
        await sendEvent({
          type: 'research_progress',
          round: 0,
          maxRounds: 1,
          status: event.message
        });
        break;

      case 'progress':
        await sendEvent({
          type: 'research_progress',
          round: 0,
          maxRounds: 1,
          status: event.message
        });
        break;

      case 'complete':
        await sendEvent({
          type: 'research_complete',
          topic,
          rounds: 1,
          coverage: 100
        });
        break;

      case 'error':
        console.error('[DeepResearch] Error:', event.error);
        break;
    }
  };

  try {
    // 构建系统提示词
    const systemPrompt = context
      ? `You are a helpful research assistant. Context: ${context}. Provide comprehensive, well-structured research reports in the same language as the user query.`
      : 'You are a helpful research assistant. Provide comprehensive, well-structured research reports in the same language as the user query.';

    // 调用 HyprLab API（旧调用方式，返回 HyprLabResponse）
    const response = await callHyprLabDeepResearch(
      topic,
      effort,
      onProgress,
      systemPrompt
    ) as HyprLabResponse;

    // 解析响应
    const parsed = parseHyprLabResponse(response);

    // 格式化为图片生成可用的上下文
    const researchSummary = formatResearchForImagePrompt(parsed);

    // 构建返回结果
    return {
      success: true,
      data: {
        topic,
        reasoning_effort: effort,
        total_time_ms: (Date.now() - response.created * 1000),
        sources_count: parsed.citations.length,

        // 主要内容
        content: parsed.content,

        // 引用来源
        citations: parsed.citations,

        // 搜索结果摘要
        search_results: parsed.searchResults.slice(0, 10).map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet
        })),

        // 使用统计
        usage: {
          search_queries: parsed.meta.searchQueriesCount,
          total_cost: parsed.meta.totalCost
        },

        // 便于 AI 使用的综合摘要
        research_summary: researchSummary
      },
      shouldContinue: true
    };
  } catch (error) {
    console.error('[DeepResearch] Error:', error);
    return {
      success: false,
      error: `深度研究失败: ${error instanceof Error ? error.message : '未知错误'}`,
      shouldContinue: true
    };
  }
};

// ============================================================================
// 旧版深度研究智能体（保留备用）
// 基于 Google Custom Search + Tavily + LLM 评估的多轮探索
// ============================================================================
export const handleDeepResearchLegacy: ToolHandler = async (params, sendEvent) => {
  const { topic, required_info, context, output_mode, max_rounds, date_restrict } = params;

  console.log(`[DeepResearch Legacy] Starting on: ${topic}`);
  if (date_restrict) {
    console.log(`[DeepResearch Legacy] Date restriction: ${date_restrict}`);
  }

  // 创建事件转发器
  const forwardEvent = async (event: LegacyResearchProgressEvent): Promise<void> => {
    switch (event.type) {
      case 'start':
        await sendEvent({
          type: 'research_start',
          topic: event.topic,
          requiredInfo: params.required_info || []
        });
        break;

      case 'round_start':
        await sendEvent({
          type: 'research_progress',
          round: event.round,
          maxRounds: event.maxRounds,
          status: `🔬 第 ${event.round}/${event.maxRounds} 轮：搜索 ${event.queries.length} 个查询`
        });
        break;

      case 'search_complete':
        await sendEvent({
          type: 'search_result',
          summary: `${event.source} 搜索完成，获得 ${event.resultsCount} 条结果`
        });
        break;

      case 'processing':
        await sendEvent({
          type: 'research_progress',
          round: 0,
          maxRounds: 0,
          status: `⚙️ ${event.action}`
        });
        break;

      case 'evaluation':
        await sendEvent({
          type: 'research_evaluation',
          round: 0,
          coverage: event.scores.coverage,
          missing: [],
          sufficient: event.decision === 'stop'
        });
        break;

      case 'round_complete':
        await sendEvent({
          type: 'research_progress',
          round: event.round,
          maxRounds: 10,
          status: `✅ 第 ${event.round} 轮完成：新增 ${event.newInfoCount} 条信息`
        });
        break;

      case 'pivot':
        await sendEvent({
          type: 'research_progress',
          round: 0,
          maxRounds: 0,
          status: `🔄 调整策略：${event.reason} → ${event.newDirection}`
        });
        break;

      case 'report_summary_chunk':
        await sendEvent({
          type: 'research_summary_chunk',
          chunk: (event as any).chunk
        } as any);
        break;

      case 'complete':
        await sendEvent({
          type: 'research_complete',
          topic,
          rounds: event.report.totalRounds,
          coverage: event.report.quality.coverageScore
        });
        break;

      case 'error':
        console.error('[DeepResearch Legacy] Error:', event.error);
        break;
    }
  };

  try {
    const safeRequiredInfo = Array.isArray(required_info) ? required_info : [];

    const report = await runDeepResearch(
      {
        topic,
        context,
        requiredInfo: safeRequiredInfo,
        outputMode: output_mode as 'summary' | 'detailed' | 'adaptive' | undefined,
        maxRounds: max_rounds as number | undefined,
        dateRestrict: date_restrict as string | undefined
      },
      forwardEvent,
      {
        maxRounds: max_rounds || DEEP_RESEARCH_MAX_ROUNDS,
        includeRawData: output_mode === 'detailed',
        includeTrace: output_mode === 'detailed',
        outputMode: output_mode || 'adaptive'
      }
    );

    return {
      success: true,
      data: {
        topic: report.topic,
        total_rounds: report.totalRounds,
        total_time_ms: report.totalTime,
        sources_count: report.sourcesCount,
        overview: report.summary.overview,
        key_findings: report.summary.keyFindings,
        categorized_info: report.summary.categories,
        coverage_score: report.quality.coverageScore,
        quality_score: report.quality.qualityScore,
        confidence: report.quality.confidence,
        limitations: report.quality.limitations,
        sources: report.rawData?.sources,
        research_summary: formatLegacyResearchSummary(report)
      },
      shouldContinue: true
    };
  } catch (error) {
    console.error('[DeepResearch Legacy] Error:', error);
    return {
      success: false,
      error: `深度研究失败: ${error instanceof Error ? error.message : '未知错误'}`,
      shouldContinue: true
    };
  }
};

// 格式化旧版研究摘要
function formatLegacyResearchSummary(report: any): string {
  const parts: string[] = [];

  if (report.summary.overview) {
    parts.push(`【概述】\n${report.summary.overview}`);
  }

  if (report.summary.keyFindings?.length > 0) {
    parts.push(`【关键发现】\n${report.summary.keyFindings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}`);
  }

  const categories = report.summary.categories || {};
  for (const [category, items] of Object.entries(categories)) {
    if (Array.isArray(items) && items.length > 0) {
      const labels: Record<string, string> = {
        background: '背景信息', key_facts: '关键事实', latest_updates: '最新动态',
        opinions: '观点/争议', statistics: '数据/统计', examples: '案例/示例',
        references: '参考资料', other: '其他信息'
      };
      parts.push(`【${labels[category] || category}】\n${(items as string[]).slice(0, 3).join('\n')}`);
    }
  }

  if (report.rawData?.sources?.length > 0) {
    const sourcesText = report.rawData.sources.slice(0, 5).map((s: any) => `- ${s.title}: ${s.url}`).join('\n');
    parts.push(`【参考来源】\n${sourcesText}`);
  }

  parts.push(`【研究质量】覆盖率: ${report.quality.coverageScore.toFixed(1)}%, 置信度: ${(report.quality.confidence * 100).toFixed(1)}%`);

  return parts.join('\n\n');
}
// ============================================================================

// 备用搜索结果（当 API 不可用时）
async function getFallbackSearchResults(
  query: string,
  search_type: string,
  sendEvent: (event: SuperAgentStreamEvent) => Promise<void>
) {
  const fallbackResults = {
    prompt_techniques: [
      '使用具体的风格描述词，如 "cinematic lighting", "photorealistic"',
      '添加负面提示词排除不想要的元素',
      '使用括号和权重来强调重要元素',
      '描述时从整体到细节，保持逻辑清晰'
    ],
    style_reference: [
      '赛博朋克: neon lights, rain-soaked streets, holographic displays, dark atmosphere',
      '皮克斯风格: 3D rendered, warm lighting, expressive characters, vibrant colors',
      '日系动漫: anime style, cel shading, large eyes, detailed backgrounds'
    ],
    problem_solving: [
      '中文显示问题: 减少文字量，使用更短的文字',
      '布局拥挤: 使用 "generous spacing", "clean layout"',
      '风格不一致: 添加更多风格关键词，使用 "consistent style throughout"'
    ],
    trend_research: [
      '2024流行: 玻璃态设计 (glassmorphism), 渐变色, 3D元素',
      'AI艺术趋势: 超现实主义, 概念艺术, 混合媒体风格'
    ]
  };

  const results = fallbackResults[search_type as keyof typeof fallbackResults] || [
    `关于 "${query}" 的搜索结果（离线模式）`
  ];

  await sendEvent({
    type: 'search_result',
    summary: `找到 ${results.length} 条相关信息（备用数据）`
  });

  return {
    success: true,
    data: {
      query,
      search_type,
      results,
      summary: results.join('\n'),
      fallback: true
    },
    shouldContinue: true
  };
}

// 工具5: 图片分析
export const handleAnalyzeImage: ToolHandler = async (params, sendEvent) => {
  const { image_url, analysis_focus } = params;

  await sendEvent({ type: 'image_analysis_start' });

  try {
    const anthropic = getAnthropicClient();

    // 下载图片并压缩 (确保 < 1MB)
    const compressed = await fetchAndCompressImage(image_url, {
      maxWidth: 1600,
      maxHeight: 1600,
      maxSizeBytes: 800 * 1024, // 800KB，确保 < 1MB
      quality: 0.8,
      format: 'jpeg'
    });

    if (!compressed) {
      throw new Error(`无法下载或压缩图片: ${image_url}`);
    }

    const base64 = compressed.base64;
    const mimeType = compressed.mimeType;

    // 使用 Claude Vision 分析
    const focusPoints = analysis_focus || ['style', 'layout', 'colors', 'elements', 'text'];
    const analysisPrompt = `请详细分析这张图片的以下方面：
${focusPoints.map((f: string) => `- ${f}`).join('\n')}

请提供结构化的分析结果，包括：
1. 整体风格描述
2. 布局结构
3. 主要颜色
4. 关键元素
5. 如果有文字，列出所有文字内容

最后，给出如何在提示词中重现这种风格的建议。`;

    let fullAnalysis = '';

    const stream = anthropic.messages.stream({
      model: CLAUDE_LIGHT_MODEL,
      max_tokens: CLAUDE_LIGHT_MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: base64
            }
          },
          { type: 'text', text: analysisPrompt }
        ]
      }]
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text;
        fullAnalysis += chunk;
        await sendEvent({
          type: 'image_analysis_chunk',
          chunk
        });
      }
    }

    await sendEvent({
      type: 'image_analysis_end',
      analysis: fullAnalysis
    });

    return {
      success: true,
      data: {
        analysis: fullAnalysis,
        image_url
      },
      shouldContinue: true
    };
  } catch (error) {
    return {
      success: false,
      error: `图片分析失败: ${error instanceof Error ? error.message : '未知错误'}`,
      shouldContinue: true
    };
  }
};

// 工具6: 提示词优化 - 主要逻辑由 Claude 执行
export const handleOptimizePrompt: ToolHandler = async (params, sendEvent) => {
  const { current_prompt, chinese_texts, issues, optimization_tips, iteration } = params;

  await sendEvent({
    type: 'optimization',
    version: iteration + 1,
    changes: issues || []
  });

  return {
    success: true,
    data: {
      current_version: iteration,
      next_version: iteration + 1,
      issues_to_fix: issues || [],
      tips_to_apply: optimization_tips || [],
      chinese_texts_to_preserve: chinese_texts,
      guidelines: [
        '1. 保留所有中文原文',
        '2. 针对每个问题添加修复语句',
        '3. 应用优化技巧',
        '4. 确保提示词流畅连贯'
      ]
    },
    shouldContinue: true
  };
};

// 工具7: 质量评估 - 主要逻辑由 Claude 执行
export const handleEvaluatePrompt: ToolHandler = async (params, sendEvent) => {
  const { prompt, user_requirements, chinese_texts, skill_checklist } = params;

  // 基础评分逻辑
  let score = 60; // 基础分
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 检查中文是否都包含
  chinese_texts?.forEach((text: string) => {
    if (prompt.includes(`"${text}"`)) {
      score += 5;
    } else if (prompt.includes(text)) {
      score += 2;
      issues.push(`中文 "${text}" 未用引号包裹`);
    } else {
      issues.push(`缺少中文文字: "${text}"`);
      score -= 5;
    }
  });

  // 检查约束语句
  if (prompt.includes('All Chinese text must be exactly as specified')) {
    score += 5;
  } else {
    suggestions.push('建议添加 "All Chinese text must be exactly as specified with no other text"');
  }

  // 检查质量词
  const qualityWords = ['8K', '4K', 'high quality', 'professional', 'resolution'];
  const hasQualityWords = qualityWords.some(w => prompt.toLowerCase().includes(w.toLowerCase()));
  if (hasQualityWords) {
    score += 5;
  } else {
    suggestions.push('建议添加质量控制词如 "8K resolution", "ultra high quality"');
  }

  // 限制分数范围
  score = Math.max(0, Math.min(100, score));
  const passed = score >= 85;

  await sendEvent({
    type: 'evaluation',
    score,
    issues,
    passed
  });

  return {
    success: true,
    data: {
      score,
      passed,
      issues,
      suggestions,
      breakdown: {
        chinese_completeness: '检查中文文字是否完整',
        requirement_coverage: '检查是否满足用户需求',
        structure_clarity: '检查结构是否清晰',
        style_accuracy: '检查风格描述是否到位'
      }
    },
    shouldContinue: true
  };
};

/**
 * 安全解析 JSON 字符串（用于 prompts 数组元素）
 */
function safeParsePromptJSON(text: string): Record<string, any> | null {
  if (!text || !text.trim()) return null;

  // 1. 直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续修复
  }

  // 2. 尝试修复常见问题
  let fixed = text
    .replace(/,\s*([}\]])/g, '$1')  // 移除尾部逗号
    .replace(/'/g, '"');             // 单引号转双引号

  try {
    return JSON.parse(fixed);
  } catch {
    // 继续
  }

  // 3. 尝试提取 JSON 对象
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // 尝试修复提取的对象
      fixed = match[0].replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"');
      try {
        return JSON.parse(fixed);
      } catch {
        // 放弃
      }
    }
  }

  return null;
}

/**
 * 从文本中提取中文引号内的文字
 */
function extractChineseTexts(text: string): string[] {
  const matches = text.match(/"([^"]*[\u4e00-\u9fa5]+[^"]*)"/g);
  return matches ? matches.map(m => m.replace(/"/g, '')) : [];
}

// 工具8: 最终输出（支持多提示词）
export const handleFinalizeOutput: ToolHandler = async (params, sendEvent) => {
  const {
    prompts,
    generation_tips,
    recommended_model,
    matched_skill
  } = params;

  console.log('[SuperAgent] finalize_output received prompts:', JSON.stringify(prompts, null, 2));

  // 防御性处理：确保 prompts 是数组
  let promptsArray: any[] = [];
  if (Array.isArray(prompts)) {
    promptsArray = prompts;
  } else if (typeof prompts === 'string') {
    // 可能是 JSON 字符串形式的数组
    const parsed = safeParsePromptJSON(prompts);
    if (Array.isArray(parsed)) {
      promptsArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // 单个对象，包装成数组
      promptsArray = [parsed];
    } else {
      // 纯字符串，当作单个 prompt
      promptsArray = [{ prompt: prompts, scene: '默认场景' }];
    }
  } else if (typeof prompts === 'object' && prompts !== null) {
    // 单个对象
    promptsArray = [prompts];
  }

  console.log(`[SuperAgent] Parsed prompts array length: ${promptsArray.length}`);

  // 处理 prompts 数组，生成 PromptItem 列表
  // 支持多种格式：
  // 1. 对象: { scene, prompt, chinese_texts }
  // 2. JSON 字符串: '{"scene": "...", "prompt": "..."}'
  // 3. 纯字符串: 直接作为 prompt 使用
  const promptItems = promptsArray.map((p: any, index: number) => {
    let promptText = '';
    let scene = `场景 ${index + 1}`;
    let chineseTexts: string[] = [];

    if (typeof p === 'string') {
      // 尝试解析为 JSON（使用安全解析）
      const parsed = safeParsePromptJSON(p);
      if (parsed) {
        promptText = parsed.prompt || parsed.text || parsed.content || '';
        scene = parsed.scene || parsed.title || parsed.name || scene;
        chineseTexts = Array.isArray(parsed.chinese_texts) ? parsed.chinese_texts :
                       Array.isArray(parsed.chineseTexts) ? parsed.chineseTexts :
                       Array.isArray(parsed.texts) ? parsed.texts : [];
        console.log(`[SuperAgent] Parsed JSON string for prompt ${index + 1}`);
      } else {
        // 不是 JSON，直接作为提示词使用
        promptText = p;
        console.log(`[SuperAgent] Using raw string as prompt ${index + 1}`);
        // 提取中文文字
        chineseTexts = extractChineseTexts(p);
      }
    } else if (typeof p === 'object' && p !== null) {
      // 对象格式
      promptText = p.prompt || p.text || p.content || '';
      scene = p.scene || p.title || p.name || scene;
      chineseTexts = Array.isArray(p.chinese_texts) ? p.chinese_texts :
                     Array.isArray(p.chineseTexts) ? p.chineseTexts :
                     Array.isArray(p.texts) ? p.texts : [];
    }

    console.log(`[SuperAgent] Prompt ${index + 1}: scene="${scene}", prompt="${promptText.substring(0, 50)}..."`);

    // 验证 prompt 是否是有效的图片生成提示词（而非思考过程或分析文字）
    const invalidPatterns = [
      /^Based on/i,           // 思考过程开头
      /^According to/i,       // 分析开头
      /^## /,                 // Markdown 标题
      /^行动\d+/,              // 行动标记
      /^The analysis/i,       // 分析文字
      /^Let me/i,             // 思考语句
      /^I (will|should|need)/i, // 意图说明
      /^Here('s| is)/i,       // 介绍语句
      /^\d+\.\s/,             // 数字列表
      /^首先|^然后|^最后/,     // 中文步骤词
      /生成.*提示词/,          // 中文说明
    ];

    const isInvalidPrompt = invalidPatterns.some(pattern => pattern.test(promptText.trim()));

    if (isInvalidPrompt) {
      console.error(`[SuperAgent] ❌ Invalid prompt detected (not an image description): "${promptText.substring(0, 100)}..."`);
      console.error(`[SuperAgent] This looks like thinking/analysis text, not an image generation prompt`);
      // 标记为无效，但仍返回以便调试
      return {
        id: `prompt-${Date.now()}-${index}`,
        scene,
        prompt: '', // 置空，会被过滤掉
        chineseTexts,
        _invalidReason: 'Detected as thinking/analysis text, not an image prompt'
      };
    }

    return {
      id: `prompt-${Date.now()}-${index}`,
      scene,
      prompt: promptText,
      chineseTexts
    };
  }).filter((p: any) => p && p.prompt && p.prompt.trim().length > 0);

  if (promptItems.length === 0) {
    console.error('[SuperAgent] No valid prompts found in:', prompts);
    // 返回一个默认结果而不是空数组
    promptItems.push({
      id: `prompt-${Date.now()}-fallback`,
      scene: '默认场景',
      prompt: '无法解析提示词，请重试',
      chineseTexts: []
    });
  }

  // 汇总所有中文文字
  const allChineseTexts: string[] = promptItems.flatMap((p: any) => p.chineseTexts || []);

  // 主提示词（第一个或合并）
  const finalPrompt = promptItems.length === 1
    ? promptItems[0].prompt
    : promptItems.map((p: any) => `【${p.scene}】\n${p.prompt}`).join('\n\n---\n\n');

  const result: FinalOutput = {
    finalPrompt,
    prompts: promptItems,
    chineseTexts: [...new Set(allChineseTexts)] as string[], // 去重
    generationTips: generation_tips || [
      '建议使用 Ideogram 或 DALL-E 3 以获得更好的中文渲染效果',
      '如果中文显示有问题，可以尝试减少文字量'
    ],
    recommendedModel: recommended_model || 'nano-banana-pro',
    iterationCount: 0, // 会在 ReAct 循环中更新
    matchedSkill: matched_skill || null
  };

  await sendEvent({
    type: 'complete',
    result
  });

  return {
    success: true,
    data: result,
    shouldContinue: false // 结束 ReAct 循环
  };
};

// 工具处理器映射
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  skill_matcher: handleSkillMatcher,
  load_skill: handleLoadSkill,
  generate_prompt: handleGeneratePrompt,
  web_search: handleWebSearch,
  deep_research: handleDeepResearch,         // 新版: HyprLab sonar-deep-research
  deep_research_legacy: handleDeepResearchLegacy,  // 旧版: Google + Tavily + LLM 评估
  analyze_image: handleAnalyzeImage,
  optimize_prompt: handleOptimizePrompt,
  evaluate_prompt: handleEvaluatePrompt,
  finalize_output: handleFinalizeOutput
};

// 执行工具调用
export async function executeToolCall(
  toolName: string,
  params: Record<string, any>,
  sendEvent: (event: SuperAgentStreamEvent) => Promise<void>
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return {
      success: false,
      error: `未知工具: ${toolName}`,
      shouldContinue: true
    };
  }

  try {
    return await handler(params, sendEvent);
  } catch (error) {
    return {
      success: false,
      error: `工具执行失败: ${error instanceof Error ? error.message : '未知错误'}`,
      shouldContinue: true
    };
  }
}
