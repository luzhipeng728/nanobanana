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

// 工具4: 网络搜索
export const handleWebSearch: ToolHandler = async (params, sendEvent) => {
  const { query, search_type } = params;

  await sendEvent({
    type: 'search_start',
    query
  });

  try {
    // 使用 Exa 搜索或其他搜索 API
    // 这里简化处理，返回模拟结果
    // 实际实现时可以调用 mcp__exa__web_search_exa 或其他搜索服务

    const searchResults = {
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

    const results = searchResults[search_type as keyof typeof searchResults] || [];

    await sendEvent({
      type: 'search_result',
      summary: `找到 ${results.length} 条相关信息`
    });

    return {
      success: true,
      data: {
        query,
        search_type,
        results,
        summary: results.join('\n')
      },
      shouldContinue: true
    };
  } catch (error) {
    return {
      success: false,
      error: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`,
      shouldContinue: true
    };
  }
};

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
  // 支持多种可能的字段名：prompt, text, content
  // 也支持 AI 返回 JSON 字符串而不是对象的情况
  const promptItems = (prompts || []).map((p: any, index: number) => {
    // 如果 p 是字符串，尝试解析为 JSON
    let parsed = p;
    if (typeof p === 'string') {
      try {
        parsed = JSON.parse(p);
        console.log(`[SuperAgent] Parsed JSON string for prompt ${index + 1}`);
      } catch (e) {
        console.error(`[SuperAgent] Failed to parse prompt ${index + 1} as JSON:`, p);
        return null;
      }
    }

    const promptText = parsed.prompt || parsed.text || parsed.content || '';
    const scene = parsed.scene || parsed.title || parsed.name || `场景 ${index + 1}`;
    const chineseTexts = parsed.chinese_texts || parsed.chineseTexts || parsed.texts || [];

    console.log(`[SuperAgent] Prompt ${index + 1}: scene="${scene}", prompt="${promptText.substring(0, 50)}..."`);

    return {
      id: `prompt-${Date.now()}-${index}`,
      scene,
      prompt: promptText,
      chineseTexts
    };
  }).filter((p: any) => p && p.prompt && p.prompt.trim().length > 0); // 过滤空 prompt 和 null

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
