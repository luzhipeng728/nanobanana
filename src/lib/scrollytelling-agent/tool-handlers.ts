// Reveal.js 演示文稿 Agent 工具处理器

import {
  ImageInfo,
  PresentationPlan,
  SlidePlan,
  SlideImageConfig,
  ToolResult,
  ScrollytellingStreamEvent,
  ScrollytellingAgentState
} from './types';

// 工具处理器类型
type ToolHandler = (
  params: Record<string, any>,
  state: ScrollytellingAgentState,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
) => Promise<ToolResult>;

// 1. 规划结构（包含幻灯片和生图提示词）
export const handlePlanStructure: ToolHandler = async (params, state, sendEvent) => {
  const {
    theme_style,
    narrative_approach,
    slides: slidesInput,
    transitions = 'slide',
    interaction_preferences = []
  } = params;

  // 构建幻灯片列表
  const slides: SlidePlan[] = (slidesInput || []).map((slide: any, index: number) => {
    // 构建图片配置
    let imageConfig: SlideImageConfig | undefined;
    if (slide.image_prompt) {
      imageConfig = {
        prompt: slide.image_prompt,
        aspectRatio: slide.image_aspect_ratio || '16:9',
        style: theme_style,
        status: 'pending'
      };
    }

    return {
      title: slide.title || `幻灯片 ${index + 1}`,
      subtitle: slide.subtitle,
      layout: slide.layout || 'content',
      imageConfig,
      keyPoints: slide.key_points || [],
      chartType: slide.chart_type !== 'none' ? slide.chart_type : undefined,
      animations: slide.animations || [],
      searchQuery: slide.key_points?.[0]
    };
  });

  // 如果没有规划幻灯片，基于参考图片数量创建默认结构
  if (slides.length === 0) {
    const defaultSlideCount = Math.max(5, state.images.length + 2);
    for (let i = 0; i < defaultSlideCount; i++) {
      slides.push({
        title: i === 0 ? '开场' : i === defaultSlideCount - 1 ? '总结' : `要点 ${i}`,
        layout: i === 0 ? 'title' : i === defaultSlideCount - 1 ? 'content' : 'image-left',
        keyPoints: ['待补充'],
        animations: ['fade-in']
      });
    }
  }

  const plan: PresentationPlan = {
    theme: theme_style,
    colorScheme: getColorScheme(theme_style),
    slides,
    overallNarrative: narrative_approach,
    interactionTypes: interaction_preferences.length > 0
      ? interaction_preferences
      : ['tabs', 'counters', 'charts', 'progress-bars'],
    transitions
  };

  // 更新状态
  state.structurePlan = plan;

  // 发送事件
  await sendEvent({
    type: 'structure_planned',
    plan
  });

  // 统计需要生成的图片数量
  const imageCount = slides.filter(s => s.imageConfig).length;

  return {
    success: true,
    data: {
      slidesCount: slides.length,
      imagePromptCount: imageCount,
      theme: theme_style,
      transitions,
      interactions: plan.interactionTypes,
      message: `已规划 ${slides.length} 张幻灯片，其中 ${imageCount} 张需要 AI 生成图片`
    }
  };
};

// 根据主题获取配色方案
function getColorScheme(theme: string): string[] {
  const schemes: Record<string, string[]> = {
    '科技感': ['#0066ff', '#00d4ff', '#1a1a2e', '#16213e', '#0f3460'],
    '自然清新': ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2'],
    '商务专业': ['#1e3a5f', '#3d5a80', '#98c1d9', '#e0fbfc', '#293241'],
    '艺术创意': ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'],
    '暗黑风格': ['#121212', '#1e1e1e', '#2d2d2d', '#3d3d3d', '#00ff88'],
    '简约现代': ['#2c3e50', '#34495e', '#ecf0f1', '#3498db', '#e74c3c'],
    '手绘温馨': ['#ffeaa7', '#fdcb6e', '#fab1a0', '#74b9ff', '#a29bfe'],
    '未来科幻': ['#00f5d4', '#00bbf9', '#9b5de5', '#f15bb5', '#fee440']
  };

  return schemes[theme] || schemes['简约现代'];
}

