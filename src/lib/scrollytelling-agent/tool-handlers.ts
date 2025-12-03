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
    global_transition = 'slide',
    slides: slidesInput,
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
      // reveal.js 高级动画配置
      autoAnimate: slide.auto_animate || false,
      transition: slide.transition,
      transitionSpeed: slide.transition_speed,
      backgroundColor: slide.background_color,
      backgroundGradient: slide.background_gradient,
      fragments: slide.fragments || [],
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
        autoAnimate: i > 0 && i < defaultSlideCount - 1,  // 中间幻灯片默认使用 auto-animate
        transition: i === 0 ? 'zoom' : i === defaultSlideCount - 1 ? 'fade' : undefined,
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
  const autoAnimateCount = slides.filter(s => s.autoAnimate).length;
  const fragmentCount = slides.filter(s => s.fragments && s.fragments.length > 0).length;

  return {
    success: true,
    data: {
      slidesCount: slides.length,
      imagePromptCount: imageCount,
      autoAnimateSlides: autoAnimateCount,
      fragmentSlides: fragmentCount,
      theme: theme_style,
      globalTransition: global_transition,
      interactions: plan.interactionTypes,
      message: `已规划 ${slides.length} 张幻灯片，${imageCount} 张需 AI 生图，${autoAnimateCount} 张使用 auto-animate`
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

  let prompt = `请创建一个【${plan.theme}】风格的高端 reveal.js 演示文稿，必须充分使用高级动画特性！

## 整体设计

**叙事方式**: ${plan.overallNarrative}
**配色方案**: ${plan.colorScheme.join(', ')}
**全局过渡**: ${plan.globalTransition}
**交互类型**: ${plan.interactionTypes.join(', ')}

## ⚠️ 必须使用的 reveal.js 高级特性

### 1. Auto-Animate（自动动画）
在相邻 section 添加 \`data-auto-animate\` 属性，元素会自动平滑过渡：
\`\`\`html
<section data-auto-animate>
  <h1>标题</h1>
</section>
<section data-auto-animate>
  <h1 style="color: #3b82f6; margin-top: 100px;">标题</h1>
  <p>新内容</p>
</section>
\`\`\`

### 2. Fragments（片段动画）
使用 \`class="fragment"\` 逐步揭示内容：
- \`fragment fade-up\` - 上滑淡入
- \`fragment grow\` - 放大
- \`fragment highlight-blue\` - 蓝色高亮
- \`fragment fade-in-then-out\` - 先淡入再淡出
- \`data-fragment-index="1"\` - 控制显示顺序

### 3. r-stack（堆叠层）
同位置切换多个元素：
\`\`\`html
<div class="r-stack">
  <img class="fragment fade-in-then-out" src="a.png">
  <img class="fragment" src="b.png">
</div>
\`\`\`

### 4. 过渡效果
- \`data-transition="zoom"\` - 缩放
- \`data-transition="slide-in fade-out"\` - 混合过渡
- \`data-transition-speed="fast"\` - 速度控制
- \`data-background-transition="zoom"\` - 背景过渡

## 幻灯片详情（共 ${plan.slides.length} 张）

`;

  // 添加每张幻灯片的详细信息
  for (let i = 0; i < plan.slides.length; i++) {
    const slide = plan.slides[i];

    prompt += `### 幻灯片 ${i + 1}: ${slide.title}

**布局**: ${slide.layout}
**关键内容**: ${slide.keyPoints.join('、')}
`;

    // 动画配置
    const animationInfo: string[] = [];
    if (slide.autoAnimate) {
      animationInfo.push('✨ **使用 data-auto-animate** - 与下一张幻灯片平滑过渡');
    }
    if (slide.transition) {
      animationInfo.push(`🎬 **过渡效果**: ${slide.transition}`);
    }
    if (slide.transitionSpeed) {
      animationInfo.push(`⚡ **过渡速度**: ${slide.transitionSpeed}`);
    }
    if (slide.backgroundColor) {
      animationInfo.push(`🎨 **背景色**: ${slide.backgroundColor}`);
    }
    if (slide.backgroundGradient) {
      animationInfo.push(`🌈 **背景渐变**: ${slide.backgroundGradient}`);
    }
    if (slide.fragments && slide.fragments.length > 0) {
      const fragmentDesc = slide.fragments.map(f =>
        `${f.element}: ${f.effect}${f.order !== undefined ? ` (顺序${f.order})` : ''}`
      ).join(', ');
      animationInfo.push(`📍 **Fragments**: ${fragmentDesc}`);
    }
    if (slide.animations && slide.animations.length > 0) {
      animationInfo.push(`💫 **其他动画**: ${slide.animations.join('、')}`);
    }

    if (animationInfo.length > 0) {
      prompt += `
**动画配置**:
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

1. **使用 reveal.js 框架**，全局过渡设为 \`${plan.globalTransition}\`

2. **CDN 引入**:
\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/theme/black.min.css">
<script src="https://cdn.jsdelivr.net/npm/reveal.js@4.6.1/dist/reveal.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

3. **Reveal.initialize 配置**:
\`\`\`javascript
Reveal.initialize({
  hash: true,
  transition: '${plan.globalTransition}',
  backgroundTransition: 'fade',
  transitionSpeed: 'default',
  // 启用鼠标滚轮切换（重要！）
  mouseWheel: true,
  // 隐藏左右箭头导航
  controls: false,
  // 启用所有高级特性
  autoAnimate: true,
  autoAnimateDuration: 1.0,
  autoAnimateEasing: 'ease-in-out',
  fragments: true,
  // 内容居中
  center: true,
  // 禁用幻灯片缩放以防内容溢出
  width: '100%',
  height: '100%',
  margin: 0.1,
  minScale: 0.2,
  maxScale: 1.0
});
\`\`\`

4. **⚠️ 防止内容溢出的 CSS（必须添加！）**:
\`\`\`css
.reveal .slides section {
  height: 100%;
  overflow: hidden;
  padding: 20px 40px;
  box-sizing: border-box;
}
.reveal .slides section > * {
  max-height: 100%;
}
/* 限制图片大小 */
.reveal .slides img {
  max-width: 45%;
  max-height: 50vh;
  object-fit: contain;
}
/* 限制图表容器 */
.chart-container {
  max-height: 40vh;
  width: 100%;
}
/* 列表不要太长 */
.reveal ul, .reveal ol {
  max-height: 60vh;
  overflow-y: auto;
}
/* 数据卡片紧凑布局 */
.data-card {
  padding: 15px;
  margin: 10px;
}
\`\`\`

5. **必须实现的高级效果**:
   - ✅ Auto-Animate 平滑过渡（连续幻灯片之间）
   - ✅ Fragments 逐步揭示（列表、要点）
   - ✅ r-stack 层叠切换（图片对比）
   - ✅ 数字滚动计数动画
   - ✅ ECharts 图表入场动画
   - ✅ 进度条动画

6. **Fragment 动画最佳实践**:
   - 列表项使用 \`fragment fade-up\`
   - 重要数据使用 \`fragment grow\` 或 \`fragment highlight-blue\`
   - 对比内容使用 \`fragment fade-in-then-out\`

7. **⚠️ 布局约束（防止内容溢出！）**:
   - 每张幻灯片内容必须在一屏内显示完
   - 图片最大宽度 45%，最大高度 50vh
   - 图表容器最大高度 40vh
   - 列表最多显示 5-6 项，超过的分到下一张幻灯片
   - 使用 flexbox 或 grid 布局，设置 gap 而非 margin
   - 文字大小：标题 2-3em，正文 1-1.2em，数据 1.5-2em

8. **特殊效果**: ${specialEffects.length > 0 ? specialEffects.join('、') : 'auto-animate 元素位移、数字滚动、图表渐入'}

9. **额外要求**: ${additionalRequirements.length > 0 ? additionalRequirements.join('；') : '确保动画丝滑流畅，内容不溢出'}

## 输出格式

直接输出完整的 HTML 代码，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 图片占位符说明**：
- 代码中的 {{IMAGE_0}}、{{IMAGE_1}} 等占位符会在后续被替换为真实的 AI 生成图片 URL
- 请确保正确使用这些占位符

**⚠️ 核心要求**：
1. **鼠标滚轮切换** - 必须启用 mouseWheel: true
2. **内容不溢出** - 所有内容必须在一屏内显示，使用上面的 CSS 约束
3. **丝滑动画** - 大量使用 auto-animate + fragments
4. **隐藏箭头** - controls: false，只用滚轮切换`;

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
