// 工具处理器 - 实际执行工具调用的逻辑

import Anthropic from '@anthropic-ai/sdk';
import { SKILL_LIBRARY, matchSkillByKeywords } from './skills';
import type { ToolResult, FinalOutput, SuperAgentStreamEvent } from '@/types/super-agent';
import { runDeepResearch, ResearchProgressEvent } from './deep-research';

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
  const { skill_id } = params;
  const skill = SKILL_LIBRARY[skill_id];

  if (!skill) {
    return {
      success: false,
      error: `技能 "${skill_id}" 不存在。可用技能: ${Object.keys(SKILL_LIBRARY).join(', ')}`,
      shouldContinue: true
    };
  }

  return {
    success: true,
    data: {
      metadata: skill.metadata,
      basePrompt: skill.basePrompt,
      variables: skill.variables,
      examples: skill.examples,
      qualityChecklist: skill.qualityChecklist,
      commonIssues: skill.commonIssues
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

// 工具4.5: 深度研究智能体（独立子智能体）
export const handleDeepResearch: ToolHandler = async (params, sendEvent) => {
  const { topic, required_info, context, output_mode, max_rounds, date_restrict } = params;

  console.log(`[DeepResearch] Starting deep research on: ${topic}`);
  if (date_restrict) {
    console.log(`[DeepResearch] Date restriction: ${date_restrict}`);
  }

  // 创建事件转发器，将子智能体事件转换为主智能体事件格式
  const forwardEvent = async (event: ResearchProgressEvent): Promise<void> => {
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
          status: `🔬 深度研究第 ${event.round}/${event.maxRounds} 轮：正在搜索 ${event.queries.length} 个查询...`
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
          status: `✅ 第 ${event.round} 轮完成：新增 ${event.newInfoCount} 条信息，累计 ${event.totalInfoCount} 条`
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

      case 'complete':
        await sendEvent({
          type: 'research_complete',
          topic,
          rounds: event.report.totalRounds,
          coverage: event.report.quality.coverageScore
        });
        break;

      case 'error':
        console.error('[DeepResearch] Error:', event.error);
        break;
    }
  };

  try {
    // 调用 DeepResearch 子智能体
    const report = await runDeepResearch(
      {
        topic,
        context,
        requiredInfo: required_info as string[] | undefined,
        outputMode: output_mode as 'summary' | 'detailed' | 'adaptive' | undefined,
        maxRounds: max_rounds as number | undefined,
        dateRestrict: date_restrict as string | undefined
      },
      forwardEvent,
      {
        maxRounds: max_rounds || 3,
        includeRawData: output_mode === 'detailed',
        includeTrace: output_mode === 'detailed',
        outputMode: output_mode || 'adaptive'
      }
    );

    // 构建返回结果
    return {
      success: true,
      data: {
        topic: report.topic,
        total_rounds: report.totalRounds,
        total_time_ms: report.totalTime,
        sources_count: report.sourcesCount,

        // 摘要信息
        overview: report.summary.overview,
        key_findings: report.summary.keyFindings,

        // 分类信息
        categorized_info: report.summary.categories,

        // 质量指标
        coverage_score: report.quality.coverageScore,
        quality_score: report.quality.qualityScore,
        confidence: report.quality.confidence,
        limitations: report.quality.limitations,

        // 原始数据（如果请求）
        sources: report.rawData?.sources,

        // 便于 AI 使用的综合摘要
        research_summary: formatResearchSummary(report)
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

// 格式化研究摘要，便于 AI 使用
function formatResearchSummary(report: any): string {
  const parts: string[] = [];

  // 概述
  if (report.summary.overview) {
    parts.push(`【概述】\n${report.summary.overview}`);
  }

  // 关键发现
  if (report.summary.keyFindings?.length > 0) {
    parts.push(`【关键发现】\n${report.summary.keyFindings.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n')}`);
  }

  // 分类信息
  const categories = report.summary.categories || {};
  for (const [category, items] of Object.entries(categories)) {
    if (Array.isArray(items) && items.length > 0) {
      const categoryName = getCategoryLabel(category);
      parts.push(`【${categoryName}】\n${(items as string[]).slice(0, 3).join('\n')}`);
    }
  }

  // 来源
  if (report.rawData?.sources?.length > 0) {
    const sourcesText = report.rawData.sources
      .slice(0, 5)
      .map((s: any) => `- ${s.title}: ${s.url}`)
      .join('\n');
    parts.push(`【参考来源】\n${sourcesText}`);
  }

  // 质量说明
  parts.push(`【研究质量】覆盖率: ${report.quality.coverageScore.toFixed(1)}%, 置信度: ${(report.quality.confidence * 100).toFixed(1)}%`);

  if (report.quality.limitations?.length > 0) {
    parts.push(`【注意事项】\n${report.quality.limitations.join('\n')}`);
  }

  return parts.join('\n\n');
}

// 获取分类中文标签
function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    background: '背景信息',
    key_facts: '关键事实',
    latest_updates: '最新动态',
    opinions: '观点/争议',
    statistics: '数据/统计',
    examples: '案例/示例',
    references: '参考资料',
    other: '其他信息'
  };
  return labels[category] || category;
}

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

    // 下载图片并转为 base64
    const response = await fetch(image_url);
    if (!response.ok) {
      throw new Error(`无法下载图片: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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

// 工具8: 最终输出（支持多提示词）
export const handleFinalizeOutput: ToolHandler = async (params, sendEvent) => {
  const {
    prompts,
    generation_tips,
    recommended_model,
    matched_skill
  } = params;

  console.log('[SuperAgent] finalize_output received prompts:', JSON.stringify(prompts, null, 2));

  // 处理 prompts 数组，生成 PromptItem 列表
  // 支持多种格式：
  // 1. 对象: { scene, prompt, chinese_texts }
  // 2. JSON 字符串: '{"scene": "...", "prompt": "..."}'
  // 3. 纯字符串: 直接作为 prompt 使用
  const promptItems = (prompts || []).map((p: any, index: number) => {
    let promptText = '';
    let scene = `场景 ${index + 1}`;
    let chineseTexts: string[] = [];

    if (typeof p === 'string') {
      // 尝试解析为 JSON
      try {
        const parsed = JSON.parse(p);
        promptText = parsed.prompt || parsed.text || parsed.content || '';
        scene = parsed.scene || parsed.title || parsed.name || scene;
        chineseTexts = parsed.chinese_texts || parsed.chineseTexts || parsed.texts || [];
        console.log(`[SuperAgent] Parsed JSON string for prompt ${index + 1}`);
      } catch (e) {
        // 不是 JSON，直接作为提示词使用
        promptText = p;
        console.log(`[SuperAgent] Using raw string as prompt ${index + 1}`);

        // 尝试从提示词中提取中文文字
        const chineseMatches = p.match(/"([^"]*[\u4e00-\u9fa5]+[^"]*)"/g);
        if (chineseMatches) {
          chineseTexts = chineseMatches.map((m: string) => m.replace(/"/g, ''));
        }
      }
    } else if (typeof p === 'object' && p !== null) {
      // 对象格式
      promptText = p.prompt || p.text || p.content || '';
      scene = p.scene || p.title || p.name || scene;
      chineseTexts = p.chinese_texts || p.chineseTexts || p.texts || [];
    }

    console.log(`[SuperAgent] Prompt ${index + 1}: scene="${scene}", prompt="${promptText.substring(0, 50)}..."`);

    return {
      id: `prompt-${Date.now()}-${index}`,
      scene,
      prompt: promptText,
      chineseTexts
    };
  }).filter((p: any) => p && p.prompt && p.prompt.trim().length > 0);

  if (promptItems.length === 0) {
    console.error('[SuperAgent] No valid prompts found in:', prompts);
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
  deep_research: handleDeepResearch,  // 新的深度研究智能体
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