// 2. 网络搜索
export const handleWebSearch: ToolHandler = async (params, state, sendEvent) => {
  const { query, search_type, slide_index } = params;

  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    return {
      success: false,
      error: 'TAVILY_API_KEY 未配置'
    };
  }

  // 发送搜索开始事件
  await sendEvent({
    type: 'search_start',
    query,
    chapter: slide_index ?? -1
  });

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: `${query} ${search_type === 'statistics' ? '数据 统计' : ''}`,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Search API error: ${response.status}`);
    }

    const data = await response.json();

    // 整理搜索结果
    let summary = '';
    if (data.answer) {
      summary += `【概要】${data.answer}\n\n`;
    }
    if (data.results && data.results.length > 0) {
      summary += '【详细信息】\n';
      for (const result of data.results.slice(0, 3)) {
        summary += `- ${result.title}: ${result.content?.slice(0, 200)}\n`;
      }
    }

    // 更新幻灯片的搜索结果
    if (slide_index !== undefined && state.structurePlan?.slides[slide_index]) {
      state.structurePlan.slides[slide_index].searchResults = summary;
    }

    // 添加到收集的材料
    state.collectedMaterials.push(`【搜索: ${query}】\n${summary}`);

    // 发送搜索结果事件
    await sendEvent({
      type: 'search_result',
      chapter: slide_index ?? -1,
      summary: summary.slice(0, 200) + '...'
    });

    return {
      success: true,
      data: {
        query,
        answer: data.answer,
        resultsCount: data.results?.length || 0,
        summary
      }
    };

  } catch (error) {
    console.error('[Presentation Agent] Search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败'
    };
  }
};

// 3. 生成图表数据
export const handleGenerateChartData: ToolHandler = async (params, state, sendEvent) => {
  const { slide_index, chart_type, data_description, data_points } = params;

  // 生成 ECharts 配置
  const chartConfig = generateEChartsConfig(chart_type, data_description, data_points);

  // 更新幻灯片
  if (state.structurePlan?.slides[slide_index]) {
    state.structurePlan.slides[slide_index].chartType = chart_type;
    state.structurePlan.slides[slide_index].chartData = chartConfig;
  }

  // 发送事件
  await sendEvent({
    type: 'data_generated',
    chapter: slide_index,
    chartType: chart_type
  });

  return {
    success: true,
    data: {
      chartType: chart_type,
      dataPointsCount: data_points.length,
      config: chartConfig
    }
  };
};

// 生成 ECharts 配置
function generateEChartsConfig(
  chartType: string,
  description: string,
  dataPoints: Array<{ label: string; value: number }>
): any {
  const labels = dataPoints.map(d => d.label);
  const values = dataPoints.map(d => d.value);

  const baseConfig = {
    animation: true,
    animationDuration: 1500,
    animationEasing: 'cubicOut',
    tooltip: { trigger: chartType === 'pie' ? 'item' : 'axis' },
    title: {
      text: description,
      left: 'center',
      textStyle: { fontSize: 14, color: '#fff' }
    }
  };

  switch (chartType) {
    case 'bar':
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: labels, axisLabel: { color: '#ccc' } },
        yAxis: { type: 'value', axisLabel: { color: '#ccc' } },
        series: [{
          type: 'bar',
          data: values,
          itemStyle: { borderRadius: [4, 4, 0, 0] }
        }]
      };

    case 'line':
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: labels, axisLabel: { color: '#ccc' } },
        yAxis: { type: 'value', axisLabel: { color: '#ccc' } },
        series: [{
          type: 'line',
          data: values,
          smooth: true,
          areaStyle: { opacity: 0.3 }
        }]
      };

    case 'pie':
      return {
        ...baseConfig,
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          data: dataPoints.map(d => ({ name: d.label, value: d.value })),
          label: { show: true, formatter: '{b}: {d}%', color: '#fff' }
        }]
      };

    case 'gauge':
      return {
        ...baseConfig,
        series: [{
          type: 'gauge',
          progress: { show: true },
          data: [{ value: values[0] || 0, name: labels[0] || '' }]
        }]
      };

    case 'radar':
      return {
        ...baseConfig,
        radar: {
          indicator: labels.map(label => ({ name: label, max: Math.max(...values) * 1.2 }))
        },
        series: [{
          type: 'radar',
          data: [{ value: values }]
        }]
      };

    default:
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: labels },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: values }]
      };
  }
}

// 4. 最终化提示词
export const handleFinalizePrompt: ToolHandler = async (params, state, sendEvent) => {
  const { additional_requirements = [], special_effects = [] } = params;

  if (!state.structurePlan) {
    return {
      success: false,
      error: '请先调用 plan_structure 规划演示文稿结构'
    };
  }

  // 构建详细的最终提示词
  const finalPrompt = buildFinalPrompt(state, additional_requirements, special_effects);

  // 更新状态
  state.finalPrompt = finalPrompt;
  state.isComplete = true;

  // 发送事件
  await sendEvent({
    type: 'prompt_ready',
    promptLength: finalPrompt.length
  });

  // 统计需要生成的图片
  const imageConfigs = state.structurePlan.slides
    .map((slide, index) => slide.imageConfig ? { ...slide.imageConfig, slideIndex: index } : null)
    .filter(Boolean);

  return {
    success: true,
    data: {
      promptLength: finalPrompt.length,
      slidesCount: state.structurePlan.slides.length,
      materialsCount: state.collectedMaterials.length,
      imagesToGenerate: imageConfigs.length,
      message: `准备就绪！将并发生成 ${imageConfigs.length} 张 AI 图片，然后生成 reveal.js 演示文稿`
    }
  };
};

// 构建最终提示词（用于 Gemini 生成 reveal.js）
function buildFinalPrompt(
  state: ScrollytellingAgentState,
  additionalRequirements: string[],
  specialEffects: string[]
): string {
  const plan = state.structurePlan!;

  let prompt = `请创建一个【${plan.theme}】风格的高端 reveal.js 演示文稿。

