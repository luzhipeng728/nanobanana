// Reveal.js 演示文稿 Agent ReAct 循环

import Anthropic from '@anthropic-ai/sdk';
import {
  ImageInfo,
  ScrollytellingAgentState,
  ScrollytellingStreamEvent,
  ScrollytellingFinalOutput,
  ScrollytellingAgentConfig,
  SlideImageConfig
} from './types';
import { formatToolsForClaude } from './tools';
import { executeToolCall } from './tool-handlers';
import { buildScrollytellingSystemPrompt } from './system-prompt';

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

// 获取基础 URL
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3004';
}

// 安全解析 JSON
function safeParseJSON(text: string): Record<string, any> | null {
  if (!text || text.trim() === '') {
    return {};
  }

  // 第1层：直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续
  }

  // 第2层：尝试修复常见问题后解析
  try {
    let fixed = text
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
    return JSON.parse(fixed);
  } catch {
    // 继续
  }

  // 第3层：提取 JSON 对象
  const jsonMatches = text.match(/\{[\s\S]*\}/g);
  if (jsonMatches) {
    for (const jsonStr of jsonMatches) {
      try {
        return JSON.parse(jsonStr);
      } catch {
        // 继续
      }
    }
  }

  console.warn('[Presentation Agent] Failed to parse JSON:', text.slice(0, 100));
  return {};
}

// 心跳保活间隔 - 15 秒，防止 SSE 连接超时
const HEARTBEAT_INTERVAL = 15000;

// ============================================
// 并发图片生成
// ============================================

