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
  parseHyprLabResponse,
  type ReasoningEffort,
  type ResearchProgressEvent
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
    const response = await callHyprLabDeepResearch(
      researchTopic,
      'medium' as ReasoningEffort,
      onProgress,
      systemPrompt
    );

    const parsed = parseHyprLabResponse(response);
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

    // 构建研究结果
    const deepResearchResult: DeepResearchResult = {
      topic,
      summary: parsed.content,
      keyFindings,
      dataPoints,
      designSuggestions: [
        `基于 "${topic}" 主题的深度研究，建议使用现代化设计风格`,
        '利用研究数据创建数据可视化卡片',
        '使用 GSAP ScrollTrigger 实现滚动叙事',
        '添加视差效果和文字入场动画增强体验'
      ],
      colorRecommendations: style_preferences?.includes('科技')
        ? ['#0f172a', '#1e293b', '#0066ff', '#00d4ff']
        : ['#0f172a', '#1e293b', '#667eea', '#764ba2'],
      visualStyle: style_preferences || '现代科技 + 数据驱动',
      researchDuration
    };

    // 更新状态
    state.deepResearch = deepResearchResult;
    state.collectedMaterials.push(`【深度研究: ${topic}】\n${parsed.content.slice(0, 3000)}`);

    // 添加引用来源
    if (parsed.citations.length > 0) {
      state.collectedMaterials.push(`【参考来源】\n${parsed.citations.slice(0, 10).join('\n')}`);
    }

    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: `✅ 深度研究完成！耗时 ${researchDuration} 秒，获得 ${parsed.citations.length} 个引用来源`
    });

    return {
      success: true,
      data: {
        topic,
        researchDuration,
        citationsCount: parsed.citations.length,
        searchQueriesCount: parsed.meta.searchQueriesCount,
        keyFindingsCount: keyFindings.length,
        dataPointsCount: dataPoints.length,
        summary: parsed.content.slice(0, 800) + '...',
        designSuggestions: deepResearchResult.designSuggestions,
        colorRecommendations: deepResearchResult.colorRecommendations,
        message: `深度研究完成，耗时 ${researchDuration} 秒，获得 ${parsed.citations.length} 个来源。现在请调用 plan_structure 规划网站结构。`
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

// 构建最终提示词（用于 Gemini 生成 Scrollytelling 动效网站）
function buildFinalPrompt(
  state: ScrollytellingAgentState,
  additionalRequirements: string[],
  specialEffects: string[]
): string {
  const plan = state.structurePlan!;

  let prompt = `请创建一个【${plan.theme}】风格的 **Awwwards 级别 Scrollytelling 动效网站**，必须充分使用 GSAP ScrollTrigger 实现丝滑动画！

## 整体设计

**叙事方式**: ${plan.overallNarrative}
**配色方案**: ${plan.colorScheme.join(', ')}
**设计风格**: Linear + Swiss Modern 极简高端风格
**交互类型**: ${plan.interactionTypes.join(', ')}

## ⚠️ 必须使用的核心技术

### 1. GSAP ScrollTrigger - 滚动触发动画（核心！）
\`\`\`javascript
// 元素入场动画
gsap.from(".element", {
  scrollTrigger: {
    trigger: ".element",
    start: "top 80%",
    end: "top 20%",
    scrub: true
  },
  y: 100,
  opacity: 0,
  duration: 1
});

// Pin 固定效果
ScrollTrigger.create({
  trigger: ".section",
  start: "top top",
  end: "+=100%",
  pin: true,
  scrub: 1
});

// 时间线编排
let tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".container",
    start: "top top",
    end: "+=200%",
    scrub: 1,
    pin: true
  }
});
tl.from(".title", { y: 100, opacity: 0 })
  .from(".content", { y: 50, opacity: 0 }, "-=0.5");
\`\`\`

### 2. 文字动画
- 标题逐字入场：\`stagger: 0.05\`
- 段落逐行显现
- 渐变文字效果

### 3. 图片效果
- 视差滚动：\`y: "-30%"\`
- 缩放揭示：\`clipPath + scale\`
- 悬停放大

### 4. 现代 CSS 效果
- 毛玻璃：\`backdrop-filter: blur(20px)\`
- 渐变文字：\`background-clip: text\`
- 发光效果：\`box-shadow: 0 0 60px\`
- 流动渐变背景

## Section 详情（共 ${plan.slides.length} 个）

`;

  // 添加每张幻灯片的详细信息
  for (let i = 0; i < plan.slides.length; i++) {
    const slide = plan.slides[i];

    prompt += `### Section ${i + 1}: ${slide.title}

**布局**: ${slide.layout}
**关键内容**: ${slide.keyPoints.join('、')}
`;

    // 动画配置
    const animationInfo: string[] = [];
    if (slide.scrollAnimation) {
      animationInfo.push(`🎬 **入场动画**: ${slide.scrollAnimation}`);
    }
    if (slide.pinSection) {
      animationInfo.push('📌 **Pin 固定** - 滚动时固定此 section');
    }
    if (slide.scrub) {
      animationInfo.push('🔄 **Scrub 同步** - 动画进度与滚动位置同步');
    }
    if (slide.backgroundColor) {
      animationInfo.push(`🎨 **背景色**: ${slide.backgroundColor}`);
    }
    if (slide.backgroundGradient) {
      animationInfo.push(`🌈 **背景渐变**: ${slide.backgroundGradient}`);
    }
    if (slide.textAnimations && slide.textAnimations.length > 0) {
      const textAnimDesc = slide.textAnimations.map(t =>
        `${t.element}: ${t.effect}${t.stagger ? ` (stagger: ${t.stagger}s)` : ''}`
      ).join(', ');
      animationInfo.push(`✨ **文字动画**: ${textAnimDesc}`);
    }
    if (slide.specialEffects && slide.specialEffects.length > 0) {
      animationInfo.push(`💫 **特殊效果**: ${slide.specialEffects.join('、')}`);
    }

    if (animationInfo.length > 0) {
      prompt += `
**GSAP 动画配置**:
${animationInfo.join('\n')}
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

  // 添加技术要求
  prompt += `## 技术要求

1. **技术栈**：纯 HTML + CSS + JavaScript，使用 GSAP ScrollTrigger

2. **CDN 引入（必须！）**:
\`\`\`html
<!-- GSAP 核心 + ScrollTrigger -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>
<!-- ECharts（如需图表） -->
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<!-- 平滑滚动（可选但推荐） -->
<script src="https://cdn.jsdelivr.net/npm/lenis@1.0.45/dist/lenis.min.js"></script>
\`\`\`

3. **GSAP 初始化（⚠️ 必须！）**:
\`\`\`javascript
// 注册插件
gsap.registerPlugin(ScrollTrigger);

// 可选：平滑滚动
const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
\`\`\`

4. **全局样式（必须完整添加！）**:
\`\`\`css
/* 基础重置 */
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0f172a;
  color: #f8fafc;
  overflow-x: hidden;
}

/* Section 全屏 */
section {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5vh 8vw;
  position: relative;
  overflow: hidden;
}

/* 毛玻璃效果 */
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

/* 渐变文字 */
.gradient-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 发光效果 */
.glow {
  box-shadow: 0 0 60px rgba(102, 126, 234, 0.4);
}

/* 流动渐变背景 */
@keyframes gradient-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.flowing-bg {
  background: linear-gradient(-45deg, #0f172a, #1e293b, #0066ff20, #8b5cf620);
  background-size: 400% 400%;
  animation: gradient-flow 15s ease infinite;
}

/* 悬停效果 */
.hover-lift {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s ease;
}
.hover-lift:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

/* 图片容器 */
.img-container {
  overflow: hidden;
  border-radius: 12px;
}
.img-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.img-container:hover img {
  transform: scale(1.05);
}

/* 响应式 */
@media (max-width: 768px) {
  section { padding: 4vh 5vw; }
  h1 { font-size: 2.5rem !important; }
  h2 { font-size: 1.8rem !important; }
}
\`\`\`

5. **必须实现的动画效果**:
   - ✅ 标题逐字入场（stagger: 0.05）
   - ✅ 图片视差滚动（y: "-30%"）
   - ✅ 元素滚动入场（opacity + y 动画）
   - ✅ Pin 固定效果（关键 section）
   - ✅ 数字计数动画（snap: { textContent: 1 }）
   - ✅ 卡片错落入场（stagger）
   - ✅ 进度指示器

6. **动画代码模板**:
\`\`\`javascript
// Hero 标题入场
gsap.from(".hero-title span", {
  y: 100, opacity: 0, stagger: 0.05, duration: 1,
  ease: "power4.out", delay: 0.5
});

// 滚动触发入场
gsap.utils.toArray(".fade-in").forEach(el => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" },
    y: 60, opacity: 0, duration: 1, ease: "power3.out"
  });
});

// 图片视差
gsap.utils.toArray(".parallax-img").forEach(img => {
  gsap.to(img, {
    scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true },
    y: "-20%", ease: "none"
  });
});

// 数字计数
gsap.utils.toArray(".counter").forEach(el => {
  gsap.from(el, {
    scrollTrigger: { trigger: el, start: "top 80%" },
    textContent: 0, duration: 2, snap: { textContent: 1 }, ease: "power1.inOut"
  });
});
\`\`\`

7. **布局原则**:
   - 每个 section 高度 100vh
   - 内容居中，左右留白 8vw
   - 标题：4-6rem，副标题：1.5-2rem
   - 段落最大宽度：60ch
   - 图片最大高度：60vh
   - 卡片网格：grid-cols-1 md:grid-cols-2 lg:grid-cols-3

8. **特殊效果**: ${specialEffects.length > 0 ? specialEffects.join('、') : '视差滚动、文字动画、卡片入场、数字计数'}

9. **额外要求**: ${additionalRequirements.length > 0 ? additionalRequirements.join('；') : '动画丝滑流畅，60fps，无卡顿'}

## 输出格式

直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 图片占位符说明**：
- 代码中的 {{IMAGE_0}}、{{IMAGE_1}} 等占位符会在后续被替换为真实的 AI 生成图片 URL
- 请确保正确使用这些占位符

**⚠️ 核心要求（必须严格遵守！）**：
1. **必须使用 GSAP ScrollTrigger** - 这是实现动效的核心
2. **每个 section 都要有动画** - 入场、视差、或交互效果
3. **丝滑流畅** - 使用 scrub、ease、stagger 让动画更自然
4. **深色高端风格** - 深色背景 + 渐变 + 毛玻璃
5. **响应式设计** - 移动端也要好看`;

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
