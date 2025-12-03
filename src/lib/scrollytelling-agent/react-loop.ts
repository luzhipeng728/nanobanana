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

  // Gemini 系统提示词 - 研究性 Scrollytelling 动效网站
  const geminiSystemPrompt = `你是一位 Awwwards 级别的 Creative Technologist，精通 GSAP、ScrollTrigger、CSS 动画和现代 Web 开发。

你的任务是创建一个**视觉震撼、信息丰富**的 **研究性 Scrollytelling 滚动叙事网站**。

## 🎯 核心定位：研究展示网站

这是一个**深度研究展示**网站，需要：
1. **展示研究发现** - 清晰呈现研究内容和关键数据
2. **引用来源链接** - 为关键观点添加可点击的参考来源
3. **数据可视化** - 用图表和动画展示统计数据
4. **学术感设计** - 专业、可信、高端的视觉风格

## 🔗 参考来源展示（核心功能！）

提示词中会包含大量参考来源和搜索结果，你需要：

### 1. 来源卡片组件
\`\`\`html
<div class="source-card glass hover-lift">
  <div class="source-icon">📄</div>
  <div class="source-content">
    <h4 class="source-title">文章标题</h4>
    <p class="source-snippet">摘要内容...</p>
    <a href="URL" target="_blank" class="source-link">
      查看来源 <span class="arrow">→</span>
    </a>
  </div>
</div>
\`\`\`

### 2. 内联引用标记
\`\`\`html
<p>
  根据研究显示，AI 市场规模将达到 2000 亿美元
  <a href="URL" class="citation" target="_blank">[1]</a>
</p>
\`\`\`

### 3. 参考来源 Section
在网站末尾添加专门的参考来源区域：
\`\`\`html
<section class="references-section">
  <h2>📚 参考来源</h2>
  <div class="references-grid">
    <a href="URL1" target="_blank" class="ref-item">
      <span class="ref-num">[1]</span>
      <span class="ref-title">来源标题</span>
      <span class="ref-domain">domain.com</span>
    </a>
    <!-- 更多来源... -->
  </div>
</section>
\`\`\`

## 🎨 研究性网站专用 CSS

\`\`\`css
/* 来源卡片 */
.source-card {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 12px;
  transition: all 0.3s ease;
}
.source-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.2);
}
.source-link {
  color: #667eea;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.source-link:hover {
  text-decoration: underline;
}

/* 内联引用 */
.citation {
  color: #667eea;
  font-size: 0.75em;
  vertical-align: super;
  text-decoration: none;
  font-weight: 600;
}
.citation:hover {
  text-decoration: underline;
}

/* 参考来源区域 */
.references-section {
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  padding: 5rem 8vw;
}
.references-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}
.ref-item {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: rgba(255,255,255,0.05);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}
.ref-item:hover {
  background: rgba(255,255,255,0.1);
}
.ref-num {
  color: #667eea;
  font-weight: 600;
}
.ref-title {
  color: #f8fafc;
  margin: 0.25rem 0;
}
.ref-domain {
  color: #64748b;
  font-size: 0.875rem;
}

/* 数据高亮 */
.data-highlight {
  font-size: 3rem;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
\`\`\`

## 🎯 核心技术栈

- **GSAP 3.x + ScrollTrigger** - 核心动画引擎
- **Lenis** - 平滑滚动
- **CSS3 动画** - 辅助效果
- **ECharts** - 数据可视化（必须用于展示研究数据）
- **原生 JavaScript** - 交互逻辑

## ⚠️ 必须包含的 CDN（缺一不可！）

在 \`<head>\` 中必须包含以下 CDN 脚本，**顺序不可变**：

\`\`\`html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>研究报告</title>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- GSAP 核心 + ScrollTrigger（必须！）-->
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
  <!-- Lenis 平滑滚动（必须！）-->
  <script src="https://cdn.jsdelivr.net/npm/lenis@1.0.45/dist/lenis.min.js"></script>
  <!-- ECharts 数据可视化 -->
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>
    /* 你的 CSS 样式 */
  </style>
</head>
\`\`\`

**⚠️ 在 \`</body>\` 前的 \`<script>\` 中必须包含（顺序严格！）：**

\`\`\`javascript
// ============================================
// ⚠️ 初始化顺序严格不可变！否则滚动失效！
// ============================================

// 【第1步】必须先注册 GSAP 插件！
gsap.registerPlugin(ScrollTrigger);

// 【第2步】再初始化 Lenis 平滑滚动
const lenis = new Lenis({
  lerp: 0.1,
  smoothWheel: true,
  wheelMultiplier: 1
});

// 【第3步】连接 Lenis 与 ScrollTrigger
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

// 【第4步】启动 RAF 循环
function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ============================================
// 以上初始化代码必须放在所有动画代码之前！
// ============================================
\`\`\`

**❌ 常见错误（会导致滚动失效）：**
- Lenis 初始化在 gsap.registerPlugin 之前
- 缺少 requestAnimationFrame 循环
- 把初始化代码放在动画代码之后

## 🎬 必须使用的 GSAP 动效

### ScrollTrigger 基础
\`\`\`javascript
gsap.registerPlugin(ScrollTrigger);

gsap.from(".element", {
  scrollTrigger: { trigger: ".element", start: "top 80%", scrub: true },
  y: 100, opacity: 0
});
\`\`\`

### 数字计数（展示数据）
\`\`\`javascript
gsap.from('.counter', {
  scrollTrigger: { trigger: '.counter', start: 'top 80%' },
  textContent: 0, duration: 2, snap: { textContent: 1 }
});
\`\`\`

### 卡片错落入场
\`\`\`javascript
gsap.from('.card', {
  scrollTrigger: { trigger: '.cards-container', start: 'top 80%' },
  y: 100, opacity: 0, stagger: { each: 0.15 }
});
\`\`\`

## 📊 必须包含的数据可视化

使用 ECharts 展示研究数据：
\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

## 🏗️ 推荐网站结构

1. **Hero Section** - 研究主题标题 + 核心发现摘要
2. **Key Findings** - 关键发现卡片（带来源链接）
3. **Data Visualization** - 数据图表 + 数字计数
4. **Deep Dive** - 详细内容区（带内联引用）
5. **Source Cards** - 重要来源展示卡片
6. **Timeline/Progress** - 发展趋势时间线（如适用）
7. **References** - 完整参考来源列表
8. **CTA** - 行动召唤

## ⚠️ 重要约束

1. **必须添加参考来源链接** - 关键数据和观点要有来源
2. **所有外链使用 target="_blank"** - 新窗口打开
3. **60fps 流畅动画** - 使用 will-change、transform
4. **响应式设计** - 适配移动端
5. **深色主题** - 专业研究风格

## 输出格式

直接输出完整 HTML，从 <!DOCTYPE html> 开始到 </html> 结束。
不要任何解释，不要 markdown 代码块。
所有 CSS 和 JS 内联在 HTML 中。`;

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

export async function modifyHtmlWithGemini(
  previousHtml: string,
  modification: string,
  images: ImageInfo[],
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<void> {
  const startTime = Date.now();

  const apiBaseUrl = process.env.SCROLLYTELLING_API_BASE_URL || 'http://172.93.101.237:8317';
  const apiKey = process.env.SCROLLYTELLING_API_KEY || 'sk-12345';
  const model = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';

  const modifySystemPrompt = `你是一位 Awwwards 级别的前端开发专家，精通 GSAP、ScrollTrigger 和 CSS 动画。用户已经有一个 Scrollytelling 动效网站，现在需要你根据要求进行修改。

## 任务
根据用户的修改要求，对提供的 HTML 进行调整。

## 输出要求
1. 直接输出修改后的完整 HTML 代码
2. 从 <!DOCTYPE html> 开始，到 </html> 结束
3. 不要任何解释，不要 markdown 代码块
4. 保留原有的 GSAP、ScrollTrigger、ECharts 等功能
5. 确保动画流畅，使用相对单位`;

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

  try {
    const response = await fetch(`${apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: modifySystemPrompt },
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
