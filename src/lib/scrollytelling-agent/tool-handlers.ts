// Scrollytelling 动效网站 Agent 工具处理器

import {
  ImageInfo,
  PresentationPlan,
  SlidePlan,
  SlideImageConfig,
  ToolResult,
  ScrollytellingStreamEvent,
  ScrollytellingAgentState,
  DeepResearchResult
} from './types';

// 导入 HyprLab 深度研究
import {
  callHyprLabDeepResearch,
  type ResearchProgressEvent,
  type FullResearchResult
} from '@/lib/super-agent/hyprlab-research';

// 工具处理器类型
type ToolHandler = (
  params: Record<string, any>,
  state: ScrollytellingAgentState,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
) => Promise<ToolResult>;

// 0. 深度研究（无图片时必须调用）- 使用 HyprLab sonar-deep-research
export const handleDeepResearch: ToolHandler = async (params, state, sendEvent) => {
  const { topic, research_focus = [], style_preferences } = params;
  const startTime = Date.now();

  // 检查 HyprLab API Key
  const hyprLabApiKey = process.env.HYPRLAB_API_KEY;
  if (!hyprLabApiKey) {
    return {
      success: false,
      error: 'HYPRLAB_API_KEY 未配置，无法进行深度研究'
    };
  }

  // 构建研究主题（包含研究重点）
  let researchTopic = topic;
  if (research_focus.length > 0) {
    researchTopic += `\n\n研究重点：${research_focus.join('、')}`;
  }
  if (style_preferences) {
    researchTopic += `\n\n期望的视觉风格：${style_preferences}`;
  }

  // 系统提示词 - 针对网站设计研究
  const systemPrompt = `你是一个专业的主题研究助手，专门为 Scrollytelling 动效网站提供深度研究。

请针对用户提供的主题进行全面研究，重点关注：
1. 主题背景和核心概念
2. 关键数据和统计（用于数据可视化）
3. 最新趋势和发展动态
4. 典型案例和最佳实践
5. 适合的视觉风格和配色建议

请用中文回复，提供结构化的研究报告。`;

  // 发送开始事件
  await sendEvent({
    type: 'thought',
    iteration: state.iteration,
    content: `🔬 开始深度研究: "${topic}" (预计 3-7 分钟)...`
  });

  // 进度回调 - 转发到 SSE
  const onProgress = async (event: ResearchProgressEvent) => {
    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: event.message
    });
  };

  try {
    // 使用 HyprLab 深度研究 - medium 级别（3-7分钟）
    // 使用新接口获取完整数据（包括 search_results 和 citations）
    const result = await callHyprLabDeepResearch(researchTopic, {
      reasoningEffort: 'medium',
      onProgress,
      systemPrompt,
      includeRawResponse: true
    }) as FullResearchResult;

    const { response, parsed } = result;
    const researchDuration = Math.round((Date.now() - startTime) / 1000);

    // 从研究内容中提取关键信息
    const keyFindings: string[] = [];
    const dataPoints: string[] = [];

    // 简单提取关键发现（按段落）
    const paragraphs = parsed.content.split('\n\n').filter(p => p.trim().length > 50);
    keyFindings.push(...paragraphs.slice(0, 8).map(p => p.slice(0, 300)));

    // 提取数据点（数字、百分比等）
    const numbers = parsed.content.match(/\d+[\d,.]*[%万亿美元元人民币]+|\d{4}年|\d+%|\d+亿|\d+万/g);
    if (numbers) {
      dataPoints.push(...[...new Set(numbers)].slice(0, 15));
    }

    // 构建研究结果 - 包含完整的 citations 和 search_results
    const deepResearchResult: DeepResearchResult = {
      topic,
      summary: parsed.content,
      keyFindings,
      dataPoints,
      designSuggestions: [
        `基于 "${topic}" 主题的深度研究，建议使用简洁现代的 Tailwind CSS 风格`,
        '利用研究数据创建简洁的数据展示卡片',
        '使用纯 CSS 动画和 Intersection Observer 实现入场效果',
        '保持简洁流畅，避免复杂动效影响性能',
        '为关键内容添加可点击的参考来源链接'
      ],
      colorRecommendations: style_preferences?.includes('科技')
        ? ['#0f172a', '#1e293b', '#0066ff', '#00d4ff']
        : ['#0f172a', '#1e293b', '#667eea', '#764ba2'],
      visualStyle: style_preferences || '现代科技 + 数据驱动',
      researchDuration,
      // 新增：完整的引用和搜索结果
      citations: parsed.citations,
      searchResults: parsed.searchResults.map(sr => ({
        title: sr.title,
        url: sr.url,
        snippet: sr.snippet,
        source: sr.source
      })),
      searchQueriesCount: parsed.meta.searchQueriesCount
    };

    // 更新状态
    state.deepResearch = deepResearchResult;
    state.collectedMaterials.push(`【深度研究: ${topic}】\n${parsed.content.slice(0, 3000)}`);

    // 添加引用来源（为 Gemini 提供）
    if (parsed.citations.length > 0) {
      state.collectedMaterials.push(`【参考来源 (${parsed.citations.length} 个)】\n${parsed.citations.slice(0, 20).join('\n')}`);
    }

    // 添加搜索结果详情（为 Gemini 提供带标题的链接）
    if (parsed.searchResults.length > 0) {
      const searchResultsText = parsed.searchResults.slice(0, 15).map((sr, i) =>
        `${i + 1}. [${sr.title}](${sr.url})\n   ${sr.snippet?.slice(0, 150) || ''}`
      ).join('\n\n');
      state.collectedMaterials.push(`【搜索结果详情】\n${searchResultsText}`);
    }

    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: `✅ 深度研究完成！耗时 ${researchDuration} 秒，获得 ${parsed.citations.length} 个引用来源，${parsed.searchResults.length} 个搜索结果`
    });

    return {
      success: true,
      data: {
        topic,
        researchDuration,
        citationsCount: parsed.citations.length,
        searchResultsCount: parsed.searchResults.length,
        searchQueriesCount: parsed.meta.searchQueriesCount,
        keyFindingsCount: keyFindings.length,
        dataPointsCount: dataPoints.length,
        summary: parsed.content.slice(0, 800) + '...',
        designSuggestions: deepResearchResult.designSuggestions,
        colorRecommendations: deepResearchResult.colorRecommendations,
        message: `深度研究完成，耗时 ${researchDuration} 秒，获得 ${parsed.citations.length} 个引用来源和 ${parsed.searchResults.length} 个搜索结果。现在请调用 plan_structure 规划网站结构。`
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '深度研究失败';
    console.error('[Deep Research] Error:', error);

    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: `❌ 深度研究失败: ${errorMessage}`
    });

    return {
      success: false,
      error: errorMessage
    };
  }
};

