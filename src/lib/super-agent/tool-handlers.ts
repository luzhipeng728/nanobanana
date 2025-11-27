// 工具处理器 - 实际执行工具调用的逻辑

import Anthropic from '@anthropic-ai/sdk';
import { SKILL_LIBRARY, matchSkillByKeywords } from './skills';
import type { ToolResult, FinalOutput, SuperAgentStreamEvent } from '@/types/super-agent';

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

// 工具4.5: 深度研究（探索式多轮搜索）
export const handleResearchTopic: ToolHandler = async (params, sendEvent) => {
  const { topic, required_info, context } = params;
  const requiredInfoList = required_info as string[];

  await sendEvent({
    type: 'research_start',
    topic,
    requiredInfo: requiredInfoList
  });

  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    console.warn('[ResearchTopic] TAVILY_API_KEY not configured');
    return {
      success: false,
      error: 'TAVILY_API_KEY 未配置，无法进行深度研究',
      shouldContinue: true
    };
  }

  // 研究状态
  const researchState = {
    collectedInfo: new Map<string, string[]>(), // 每种信息类型收集到的内容
    searchRound: 0,
    maxRounds: 4, // 最多4轮搜索
    allResults: [] as any[],
    queriesUsed: [] as string[]
  };

  // 初始化收集状态
  requiredInfoList.forEach(info => {
    researchState.collectedInfo.set(info, []);
  });

  // 生成搜索查询的辅助函数
  const generateQueries = (round: number): string[] => {
    const queries: string[] = [];
    const baseContext = context ? ` ${context}` : '';

    if (round === 0) {
      // 第一轮：直接搜索主题
      queries.push(`${topic}${baseContext}`);
      // 针对每个必需信息生成查询
      requiredInfoList.slice(0, 2).forEach(info => {
        queries.push(`${topic} ${info}`);
      });
    } else {
      // 后续轮次：针对缺失信息进行补充搜索
      const missingInfo = requiredInfoList.filter(
        info => (researchState.collectedInfo.get(info)?.length || 0) < 2
      );

      missingInfo.slice(0, 3).forEach(info => {
        // 使用不同的查询变体
        const variants = [
          `${topic} ${info} 详细`,
          `${topic} ${info} 最新`,
          `${info} ${topic.split(' ')[0]}` // 尝试不同的词序
        ];
        queries.push(variants[round % variants.length]);
      });
    }

    // 过滤已使用的查询
    return queries.filter(q => !researchState.queriesUsed.includes(q));
  };

  // 评估信息充足度
  const evaluateSufficiency = (): { sufficient: boolean; coverage: number; missing: string[] } => {
    let coveredCount = 0;
    const missing: string[] = [];

    requiredInfoList.forEach(info => {
      const collected = researchState.collectedInfo.get(info) || [];
      if (collected.length >= 2) {
        coveredCount++;
      } else if (collected.length === 0) {
        missing.push(info);
      }
    });

    const coverage = requiredInfoList.length > 0
      ? (coveredCount / requiredInfoList.length) * 100
      : 100;

    return {
      sufficient: coverage >= 70 || researchState.searchRound >= researchState.maxRounds,
      coverage,
      missing
    };
  };

  // 执行单次搜索
  const executeSearch = async (query: string): Promise<any[]> => {
    try {
      console.log(`[ResearchTopic] Searching: ${query}`);
      researchState.queriesUsed.push(query);

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: query,
          search_depth: 'advanced', // 使用高级搜索获取更多信息
          max_results: 5,
          include_answer: true,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error(`[ResearchTopic] Search error for "${query}":`, error);
      return [];
    }
  };

  // 分类收集到的信息
  const categorizeResults = (results: any[]) => {
    results.forEach(result => {
      const content = (result.content || '').toLowerCase();
      const title = (result.title || '').toLowerCase();
      const combined = `${title} ${content}`;

      requiredInfoList.forEach(info => {
        const infoLower = info.toLowerCase();
        // 检查内容是否与该信息类型相关
        const keywords = infoLower.split(/\s+/);
        const matches = keywords.filter(kw => combined.includes(kw)).length;

        if (matches > 0 || combined.includes(infoLower)) {
          const collected = researchState.collectedInfo.get(info) || [];
          // 避免重复
          if (!collected.includes(result.content)) {
            collected.push(result.content);
            researchState.collectedInfo.set(info, collected);
          }
        }
      });
    });
  };

  // 主循环：探索式搜索
  while (researchState.searchRound < researchState.maxRounds) {
    researchState.searchRound++;

    await sendEvent({
      type: 'research_progress',
      round: researchState.searchRound,
      maxRounds: researchState.maxRounds,
      status: `正在进行第 ${researchState.searchRound} 轮搜索...`
    });

    const queries = generateQueries(researchState.searchRound - 1);

    if (queries.length === 0) {
      console.log('[ResearchTopic] No new queries to execute');
      break;
    }

    // 并行执行搜索
    const searchPromises = queries.map(q => executeSearch(q));
    const results = await Promise.all(searchPromises);

    // 合并结果
    const allNewResults = results.flat();
    researchState.allResults.push(...allNewResults);

    // 分类结果
    categorizeResults(allNewResults);

    // 评估充足度
    const evaluation = evaluateSufficiency();

    await sendEvent({
      type: 'research_evaluation',
      round: researchState.searchRound,
      coverage: evaluation.coverage,
      missing: evaluation.missing,
      sufficient: evaluation.sufficient
    });

    console.log(`[ResearchTopic] Round ${researchState.searchRound}: coverage=${evaluation.coverage.toFixed(1)}%, missing=${evaluation.missing.join(', ')}`);

    if (evaluation.sufficient) {
      console.log('[ResearchTopic] Information sufficient, stopping search');
      break;
    }

    // 添加小延迟避免 API 限流
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 整理最终结果
  const finalEvaluation = evaluateSufficiency();
  const summary: Record<string, string[]> = {};
  researchState.collectedInfo.forEach((value, key) => {
    summary[key] = value.slice(0, 5); // 每种类型最多保留5条
  });

  await sendEvent({
    type: 'research_complete',
    topic,
    rounds: researchState.searchRound,
    coverage: finalEvaluation.coverage
  });

  return {
    success: true,
    data: {
      topic,
      required_info: requiredInfoList,
      search_rounds: researchState.searchRound,
      coverage: finalEvaluation.coverage,
      missing_info: finalEvaluation.missing,
      collected_info: summary,
      total_results: researchState.allResults.length,
      queries_used: researchState.queriesUsed,
      // 提供一个综合摘要供 AI 使用
      research_summary: Object.entries(summary)
        .map(([key, values]) => `【${key}】\n${values.slice(0, 3).join('\n')}`)
        .join('\n\n')
    },
    shouldContinue: true
  };
};

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
      model: 'claude-sonnet-4-20250514',
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
  research_topic: handleResearchTopic,
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
