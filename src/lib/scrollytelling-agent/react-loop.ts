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

// 心跳保活间隔
const HEARTBEAT_INTERVAL = 30000;

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

  // 初始化状态
  const state: ScrollytellingAgentState = {
    iteration: 0,
    maxIterations: 15,
    isComplete: false,
    images,
    collectedMaterials: []
  };

  // 构建系统提示
  const systemPrompt = buildScrollytellingSystemPrompt({
    theme: config.theme,
    imageCount: images.length
  });

  // 格式化工具
  const tools = formatToolsForClaude();

  // 构建初始消息
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildInitialUserMessage(images, config)
    }
  ];

  // 发送开始事件
  await sendEvent({
    type: 'start',
    message: '开始分析参考图片和规划演示文稿...'
  });

  await sendEvent({
    type: 'phase',
    phase: 'preparation',
    message: 'Claude 正在分析参考图片、规划幻灯片结构、搜索资料...'
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

        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
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

// 构建初始用户消息
function buildInitialUserMessage(images: ImageInfo[], config: ScrollytellingAgentConfig): string {
  let message = `请为以下主题创建一个高端 reveal.js 演示文稿。

## 参考图片（仅供分析主题和风格，不直接使用）

`;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    message += `### 参考图片 ${i + 1}
- URL: ${img.url}
- 描述: ${img.prompt || '(无描述)'}

`;
  }

  if (config.theme) {
    message += `## 用户指定的风格
${config.theme}

`;
  }

  message += `## 任务要求

1. 分析参考图片，理解主题和风格
2. 规划幻灯片结构（5-10张）
3. 为每张幻灯片编写 AI 生图提示词
4. 搜索相关资料丰富内容
5. 生成图表数据配置
6. 调用 finalize_prompt 完成

⚠️ 重要：参考图片仅供分析，幻灯片中的图片全部由 AI 生成！

请开始工作，先调用 plan_structure。`;

  return message;
}

// ============================================
// Gemini 生成 reveal.js HTML
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
    message: 'Gemini 正在生成 reveal.js 演示文稿...'
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

  // 添加参考图片（供 Gemini 理解风格）
  for (const image of images.slice(0, 3)) {
    userContent.push({
      type: 'image_url',
      image_url: { url: image.url }
    });
  }

  userContent.push({
    type: 'text',
    text: promptWithImages
  });

  // Gemini 系统提示词
  const geminiSystemPrompt = `你是一位顶级 Creative Technologist，精通 reveal.js、ECharts、CSS 动画。

你的任务是创建一个**视觉精美、交互丰富**的 reveal.js 演示文稿。

## reveal.js 基础结构

\`\`\`html
<div class="reveal">
  <div class="slides">
    <section>幻灯片 1</section>
    <section>
      <section>垂直幻灯片 2.1</section>
      <section>垂直幻灯片 2.2</section>
    </section>
  </div>
</div>
\`\`\`

## 必须包含的功能

1. **片段动画**
\`\`\`html
<p class="fragment fade-in">渐入</p>
<p class="fragment fade-up">上滑入</p>
<p class="fragment highlight-red">高亮</p>
\`\`\`

2. **数据卡片 + 计数动画**
\`\`\`javascript
Reveal.on('slidechanged', event => {
  const counters = event.currentSlide.querySelectorAll('.counter');
  counters.forEach(counter => {
    const target = parseInt(counter.dataset.target);
    animateCounter(counter, target);
  });
});
\`\`\`

3. **ECharts 图表**
在幻灯片切换时初始化图表

4. **进度条动画**
\`\`\`css
.progress-bar {
  animation: fillProgress 2s ease-out forwards;
}
\`\`\`

## 图片使用

- 图片 URL 已在提示词中提供
- 使用 \`object-fit: contain\` 保持比例
- 可以作为背景或内嵌图片

## 配色和风格

- 根据主题选择合适的配色
- 使用渐变增加视觉层次
- 保持整体风格一致

## 输出格式

直接输出完整 HTML，从 <!DOCTYPE html> 开始到 </html> 结束。
不要任何解释，不要 markdown 代码块。`;

  // 心跳
  let lastChunkTime = Date.now();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(async () => {
      if (Date.now() - lastChunkTime > 10000) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
          await sendEvent({
            type: 'thought',
            iteration: 0,
            content: `⏱️ Gemini 生成中... 已运行 ${elapsed} 秒`
          });
        } catch { }
      }
    }, HEARTBEAT_INTERVAL);
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

  const modifySystemPrompt = `你是一位专业的前端开发专家。用户已经有一个 reveal.js 演示文稿，现在需要你根据要求进行修改。

## 任务
根据用户的修改要求，对提供的 HTML 进行调整。

## 输出要求
1. 直接输出修改后的完整 HTML 代码
2. 从 <!DOCTYPE html> 开始，到 </html> 结束
3. 不要任何解释，不要 markdown 代码块
4. 保留原有的 reveal.js、ECharts 等功能`;

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
