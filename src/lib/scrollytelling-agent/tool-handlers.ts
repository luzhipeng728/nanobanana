// Scrollytelling Agent 工具处理器

import Anthropic from '@anthropic-ai/sdk';
import {
  ImageInfo,
  WebStructurePlan,
  ChapterPlan,
  ToolResult,
  ScrollytellingStreamEvent,
  ScrollytellingAgentState
} from './types';

// Anthropic 客户端
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY 未配置');
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

// 工具处理器类型
type ToolHandler = (
  params: Record<string, any>,
  state: ScrollytellingAgentState,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
) => Promise<ToolResult>;

// 1. 分析图片 - 优化版：直接使用图片提示词，无需调用 Vision API
export const handleAnalyzeImages: ToolHandler = async (params, state, sendEvent) => {
  const { focus_areas = ['主题', '元素', '色调', '情感'] } = params;

  const analysisResults: string[] = [];

  // 直接使用图片的提示词作为分析结果，无需调用 Vision API
  for (let i = 0; i < state.images.length; i++) {
    const image = state.images[i];

    // 使用用户提供的提示词作为分析基础
    const analysis = image.prompt
      ? `用户描述：${image.prompt}\n关注方向：${focus_areas.join('、')}`
      : `图片 ${i + 1}（无描述）\n关注方向：${focus_areas.join('、')}`;

    // 更新状态
    state.images[i].analysis = analysis;
    analysisResults.push(`【图片${i + 1}】\n${analysis}`);

    // 发送事件
    await sendEvent({
      type: 'image_analysis',
      index: i,
      analysis: analysis.slice(0, 200) + (analysis.length > 200 ? '...' : '')
    });
  }

  return {
    success: true,
    data: {
      analysisCount: analysisResults.length,
      analyses: analysisResults,
      note: '已使用图片提示词作为分析基础，无需额外 Vision API 调用'
    }
  };
};