## 整体设计

**叙事方式**: ${plan.overallNarrative}
**配色方案**: ${plan.colorScheme.join(', ')}
**转场效果**: ${plan.transitions}
**交互类型**: ${plan.interactionTypes.join(', ')}

## 幻灯片详情（共 ${plan.slides.length} 张）

`;

  // 添加每张幻灯片的详细信息
  for (let i = 0; i < plan.slides.length; i++) {
    const slide = plan.slides[i];

    prompt += `### 幻灯片 ${i + 1}: ${slide.title}

**布局**: ${slide.layout}
**关键内容**: ${slide.keyPoints.join('、')}
`;

    // 图片信息（占位符，实际 URL 会在生成后替换）
    if (slide.imageConfig) {
      prompt += `
**图片**: {{IMAGE_${i}}}
**图片描述**: ${slide.imageConfig.prompt}
**图片比例**: ${slide.imageConfig.aspectRatio}
`;
    }

    if (slide.searchResults) {
      prompt += `
**扩展资料**:
${slide.searchResults}
`;
    }

    if (slide.chartData) {
      prompt += `
**图表配置** (${slide.chartType}类型):
\`\`\`json
${JSON.stringify(slide.chartData, null, 2)}
\`\`\`
`;
    }

    if (slide.animations && slide.animations.length > 0) {
      prompt += `**动画效果**: ${slide.animations.join('、')}\n`;
    }

    prompt += `
---

`;
  }

  // 添加收集的材料
  if (state.collectedMaterials.length > 0) {
    prompt += `## 补充材料

${state.collectedMaterials.join('\n\n')}

`;
  }

  // 添加技术要求
  prompt += `## 技术要求

1. **使用 reveal.js 框架**
2. **CDN 引入**:
\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/theme/black.min.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

3. **必须包含的交互元素**:
   - 数据卡片（带计数动画）
   - ECharts 图表
   - 进度条动画
   - 片段动画（fragment）

4. **特殊效果**: ${specialEffects.length > 0 ? specialEffects.join('、') : '平滑转场、数字滚动计数、图表入场动画'}

5. **额外要求**: ${additionalRequirements.length > 0 ? additionalRequirements.join('；') : '确保在演示模式下流畅运行'}

## 输出格式

直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 图片占位符说明**：
- 代码中的 {{IMAGE_0}}、{{IMAGE_1}} 等占位符会在后续被替换为真实的 AI 生成图片 URL
- 请确保正确使用这些占位符

**⚠️ 核心：内容丰富 + 视觉精美 + 交互流畅！**`;

  return prompt;
}

// 工具处理器映射
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  plan_structure: handlePlanStructure,
  web_search: handleWebSearch,
  generate_chart_data: handleGenerateChartData,
  finalize_prompt: handleFinalizePrompt
};

// 统一执行入口
export async function executeToolCall(
  toolName: string,
  params: Record<string, any>,
  state: ScrollytellingAgentState,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    return { success: false, error: `未知工具: ${toolName}` };
  }

  try {
    return await handler(params, state, sendEvent);
  } catch (error) {
    console.error(`[Presentation Agent] Tool ${toolName} error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '工具执行失败'
    };
  }
}