// 1. 规划结构（包含 section 和生图提示词）
export const handlePlanStructure: ToolHandler = async (params, state, sendEvent) => {
  const {
    theme_style,
    narrative_approach,
    global_transition = 'slide',
    slides: slidesInput,
    interaction_preferences = []
  } = params;

  // 发送开始处理的心跳
  await sendEvent({
    type: 'thought',
    iteration: state.iteration,
    content: `📐 正在规划网站结构: ${theme_style} 风格, ${slidesInput?.length || 0} 个 section...`
  });

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
      title: slide.title || `Section ${index + 1}`,
      subtitle: slide.subtitle,
      layout: slide.layout || 'content',
      imageConfig,
      keyPoints: slide.key_points || [],
      chartType: slide.chart_type !== 'none' ? slide.chart_type : undefined,
      // GSAP ScrollTrigger 动画配置
      scrollAnimation: slide.scroll_animation || 'fade-in',
      pinSection: slide.pin_section || false,
      scrub: slide.scrub || false,
      backgroundColor: slide.background_color,
      backgroundGradient: slide.background_gradient,
      textAnimations: slide.text_animations || [],
      specialEffects: slide.special_effects || [],
      searchQuery: slide.key_points?.[0]
    };
  });

  // 如果没有规划 section，基于参考图片数量创建默认结构
  if (slides.length === 0) {
    const defaultSlideCount = Math.max(5, state.images.length + 2);
    for (let i = 0; i < defaultSlideCount; i++) {
      slides.push({
        title: i === 0 ? 'Hero' : i === defaultSlideCount - 1 ? 'CTA' : `Section ${i}`,
        layout: i === 0 ? 'hero' : i === defaultSlideCount - 1 ? 'cta' : 'image-left',
        keyPoints: ['待补充'],
        scrollAnimation: i === 0 ? 'fade-in' : 'slide-up',
        pinSection: i === 1,  // 第二个 section 默认 pin
        scrub: i > 0 && i < defaultSlideCount - 1,
        specialEffects: i === 0 ? ['letter-animation'] : ['parallax-image']
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
      : ['tabs', 'counters', 'charts', 'progress-bars', 'r-stack'],
    globalTransition: global_transition,
    transitions: global_transition  // 向后兼容
  };

  // 更新状态
  state.structurePlan = plan;

  // 发送事件
  await sendEvent({
    type: 'structure_planned',
    plan
  });

  // 统计需要生成的图片数量和动画类型
  const imageCount = slides.filter(s => s.imageConfig).length;
  const pinCount = slides.filter(s => s.pinSection).length;
  const scrubCount = slides.filter(s => s.scrub).length;

  return {
    success: true,
    data: {
      sectionsCount: slides.length,
      imagePromptCount: imageCount,
      pinSections: pinCount,
      scrubSections: scrubCount,
      theme: theme_style,
      globalTransition: global_transition,
      interactions: plan.interactionTypes,
      message: `已规划 ${slides.length} 个 Section，${imageCount} 张需 AI 生图，${pinCount} 个 Pin 效果，${scrubCount} 个 Scrub 同步`
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

  // 发送开始处理的心跳
  await sendEvent({
    type: 'thought',
    iteration: state.iteration,
    content: `📝 正在整合所有材料生成最终提示词 (${state.structurePlan.slides.length} sections, ${state.collectedMaterials.length} materials)...`
  });

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

// 构建最终提示词（用于 Gemini 生成简洁美观的研究展示网站）
function buildFinalPrompt(
  state: ScrollytellingAgentState,
  additionalRequirements: string[],
  specialEffects: string[]
): string {
  const plan = state.structurePlan!;

  let prompt = `请创建一个【${plan.theme}】风格的 **简洁美观的研究展示网站**。

## ⚠️ 性能第一原则（必须遵守！）

**禁止使用（会导致卡顿）：**
- ❌ GSAP / ScrollTrigger / Lenis
- ❌ Canvas 动画（Matrix Rain、粒子效果等）
- ❌ setInterval / setTimeout 持续动画
- ❌ 复杂视差效果

**只使用（轻量高效）：**
- ✅ Tailwind CSS
- ✅ 纯 CSS 动画（transition、animation）
- ✅ Intersection Observer（入场动画）
- ✅ Lucide Icons
- ✅ ECharts（可选，最多1个图表）

## 整体设计

**叙事方式**: ${plan.overallNarrative}
**配色方案**: ${plan.colorScheme.join(', ')}
**设计风格**: 简洁现代、深色主题、高端专业
**交互类型**: 悬浮效果、入场动画

## 技术栈（仅使用这些 CDN）

\`\`\`html
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
</head>
\`\`\`

## CSS 动画方案

\`\`\`css
/* 入场动画 */
.fade-up {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade-up.visible {
  opacity: 1;
  transform: translateY(0);
}

/* 延迟类 */
.delay-100 { transition-delay: 0.1s; }
.delay-200 { transition-delay: 0.2s; }
.delay-300 { transition-delay: 0.3s; }

/* 悬浮效果 */
.hover-lift {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.15);
}
\`\`\`

## JavaScript（简洁高效）

\`\`\`javascript
// 入场动画（Intersection Observer）
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// Lucide 图标初始化
lucide.createIcons();
\`\`\`

## Section 详情（共 ${plan.slides.length} 个）

`;

  // 添加每张幻灯片的详细信息
  for (let i = 0; i < plan.slides.length; i++) {
    const slide = plan.slides[i];

    prompt += `### Section ${i + 1}: ${slide.title}

**布局**: ${slide.layout}
**关键内容**: ${slide.keyPoints.join('、')}
`;

    // 样式配置（简洁版）
    const styleInfo: string[] = [];
    if (slide.backgroundColor) {
      styleInfo.push(`🎨 **背景色**: ${slide.backgroundColor}`);
    }
    if (slide.backgroundGradient) {
      styleInfo.push(`🌈 **背景渐变**: ${slide.backgroundGradient}`);
    }

    if (styleInfo.length > 0) {
      prompt += `
${styleInfo.join('\n')}
`;
    }

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

  // 添加技术要求（简洁版）
  prompt += `## 技术要求

1. **技术栈**：Tailwind CSS + 纯 CSS 动画 + Lucide Icons

2. **CDN 引入**:
\`\`\`html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

3. **全局样式**:
\`\`\`css
/* 基础 */
body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: #0f172a;
  color: #f8fafc;
}

/* 入场动画 */
.fade-up {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade-up.visible {
  opacity: 1;
  transform: translateY(0);
}

/* 延迟 */
.delay-100 { transition-delay: 0.1s; }
.delay-200 { transition-delay: 0.2s; }

/* 悬浮 */
.hover-lift {
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.15);
}

/* 渐变文字 */
.gradient-text {
  background: linear-gradient(135deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
\`\`\`

4. **JavaScript（简洁高效）**:
\`\`\`javascript
// Intersection Observer 入场动画
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// Lucide 图标
lucide.createIcons();
\`\`\`

5. **设计规范**:
   - 深色主题：bg-slate-900, bg-slate-800
   - 圆角卡片：rounded-xl
   - 毛玻璃：backdrop-blur-md bg-white/5
   - 适当留白：py-16 px-8
   - 响应式：md:grid-cols-2 lg:grid-cols-3

6. **交互效果**:
   - ✅ 滚动入场动画（fade-up）
   - ✅ 卡片悬浮效果（hover-lift）
   - ✅ 链接悬浮变色
   - ✅ 图片悬浮放大

## 输出格式

直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 图片占位符**：{{IMAGE_0}}、{{IMAGE_1}} 等会被替换为真实图片 URL

**⚠️ 核心要求**：
1. **简洁流畅** - 不要复杂动效，追求性能
2. **深色高端** - 专业研究风格
3. **可点击引用** - 参考来源都要有链接
4. **响应式** - 移动端友好`;

  return prompt;
}

// 工具处理器映射
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  deep_research: handleDeepResearch,
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