interface ImageGenTask {
  slideIndex: number;
  prompt: string;
  aspectRatio: string;
  taskId?: string;
  imageUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

// 创建图片生成任务
async function createImageTask(
  prompt: string,
  aspectRatio: string,
  resolution: '1k' | '2k' | '4k' = '1k'
): Promise<string> {
  const response = await fetch(`${getBaseUrl()}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'nano-banana-pro',
      config: {
        aspectRatio: aspectRatio === '16:9' ? undefined : aspectRatio,
        resolution
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`创建图片任务失败: ${response.status}`);
  }

  const result = await response.json();
  if (!result.taskId) {
    throw new Error('未获取到任务 ID');
  }

  return result.taskId;
}

// 查询图片任务状态
async function queryImageTask(taskId: string): Promise<{ status: string; imageUrl?: string; error?: string }> {
  const response = await fetch(`${getBaseUrl()}/api/image-task?taskId=${taskId}`);
  if (!response.ok) {
    throw new Error(`查询任务状态失败: ${response.status}`);
  }
  return response.json();
}

// 并发生成所有图片
async function generateAllImages(
  imageConfigs: Array<{ slideIndex: number; config: SlideImageConfig }>,
  resolution: '1k' | '2k' | '4k',
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const tasks: ImageGenTask[] = imageConfigs.map(({ slideIndex, config }) => ({
    slideIndex,
    prompt: config.prompt,
    aspectRatio: config.aspectRatio,
    status: 'pending'
  }));

  if (tasks.length === 0) {
    return results;
  }

  // 发送开始事件
  await sendEvent({
    type: 'phase',
    phase: 'image_generation',
    message: `正在并发生成 ${tasks.length} 张 AI 图片...`
  });

  // 并发创建所有任务
  const createPromises = tasks.map(async (task) => {
    try {
      await sendEvent({
        type: 'image_gen_start',
        slideIndex: task.slideIndex,
        prompt: task.prompt.slice(0, 50) + '...'
      });

      task.taskId = await createImageTask(task.prompt, task.aspectRatio, resolution);
      task.status = 'processing';

      await sendEvent({
        type: 'image_gen_progress',
        slideIndex: task.slideIndex,
        status: `任务已创建: ${task.taskId}`
      });
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : '创建任务失败';

      await sendEvent({
        type: 'image_gen_error',
        slideIndex: task.slideIndex,
        error: task.error
      });
    }
  });

  await Promise.all(createPromises);

  // 轮询所有任务直到完成
  const maxWaitTime = 180000; // 3 分钟
  const pollInterval = 3000;  // 3 秒
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const pendingTasks = tasks.filter(t => t.status === 'processing' && t.taskId);
    if (pendingTasks.length === 0) break;

    // 并发查询所有处理中的任务
    const queryPromises = pendingTasks.map(async (task) => {
      try {
        const result = await queryImageTask(task.taskId!);

        if (result.status === 'completed' && result.imageUrl) {
          task.status = 'completed';
          task.imageUrl = result.imageUrl;
          results.set(task.slideIndex, result.imageUrl);

          await sendEvent({
            type: 'image_gen_complete',
            slideIndex: task.slideIndex,
            imageUrl: result.imageUrl
          });
        } else if (result.status === 'failed') {
          task.status = 'failed';
          task.error = result.error || '生成失败';

          await sendEvent({
            type: 'image_gen_error',
            slideIndex: task.slideIndex,
            error: task.error
          });
        }
      } catch (error) {
        // 查询失败，继续等待
        console.error(`[Presentation Agent] Query task ${task.taskId} error:`, error);
      }
    });

    await Promise.all(queryPromises);

    // 检查是否全部完成
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const failedCount = tasks.filter(t => t.status === 'failed').length;

    if (completedCount + failedCount === tasks.length) {
      break;
    }

    // 等待下一次轮询
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // 发送完成事件
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  await sendEvent({
    type: 'all_images_complete',
    count: completedCount
  });

  console.log(`[Presentation Agent] Image generation complete: ${completedCount}/${tasks.length} succeeded`);

  return results;
}

// ============================================
// 快速图片分析（使用 fast 2.5 模型）
// ============================================

// 快速审图模型 - 使用 Claude Haiku 4.5 或用户配置的快速模型
const FAST_VISION_MODEL = process.env.FAST_VISION_MODEL || 'claude-haiku-4-5-20251001';

// 使用快速模型分析参考图片
async function analyzeImagesWithFastModel(
  images: ImageInfo[],
  anthropic: Anthropic,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<string[]> {
  if (images.length === 0) return [];

  const analyses: string[] = [];

  console.log(`[Presentation Agent] Analyzing ${images.length} images with fast model: ${FAST_VISION_MODEL}`);

  // 并发分析所有图片
  const analyzePromises = images.map(async (image, index) => {
    try {
      await sendEvent({
        type: 'image_analysis',
        index,
        analysis: `正在分析参考图片 ${index + 1}...`
      });

      const response = await anthropic.messages.create({
        model: FAST_VISION_MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: image.url
                }
              },
              {
                type: 'text',
                text: `简要分析这张图片的：
1. 主题内容（1句话）
2. 视觉风格（配色、氛围）
3. 适合的网站类型

输出格式：
主题：xxx
风格：xxx
适合：xxx`
              }
            ]
          }
        ]
      });

      const analysis = response.content[0].type === 'text' ? response.content[0].text : '';

      await sendEvent({
        type: 'image_analysis',
        index,
        analysis: `图片 ${index + 1} 分析完成`
      });

      return { index, analysis };
    } catch (error) {
      console.error(`[Presentation Agent] Failed to analyze image ${index}:`, error);
      return { index, analysis: `图片 ${index + 1}: 分析失败` };
    }
  });

  const results = await Promise.all(analyzePromises);

  // 按索引排序
  results.sort((a, b) => a.index - b.index);
  analyses.push(...results.map(r => r.analysis));

  console.log(`[Presentation Agent] Image analysis complete: ${analyses.length} images analyzed`);

  return analyses;
}

// ============================================
// 主流程
// ============================================

// 运行 ReAct 循环（阶段1：规划和材料收集）
export async function runScrollytellingAgent(
  images: ImageInfo[],
  config: ScrollytellingAgentConfig,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<ScrollytellingFinalOutput | null> {
  const anthropic = getAnthropicClient();
  const startTime = Date.now();

  // 心跳保活定时器
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      try {
        await sendEvent({
          type: 'thought',
          iteration: 0,
          content: `⏱️ 已运行 ${elapsed} 秒，仍在处理中...`
        });
      } catch {
        // 忽略
      }
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // 判断工作模式
  const hasImages = images.length > 0;
  const userPrompt = config.userPrompt;

  // 无图片模式必须有用户提示词
  if (!hasImages && !userPrompt) {
    throw new Error('无图片模式下，用户提示词（userPrompt）是必须的');
  }

  // 初始化状态
  const state: ScrollytellingAgentState = {
    iteration: 0,
    maxIterations: 15,
    isComplete: false,
    images,
    userPrompt,
    collectedMaterials: []
  };

  // 构建系统提示（根据是否有图片决定工作流程）
  const systemPrompt = buildScrollytellingSystemPrompt({
    theme: config.theme,
    imageCount: images.length,
    userPrompt,
    hasImages
  });

  // 格式化工具
  const tools = formatToolsForClaude();

  // 发送开始事件（根据模式不同显示不同消息）
  await sendEvent({
    type: 'start',
    message: hasImages
      ? '开始分析参考图片和规划动效网站...'
      : '开始深度研究主题和规划动效网站...'
  });

  // 如果有图片，先用快速模型进行图片分析
  let imageAnalyses: string[] = [];
  if (hasImages) {
    await sendEvent({
      type: 'phase',
      phase: 'preparation',
      message: '使用快速模型分析参考图片...'
    });

    imageAnalyses = await analyzeImagesWithFastModel(images, anthropic, sendEvent);
  }

  // 构建初始消息（包含图片分析结果）
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildInitialUserMessage(images, config, hasImages, imageAnalyses)
    }
  ];

  await sendEvent({
    type: 'phase',
    phase: 'preparation',
    message: hasImages
      ? 'Claude 正在分析参考图片、规划网站结构、搜索资料...'
      : 'Claude 正在进行深度研究、规划网站结构、搜索资料...（预计 30-60 秒）'
  });

  startHeartbeat();

  try {
    // ReAct 循环
    while (!state.isComplete && state.iteration < state.maxIterations) {
      state.iteration++;
      const iterationStart = Date.now();
      console.log(`[Presentation Agent] Iteration ${state.iteration}/${state.maxIterations}`);

      try {
        // 流式调用 Claude
        const stream = anthropic.messages.stream({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
          max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '16000', 10),
          system: systemPrompt,
          tools: tools as any,
          messages
        });

        // 处理流式响应
        let assistantThinking = '';
        let currentToolId = '';
        let currentToolName = '';
        let currentToolInput = '';
        const toolCalls: Array<{ id: string; name: string; input: any; parseError?: string }> = [];

        // 流式处理中的心跳机制 - 每 10 秒发送一次心跳
        let lastEventTime = Date.now();
        const streamHeartbeatInterval = 10000;
        let streamHeartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
          const elapsed = Math.round((Date.now() - lastEventTime) / 1000);
          if (elapsed >= 8) {
            try {
              await sendEvent({
                type: 'thought',
                iteration: state.iteration,
                content: `🔄 Claude 正在分析中... (${elapsed}s)`
              });
            } catch {
              // 忽略发送错误
            }
          }
        }, streamHeartbeatInterval);

        const clearStreamHeartbeat = () => {
          if (streamHeartbeatTimer) {
            clearInterval(streamHeartbeatTimer);
            streamHeartbeatTimer = null;
          }
        };

        try {
          for await (const event of stream) {
            lastEventTime = Date.now(); // 更新最后事件时间

            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = '';
                // 工具调用开始时发送通知
                await sendEvent({
                  type: 'thought',
                  iteration: state.iteration,
                  content: `🔧 准备调用工具: ${currentToolName}`
                });
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                assistantThinking += event.delta.text;
                if (event.delta.text.length > 0) {
                  await sendEvent({
                    type: 'thought',
                    iteration: state.iteration,
                    content: event.delta.text
                  });
                }
              } else if (event.delta.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json;
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolName && currentToolId) {
                let input: Record<string, any> = {};
                let parseError: string | null = null;

                try {
                  input = safeParseJSON(currentToolInput) || {};
                } catch (e) {
                  parseError = e instanceof Error ? e.message : '解析错误';
                }

                toolCalls.push({
                  id: currentToolId,
                  name: currentToolName,
                  input,
                  parseError: parseError || undefined
                });
                currentToolId = '';
                currentToolName = '';
                currentToolInput = '';
              }
            }
          }
        } finally {
          clearStreamHeartbeat();
        }

        const finalMessage = await stream.finalMessage();
        messages.push({ role: 'assistant', content: finalMessage.content });

        // 如果没有工具调用
        if (toolCalls.length === 0) {
          if (state.iteration < state.maxIterations) {
            messages.push({
              role: 'user',
              content: '⚠️ 你没有调用任何工具！请调用 `finalize_prompt` 完成任务。'
            });
            continue;
          } else {
            break;
          }
        }

        // 执行工具调用
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          console.log(`[Presentation Agent] Executing tool: ${toolCall.name}`);

          let result: { success: boolean; data?: any; error?: string };

          if (toolCall.parseError) {
            result = {
              success: false,
              error: `工具参数格式错误: ${toolCall.parseError}。请重新调用。`
            };
          } else {
            await sendEvent({
              type: 'action',
              iteration: state.iteration,
              tool: toolCall.name,
              input: toolCall.input
            });

            result = await executeToolCall(toolCall.name, toolCall.input, state, sendEvent);
          }

          await sendEvent({
            type: 'observation',
            iteration: state.iteration,
            result: { success: result.success, data: result.success ? result.data : { error: result.error } }
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          });

          if (toolCall.name === 'finalize_prompt' && result.success) {
            state.isComplete = true;
          }
        }

        messages.push({ role: 'user', content: toolResults });

        const iterationDuration = Math.round((Date.now() - iterationStart) / 1000);
        console.log(`[Presentation Agent] Iteration ${state.iteration} completed in ${iterationDuration}s`);

      } catch (error) {
        console.error('[Presentation Agent] Error in iteration:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';

        if (state.iteration < state.maxIterations - 1) {
          await sendEvent({
            type: 'thought',
            iteration: state.iteration,
            content: `⚠️ 遇到错误: ${errorMessage}，正在重试...`
          });
          messages.push({
            role: 'user',
            content: `上一次操作遇到错误: ${errorMessage}。请继续工作，调用 finalize_prompt 完成任务。`
          });
          continue;
        }

        await sendEvent({ type: 'error', error: errorMessage });
        break;
      }
    }

    stopHeartbeat();

    if (!state.isComplete || !state.finalPrompt || !state.structurePlan) {
      console.error('[Presentation Agent] Agent did not complete successfully');
      return null;
    }

    // 收集需要生成的图片配置
    const imageConfigs = state.structurePlan.slides
      .map((slide, index) => slide.imageConfig ? { slideIndex: index, config: slide.imageConfig } : null)
      .filter((item): item is { slideIndex: number; config: SlideImageConfig } => item !== null);

    // 并发生成图片
    const generatedImages = await generateAllImages(
      imageConfigs,
      config.imageResolution || '1k',
      sendEvent
    );

    // 更新状态中的图片 URL
    const generatedImageConfigs: SlideImageConfig[] = [];
    for (const [slideIndex, imageUrl] of generatedImages) {
      const slide = state.structurePlan.slides[slideIndex];
      if (slide.imageConfig) {
        slide.imageConfig.generatedUrl = imageUrl;
        slide.imageConfig.status = 'completed';
        generatedImageConfigs.push(slide.imageConfig);
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: `✅ 准备完成，总耗时 ${totalDuration} 秒，生成了 ${generatedImages.size} 张图片`
    });

    return {
      structurePlan: state.structurePlan,
      finalPrompt: state.finalPrompt,
      materials: {
        searchResults: state.collectedMaterials,
        chartConfigs: state.structurePlan.slides.map(s => s.chartData).filter(Boolean)
      },
      generatedImages: generatedImageConfigs
    };

  } finally {
    stopHeartbeat();
  }
}

// 构建初始用户消息（根据是否有图片采用不同模板）
function buildInitialUserMessage(
  images: ImageInfo[],
  config: ScrollytellingAgentConfig,
  hasImages: boolean,
  imageAnalyses: string[] = []
): string {
  if (hasImages) {
    // 有图片模式：分析图片 → 规划结构 → 搜索 → 完成
    let message = `请为以下主题创建一个 Awwwards 级别的 GSAP Scrollytelling 动效网站。

## 📸 参考图片分析结果（已由快速模型预分析）

`;

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const analysis = imageAnalyses[i] || '(分析中...)';
      message += `### 参考图片 ${i + 1}
- URL: ${img.url}
- 用户描述: ${img.prompt || '(无描述)'}
- **AI 分析**:
${analysis}

`;
    }

    if (config.theme) {
      message += `## 🎨 用户指定的风格
${config.theme}

`;
    }

    message += `## ✅ 任务要求

1. 分析参考图片，理解主题和视觉风格
2. 调用 \`plan_structure\` 规划网站结构（5-8 个 section）
3. 为每个 section 编写 AI 生图提示词
4. 调用 \`web_search\` 搜索相关资料（至少 5 次）
5. 调用 \`generate_chart_data\` 生成图表配置（如需要）
6. 调用 \`finalize_prompt\` 完成

⚠️ 重要：
- 参考图片仅供分析，网站中的图片全部由 AI 生成！
- 必须设计丰富的 GSAP ScrollTrigger 动画效果！
- 必须在工作结束前调用 \`finalize_prompt\`！

请开始工作，先调用 \`plan_structure\`。`;

    return message;

  } else {
    // 无图片模式：深度研究 → 规划结构 → 搜索 → 完成
    let message = `请为以下主题创建一个 Awwwards 级别的 GSAP Scrollytelling 动效网站。

## 📝 用户需求

${config.userPrompt}

`;

    if (config.theme) {
      message += `## 🎨 用户指定的风格
${config.theme}

`;
    }

    message += `## ⚠️ 重要：必须遵循的流程

由于没有参考图片，你**必须首先调用 \`deep_research\`** 进行深度研究！

### 完整流程：
1. **首先调用 \`deep_research\`** - 对主题进行深度研究（约 30-60 秒）
2. 基于研究结果，调用 \`plan_structure\` 规划网站结构（5-8 个 section）
3. 为每个 section 编写 AI 生图提示词
4. 调用 \`web_search\` 搜索更多补充资料（至少 8 次）
5. 调用 \`generate_chart_data\` 生成图表配置（如需要）
6. 调用 \`finalize_prompt\` 完成

⚠️ 注意：
- 网站中的图片全部由 AI 生成！
- 必须设计丰富的 GSAP ScrollTrigger 动画效果！
- 必须在工作结束前调用 \`finalize_prompt\`！
- **无图片模式必须先调用 \`deep_research\`！**

请开始工作，先调用 \`deep_research\`。`;

    return message;
  }
}

// ============================================
// Gemini 生成 GSAP Scrollytelling HTML
// ============================================

export async function generateHtmlWithGemini(
  finalPrompt: string,
  images: ImageInfo[],
  generatedImageUrls: Map<number, string>,
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<void> {
  const startTime = Date.now();

  await sendEvent({
    type: 'phase',
    phase: 'generation',
    message: 'Gemini 正在生成 GSAP Scrollytelling 动效网站...'
  });

  const apiBaseUrl = process.env.SCROLLYTELLING_API_BASE_URL || 'http://172.93.101.237:8317';
  const apiKey = process.env.SCROLLYTELLING_API_KEY || 'sk-12345';
  const model = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';

  // 替换图片占位符
  let promptWithImages = finalPrompt;
  for (const [slideIndex, imageUrl] of generatedImageUrls) {
    promptWithImages = promptWithImages.replace(`{{IMAGE_${slideIndex}}}`, imageUrl);
  }

  // 构建用户消息
  const userContent: any[] = [];

  // 添加参考图片（供 Gemini 理解风格，仅有图片时添加）
  if (images.length > 0) {
    for (const image of images.slice(0, 3)) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image.url }
      });
    }
  }

  userContent.push({
    type: 'text',
    text: promptWithImages
  });

  // Gemini 系统提示词 - 简洁美观的研究展示网站（轻量版）
  const geminiSystemPrompt = `你是一位优秀的前端开发者，擅长用 Tailwind CSS 创建简洁美观的网站。

## 🎯 核心定位：简洁研究展示网站

创建一个**简洁、流畅、高性能**的研究展示网站。

**⚠️ 性能第一原则：**
- ❌ 禁止使用 GSAP、ScrollTrigger、Lenis
- ❌ 禁止使用 Canvas 动画（如 Matrix Rain、粒子效果）
- ❌ 禁止使用 setInterval/setTimeout 做持续动画
- ✅ 只用 CSS 动画和 Intersection Observer
- ✅ 保持简洁，追求流畅体验

## 🎨 技术栈（仅使用）

\`\`\`html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>研究报告</title>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- ECharts（可选，用于图表）-->
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
</head>
\`\`\`

## 🎬 动画方案（纯 CSS + Intersection Observer）

### 1. CSS 动画类
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

### 2. Intersection Observer（简单入场）
\`\`\`javascript
// 入场动画（简洁高效）
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
\`\`\`

## 🔗 参考来源展示

### 内联引用
\`\`\`html
<p>AI 市场规模将达到 2000 亿美元<a href="URL" target="_blank" class="text-blue-400 text-xs align-super hover:underline">[1]</a></p>
\`\`\`

### 来源卡片
\`\`\`html
<a href="URL" target="_blank" class="block p-4 bg-slate-800/50 rounded-xl border border-slate-700 hover-lift">
  <div class="flex items-start gap-3">
    <i data-lucide="file-text" class="w-5 h-5 text-blue-400"></i>
    <div>
      <h4 class="font-medium text-white">来源标题</h4>
      <p class="text-sm text-slate-400 mt-1">摘要内容...</p>
    </div>
  </div>
</a>
\`\`\`

### 底部参考来源区
\`\`\`html
<section class="bg-slate-900 py-16 px-8">
  <h2 class="text-2xl font-bold text-white mb-8">📚 参考来源</h2>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    <a href="URL" target="_blank" class="p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition">
      <span class="text-blue-400 font-mono">[1]</span>
      <span class="text-white ml-2">来源标题</span>
      <span class="block text-slate-500 text-sm mt-1">domain.com</span>
    </a>
  </div>
</section>
\`\`\`

## 🏗️ 推荐网站结构

1. **Hero** - 标题 + 核心数据（3个关键数字）
2. **Key Findings** - 2-3 个核心发现卡片
3. **Data Section** - ECharts 图表（可选，最多1个）
4. **Content** - 研究内容 + 内联引用
5. **References** - 参考来源列表

## 📊 ECharts 使用（可选，最多1个图表）

\`\`\`javascript
// 延迟初始化，不阻塞渲染
setTimeout(() => {
  const chart = echarts.init(document.getElementById('chart'));
  chart.setOption({ /* 配置 */ });
  window.addEventListener('resize', () => chart.resize());
}, 100);
\`\`\`

## ✅ 设计规范

1. **深色主题** - bg-slate-900, bg-slate-800
2. **渐变文字** - bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent
3. **毛玻璃效果** - backdrop-blur-md bg-white/5
4. **圆角卡片** - rounded-xl 或 rounded-2xl
5. **适当留白** - py-16 px-8 或更多
6. **Lucide 图标** - \`<i data-lucide="icon-name"></i>\` 然后调用 \`lucide.createIcons()\`

## ⚠️ 严格禁止

1. ❌ GSAP / ScrollTrigger / Lenis
2. ❌ Canvas 动画（粒子、Matrix Rain 等）
3. ❌ setInterval / setTimeout 持续动画
4. ❌ 复杂视差效果
5. ❌ 过多动画（保持简洁）

## 输出格式

直接输出完整 HTML，从 \`<!DOCTYPE html>\` 到 \`</html>\`。
不要任何解释，不要 markdown 代码块。
保持代码简洁，追求流畅体验。`;

  // 心跳 - 每 10 秒检查一次，如果超过 8 秒没有收到数据则发送心跳
  let lastChunkTime = Date.now();
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const geminiHeartbeatInterval = 10000;

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(async () => {
      if (Date.now() - lastChunkTime > 8000) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
          await sendEvent({
            type: 'thought',
            iteration: 0,
            content: `⏱️ Gemini 生成中... 已运行 ${elapsed} 秒`
          });
        } catch { }
      }
    }, geminiHeartbeatInterval);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  try {
    startHeartbeat();

    const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: geminiSystemPrompt },
          { role: 'user', content: userContent }
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 64000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lastChunkTime = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              chunkCount++;
              await sendEvent({ type: 'html_chunk', chunk: content });
            }
          } catch { }
        }
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Presentation Agent] Gemini generation completed in ${totalDuration}s, ${chunkCount} chunks`);

  } catch (error) {
    console.error('[Presentation Agent] Gemini generation error:', error);
    throw error;
  } finally {
    stopHeartbeat();
  }
}

// ============================================
// 修改模式
// ============================================

// 对话历史类型
type ConversationMessage = { role: 'user' | 'assistant'; content: string };

export async function modifyHtmlWithGemini(
  previousHtml: string,
  modification: string,
  images: ImageInfo[],
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>,
  conversationHistory?: ConversationMessage[]
): Promise<void> {
  const startTime = Date.now();

  const apiBaseUrl = process.env.SCROLLYTELLING_API_BASE_URL || 'http://172.93.101.237:8317';
  const apiKey = process.env.SCROLLYTELLING_API_KEY || 'sk-12345';
  const model = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';

  const modifySystemPrompt = `你是一位优秀的前端开发者，擅长用 Tailwind CSS 创建简洁美观的网站。