// 2. 规划结构
export const handlePlanStructure: ToolHandler = async (params, state, sendEvent) => {
  const { theme_style, narrative_approach, interaction_preferences = [] } = params;

  // 基于图片分析结果规划结构
  const chapters: ChapterPlan[] = state.images.map((image, index) => {
    // 从分析中提取关键信息
    const analysis = image.analysis || '';

    // 简单的关键词提取
    const keyPoints: string[] = [];
    if (analysis.includes('数据') || analysis.includes('统计')) {
      keyPoints.push('数据展示');
    }
    if (analysis.includes('趋势') || analysis.includes('增长')) {
      keyPoints.push('趋势分析');
    }
    if (analysis.includes('对比') || analysis.includes('比较')) {
      keyPoints.push('对比分析');
    }

    // 默认关键点
    if (keyPoints.length === 0) {
      keyPoints.push('核心要点', '详细说明', '相关数据');
    }

    return {
      title: `第 ${index + 1} 章`,
      subtitle: image.prompt || '探索发现',
      imageUrl: image.url,
      keyPoints,
      chartType: index === 0 ? 'bar' : index === 1 ? 'line' : 'pie',
      searchQuery: image.prompt?.split(/[,，、\s]+/).slice(0, 3).join(' ') || undefined
    };
  });

  const plan: WebStructurePlan = {
    theme: theme_style,
    colorScheme: getColorScheme(theme_style),
    chapters,
    overallNarrative: narrative_approach,
    interactionTypes: interaction_preferences.length > 0
      ? interaction_preferences
      : ['tabs', 'counters', 'charts', 'timeline']
  };

  // 更新状态
  state.structurePlan = plan;

  // 发送事件
  await sendEvent({
    type: 'structure_planned',
    plan
  });

  return {
    success: true,
    data: {
      chaptersCount: chapters.length,
      theme: theme_style,
      interactions: plan.interactionTypes
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
    '简约现代': ['#2c3e50', '#34495e', '#ecf0f1', '#3498db', '#e74c3c']
  };

  return schemes[theme] || schemes['简约现代'];
}

// 3. 网络搜索
export const handleWebSearch: ToolHandler = async (params, state, sendEvent) => {
  const { query, search_type, chapter_index } = params;

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
    chapter: chapter_index ?? -1
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

    // 更新章节的搜索结果
    if (chapter_index !== undefined && state.structurePlan?.chapters[chapter_index]) {
      state.structurePlan.chapters[chapter_index].searchResults = summary;
    }

    // 添加到收集的材料
    state.collectedMaterials.push(`【搜索: ${query}】\n${summary}`);

    // 发送搜索结果事件
    await sendEvent({
      type: 'search_result',
      chapter: chapter_index ?? -1,
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
    console.error('[Scrollytelling Agent] Search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '搜索失败'
    };
  }
};

// 4. 生成图表数据
export const handleGenerateChartData: ToolHandler = async (params, state, sendEvent) => {
  const { chapter_index, chart_type, data_description, data_points } = params;

  // 生成 ECharts 配置
  const chartConfig = generateEChartsConfig(chart_type, data_description, data_points);

  // 更新章节
  if (state.structurePlan?.chapters[chapter_index]) {
    state.structurePlan.chapters[chapter_index].chartType = chart_type;
    state.structurePlan.chapters[chapter_index].chartData = chartConfig;
  }

  // 发送事件
  await sendEvent({
    type: 'data_generated',
    chapter: chapter_index,
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
      textStyle: { fontSize: 14 }
    }
  };

  switch (chartType) {
    case 'bar':
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: labels },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: values,
          itemStyle: { borderRadius: [4, 4, 0, 0] }
        }]
      };

    case 'line':
      return {
        ...baseConfig,
        xAxis: { type: 'category', data: labels },
        yAxis: { type: 'value' },
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
          label: { show: true, formatter: '{b}: {d}%' }
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

// 5. 最终化提示词
export const handleFinalizePrompt: ToolHandler = async (params, state, sendEvent) => {
  const { additional_requirements = [], special_effects = [] } = params;

  if (!state.structurePlan) {
    return {
      success: false,
      error: '请先调用 plan_structure 规划网页结构'
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

  return {
    success: true,
    data: {
      promptLength: finalPrompt.length,
      chaptersCount: state.structurePlan.chapters.length,
      materialsCount: state.collectedMaterials.length
    }
  };
};

// 构建最终提示词
function buildFinalPrompt(
  state: ScrollytellingAgentState,
  additionalRequirements: string[],
  specialEffects: string[]
): string {
  const plan = state.structurePlan!;

  // 从图片提示词中提取风格关键词
  const allPrompts = state.images.map(img => img.prompt || '').join(' ').toLowerCase();
  const isHandDrawn = /手绘|插画|卡通|水彩|涂鸦|漫画|可爱|温馨/.test(allPrompts);
  const isTech = /科技|数据|未来|数字|AI|智能/.test(allPrompts);
  const isNature = /自然|风景|户外|山|海|森林|花/.test(allPrompts);

  // 根据图片风格推荐配色和设计风格
  let styleGuide = '';
  if (isHandDrawn) {
    styleGuide = `
**⚠️ 检测到手绘/插画风格图片，请使用温馨可爱的设计：**
- 配色：柔和的粉色、米色、浅蓝、薄荷绿等
- 字体：圆润可爱的字体风格
- 边框：圆角、手绘风格边框
- 背景：纯色或渐变，不要深色商务风
- 整体氛围：温馨、活泼、有亲和力`;
  } else if (isTech) {
    styleGuide = `
**检测到科技风格图片，请使用科技感设计：**
- 配色：深蓝、霓虹色、渐变色
- 字体：现代无衬线字体
- 特效：发光、粒子、网格线`;
  } else if (isNature) {
    styleGuide = `
**检测到自然风格图片，请使用自然清新设计：**
- 配色：绿色系、大地色、天空蓝
- 字体：优雅简洁
- 氛围：清新、舒适、放松`;
  }

  let prompt = `请创建一个【${plan.theme}】风格的高端沉浸式一镜到底交互网页。

${styleGuide}

## 图片使用说明

提供的图片是**参考素材**，帮助你理解内容主题和风格：
- 你可以自由决定是否在网页中展示图片
- 如果展示图片，由你决定最合理的展示方式
- 图片放置位置和大小由你根据整体设计来决定

## 整体设计

**叙事方式**: ${plan.overallNarrative}
**配色方案**: ${plan.colorScheme.join(', ')}
**交互类型**: ${plan.interactionTypes.join(', ')}

## 章节详情（共 ${plan.chapters.length} 章，每章内容要丰富！）

`;

  // 添加每个章节的详细信息
  for (let i = 0; i < plan.chapters.length; i++) {
    const chapter = plan.chapters[i];
    const imagePrompt = state.images[i]?.prompt || '';

    prompt += `### 第 ${i + 1} 章: ${chapter.title}

**🖼️ 图片信息**:
- URL: ${chapter.imageUrl}
- 原始描述: ${imagePrompt}
- **展示要求**: 必须用 <img> 标签清晰展示此图片！

**副标题**: ${chapter.subtitle || ''}
**关键数据点**: ${chapter.keyPoints.join('、')}
`;

    if (chapter.searchResults) {
      prompt += `
**📚 扩展资料（必须全部融入内容）**:
${chapter.searchResults}
`;
    }

    if (chapter.chartData) {
      prompt += `
**📊 图表配置** (${chapter.chartType}类型):
\`\`\`json
${JSON.stringify(chapter.chartData, null, 2)}
\`\`\`
`;
    }

    prompt += `
**本章内容要求**:
- 至少 300 字的详细说明（包含背景、分析、趋势）
- 3-5 个数据卡片（带计数动画）
- 1 个 ECharts 图表
- 融入所有搜索到的资料

---

`;
  }

  // 添加收集的材料
  if (state.collectedMaterials.length > 0) {
    prompt += `## 📝 补充材料（必须全部使用！）

${state.collectedMaterials.join('\n\n')}

`;
  }

  // 添加技术要求
  prompt += `## 技术要求

1. **CDN引入**（放在 </body> 之前）:
\`\`\`html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

2. **禁止使用**: Lenis、Locomotive Scroll（只用 GSAP + ECharts）

3. **必须包含的交互元素**:
   - 数据卡片（带计数动画，使用 GSAP）
   - ECharts 图表（随滚动触发动画）
   - Tab 切换面板
   - 时间线组件
   - 滚动视差效果（图片和内容）
   - Pin 固定场景效果

4. **特殊效果**: ${specialEffects.length > 0 ? specialEffects.join('、') : '视差滚动、数字滚动计数、图表入场动画'}

5. **额外要求**: ${additionalRequirements.length > 0 ? additionalRequirements.join('；') : '确保移动端适配'}

## ⚠️ 内容丰富度要求（最重要！）

**每个章节必须包含：**
- 300+ 字的详细说明内容
- 3-5 个数据卡片（带 GSAP 计数动画）
- 1 个 ECharts 图表（带滚动触发动画）
- 融入所有提供的搜索资料

**整体网页必须包含：**
- 视差滚动效果
- Pin 固定场景
- Tab 切换面板
- 时间线组件

## 输出格式

直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 内容必须丰富、详细、有深度！每章至少 300 字！必须使用所有搜索资料！**`;

  return prompt;
}

// 工具处理器映射
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  analyze_images: handleAnalyzeImages,
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
    console.error(`[Scrollytelling Agent] Tool ${toolName} error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '工具执行失败'
    };
  }
}