## 任务
你正在与用户进行多轮对话，帮助用户修改研究展示网站。
用户会提出修改要求，你需要根据之前生成的 HTML 进行调整。

## 性能原则（必须遵守）
- ❌ 禁止使用 GSAP、ScrollTrigger、Lenis
- ❌ 禁止使用 Canvas 动画（Matrix Rain、粒子等）
- ❌ 禁止使用 setInterval/setTimeout 做持续动画
- ✅ 只用 CSS 动画和 Intersection Observer
- ✅ 保持简洁流畅

## 输出要求
1. 直接输出修改后的完整 HTML 代码
2. 从 <!DOCTYPE html> 开始，到 </html> 结束
3. 不要任何解释，不要 markdown 代码块
4. 保持简洁的 Tailwind CSS 风格
5. 如果原代码有 GSAP/Lenis，改为纯 CSS 动画`;

  // 构建消息数组
  const messages: Array<{ role: string; content: any }> = [
    { role: 'system', content: modifySystemPrompt }
  ];

  // 如果有对话历史，使用真正的多轮对话
  if (conversationHistory && conversationHistory.length > 0) {
    console.log(`[modifyHtmlWithGemini] Using conversation history with ${conversationHistory.length} messages`);

    // 添加对话历史（user/assistant 交替）
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
  } else {
    // 旧模式：把 previousHtml 放在 user message 里（向后兼容）
    console.log('[modifyHtmlWithGemini] No conversation history, using legacy mode');

    const userContent: any[] = [];
    for (const image of images.slice(0, 2)) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image.url }
      });
    }
    userContent.push({
      type: 'text',
      text: `## 当前 HTML 代码

\`\`\`html
${previousHtml}
\`\`\`

## 修改要求

${modification}

请根据以上要求修改 HTML，直接输出完整的修改后代码。`
    });

    messages.push({ role: 'user', content: userContent });
  }

  console.log(`[modifyHtmlWithGemini] Sending ${messages.length} messages to Gemini`);

  try {
    const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 64000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              chunkCount++;
              await sendEvent({ type: 'html_chunk', chunk: content });
            }
          } catch { }
        }
      }
    }

    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Presentation Agent] Gemini modification completed in ${totalDuration}s, ${chunkCount} chunks`);

  } catch (error) {
    console.error('[Presentation Agent] Gemini modification error:', error);
    throw error;
  }
}
