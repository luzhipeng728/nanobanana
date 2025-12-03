// Scrollytelling Agent ReAct 循环

import Anthropic from '@anthropic-ai/sdk';
import {
  ImageInfo,
  ScrollytellingAgentState,
  ScrollytellingStreamEvent,
  ScrollytellingFinalOutput,
  ScrollytellingAgentConfig
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

// 安全解析 JSON
function safeParseJSON(text: string): Record<string, any> | null {
  // 第1层：直接解析
  try {
    return JSON.parse(text);
  } catch {
    // 继续
  }

  // 第2层：提取 JSON 对象
  const jsonMatches = text.match(/\{[\s\S]*\}/g);
  if (jsonMatches) {
    for (const jsonStr of jsonMatches) {
      try {
        return JSON.parse(jsonStr);
      } catch {
        // 继续尝试下一个
      }
    }
  }

  // 第3层：修复常见问题
  try {
    const fixed = text
      .replace(/,\s*([}\]])/g, '$1')  // 移除尾部多余逗号
      .replace(/'/g, '"');             // 修复单引号
    return JSON.parse(fixed);
  } catch {
    // 放弃
  }

  return null;
}

// 心跳保活间隔（30秒发送一次心跳，防止 SSE 断开）
const HEARTBEAT_INTERVAL = 30000;

// 运行 ReAct 循环（阶段1：材料收集）- 流式版本
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
        // 忽略发送错误
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
    maxIterations: 15, // 增加到 15 次迭代
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
    message: '开始分析图片和收集材料...'
  });

  await sendEvent({
    type: 'phase',
    phase: 'preparation',
    message: 'Claude 正在分析图片、规划结构、搜索资料...'
  });

  // 启动心跳
  startHeartbeat();

  try {
    // ReAct 循环
    while (!state.isComplete && state.iteration < state.maxIterations) {
      state.iteration++;
      const iterationStart = Date.now();
      console.log(`[Scrollytelling Agent] Iteration ${state.iteration}/${state.maxIterations}`);

      try {
        // 使用流式 API 调用 Claude
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
        const toolCalls: Array<{ id: string; name: string; input: any }> = [];

        // 流式处理事件
        for await (const event of stream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'text') {
              // 文本块开始
            } else if (event.content_block.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              // 流式输出思考内容
              assistantThinking += event.delta.text;

              // 每收到一段思考内容就发送（实时流式）
              if (event.delta.text.length > 0) {
                await sendEvent({
                  type: 'thought',
                  iteration: state.iteration,
                  content: event.delta.text
                });
              }
            } else if (event.delta.type === 'input_json_delta') {
              // 工具输入流式接收
              currentToolInput += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            // 内容块结束
            if (currentToolName && currentToolId) {
              // 解析工具输入
              const input = safeParseJSON(currentToolInput) || {};
              toolCalls.push({
                id: currentToolId,
                name: currentToolName,
                input
              });
              currentToolId = '';
              currentToolName = '';
              currentToolInput = '';
            }
          }
        }

        // 获取最终响应
        const finalMessage = await stream.finalMessage();

        // 添加助手消息到历史
        messages.push({
          role: 'assistant',
          content: finalMessage.content
        });

        // 如果没有工具调用，提醒 Claude 调用 finalize_prompt
        if (toolCalls.length === 0) {
          console.log('[Scrollytelling Agent] No tool calls in this iteration');

          // 如果还有迭代机会，提醒 Claude 必须调用 finalize_prompt
          if (state.iteration < state.maxIterations) {
            // 添加提醒消息
            messages.push({
              role: 'user',
              content: '⚠️ 你没有调用任何工具！请记住：你必须调用 `finalize_prompt` 工具来完成任务。如果你已经完成了规划和搜索，请立即调用 `finalize_prompt`。'
            });

            await sendEvent({
              type: 'thought',
              iteration: state.iteration,
              content: '⚠️ 提醒 Claude 调用 finalize_prompt...'
            });

            continue; // 继续下一轮迭代
          } else {
            console.log('[Scrollytelling Agent] Max iterations reached without completion');
            break;
          }
        }

        // 执行工具调用
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolCall of toolCalls) {
          const toolStart = Date.now();
          console.log(`[Scrollytelling Agent] Executing tool: ${toolCall.name}`);

          // 发送动作事件
          await sendEvent({
            type: 'action',
            iteration: state.iteration,
            tool: toolCall.name,
            input: toolCall.input
          });

          // 执行工具
          const result = await executeToolCall(
            toolCall.name,
            toolCall.input,
            state,
            sendEvent
          );

          const toolDuration = Math.round((Date.now() - toolStart) / 1000);
          console.log(`[Scrollytelling Agent] Tool ${toolCall.name} completed in ${toolDuration}s, success: ${result.success}`);

          // 发送观察事件（包含耗时）
          await sendEvent({
            type: 'observation',
            iteration: state.iteration,
            result: {
              success: result.success,
              data: result.success ? result.data : { error: result.error },
              duration: `${toolDuration}s`
            }
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: JSON.stringify(result)
          });

          // 检查是否完成（finalize_prompt 被调用）
          if (toolCall.name === 'finalize_prompt' && result.success) {
            state.isComplete = true;
          }
        }

        // 添加工具结果到消息
        messages.push({
          role: 'user',
          content: toolResults
        });

        // 记录迭代耗时
        const iterationDuration = Math.round((Date.now() - iterationStart) / 1000);
        console.log(`[Scrollytelling Agent] Iteration ${state.iteration} completed in ${iterationDuration}s`);

      } catch (error) {
        console.error('[Scrollytelling Agent] Error in iteration:', error);
        await sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        });
        break;
      }
    }

    // 停止心跳
    stopHeartbeat();

    // 检查是否成功完成
    if (!state.isComplete || !state.finalPrompt) {
      const totalDuration = Math.round((Date.now() - startTime) / 1000);

      console.error('[Scrollytelling Agent] Agent did not complete successfully');
      console.error('[Scrollytelling Agent] State:', {
        isComplete: state.isComplete,
        hasFinalPrompt: !!state.finalPrompt,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        hasStructurePlan: !!state.structurePlan,
        materialsCount: state.collectedMaterials.length
      });

      // 发送详细错误信息
      await sendEvent({
        type: 'thought',
        iteration: state.iteration,
        content: `⚠️ Agent 未能完成（迭代 ${state.iteration}/${state.maxIterations}），总耗时 ${totalDuration} 秒。请检查是否调用了 finalize_prompt。`
      });

      return null;
    }

    // 发送准备完成信息
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    await sendEvent({
      type: 'thought',
      iteration: state.iteration,
      content: `✅ 材料收集完成，总耗时 ${totalDuration} 秒`
    });

    // 返回结果
    return {
      structurePlan: state.structurePlan!,
      finalPrompt: state.finalPrompt,
      materials: {
        searchResults: state.collectedMaterials,
        chartConfigs: state.structurePlan?.chapters.map(c => c.chartData).filter(Boolean) || []
      }
    };

  } finally {
    // 确保停止心跳
    stopHeartbeat();
  }
}

// 构建初始用户消息
function buildInitialUserMessage(images: ImageInfo[], config: ScrollytellingAgentConfig): string {
  let message = `请为以下 ${images.length} 张图片创建一个高端沉浸式一镜到底交互网页。

## 图片列表

`;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    message += `### 图片 ${i + 1}
- URL: ${img.url}
- 用户描述: ${img.prompt || '(无描述)'}

`;
  }

  if (config.theme) {
    message += `## 用户指定的风格
${config.theme}

`;
  }

  message += `## 期望

请：
1. 首先分析这些图片
2. 规划网页结构
3. 搜索相关资料扩展内容
4. 为每个章节生成数据可视化配置
5. 最后整合成详细的生成提示词

请开始工作。`;

  return message;
}

// 调用 Gemini 生成 HTML（阶段2）- 带心跳
export async function generateHtmlWithGemini(
  finalPrompt: string,
  images: ImageInfo[],
  sendEvent: (event: ScrollytellingStreamEvent) => Promise<void>
): Promise<void> {
  const startTime = Date.now();

  // 发送阶段切换事件
  await sendEvent({
    type: 'phase',
    phase: 'generation',
    message: 'Gemini 正在生成 HTML...'
  });

  const apiBaseUrl = process.env.SCROLLYTELLING_API_BASE_URL || 'http://172.93.101.237:8317';
  const apiKey = process.env.SCROLLYTELLING_API_KEY || 'sk-12345';
  const model = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';

  // 构建用户消息内容 - 包含图片
  const userContent: any[] = [];

  // 添加图片
  for (const image of images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: image.url }
    });
  }

  // 添加最终提示词
  userContent.push({
    type: 'text',
    text: finalPrompt
  });

  // Gemini 的系统提示词 - 详细规划内容生成
  const geminiSystemPrompt = `你是一位顶级 Creative Technologist 和数据可视化专家，精通 GSAP、ECharts、现代 CSS。

你的任务是根据提供的详细要求，创建一个**内容丰富、视觉精美**的高端沉浸式一镜到底交互网页。

## ⚠️ 布局原则

### 一屏一景（推荐但不强制）
**建议每个章节控制在一屏左右（100vh），避免内容过长需要大量滚动。**

**布局可以灵活多变，以下是一些参考：**
- 左右分栏（图片/图表 + 文字）
- 上下结构（标题 + 内容区）
- 卡片网格布局
- 全屏沉浸式（大图 + 叠加文字）
- Pin 固定 + 内容滚动

**关键原则：**
- 每个章节是一个完整的叙事单元
- 内容紧凑，避免大段空白
- 重要信息优先展示
- 详细内容可以用 Tab 或折叠面板

### 内容策略
- **核心观点突出**：标题、数据卡片、图表
- **详细内容可交互**：Tab 切换、展开/收起
- **视觉优先**：用图表和可视化增强表达

## 图片使用说明
提供的图片是**参考素材**：
- 你可以自由决定是否展示图片
- 如果展示，由你决定最合理的展示方式

## 内容结构要求

每个章节建议包含（可灵活组合）：
1. **标题 + 副标题**
2. **核心内容**（文字、图片、或两者结合）
3. **数据可视化**（数据卡片、图表、信息图等）
4. **交互元素**（Tab、时间线、折叠面板等）

**发挥创意！每个章节可以有不同的布局和展示方式！**

## 必须实现的交互效果

1. **数据卡片计数动画**
\`\`\`javascript
gsap.to(element, {
  innerHTML: targetNumber,
  duration: 2,
  snap: { innerHTML: 1 },
  scrollTrigger: { trigger: element, start: "top 80%" }
});
\`\`\`

2. **ECharts 图表**（每章 1 个）

3. **视差滚动效果**

4. **Pin 固定场景**（整个 section 固定，内部元素依次显示）
\`\`\`javascript
ScrollTrigger.create({
  trigger: section,
  start: "top top",
  end: "+=200%",
  pin: true,
  scrub: true
});
\`\`\`

5. **Tab 切换面板**（放详细内容）

## 风格判断
根据图片和内容风格选择合适的设计：
- 手绘/插画风格 → 温馨柔和配色
- 科技风格 → 深色背景 + 霓虹色
- 自然风格 → 绿色系 + 大地色
- 商务风格 → 深蓝 + 专业配色

## 技术规范

**CDN 引入（放在 </body> 之前）**:
\`\`\`html
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
\`\`\`

**⚠️ 禁止使用 Lenis、Locomotive Scroll！**

## 质量检查清单

- [ ] 每个章节有清晰的主题和结构
- [ ] 内容丰富，融入所有搜索资料
- [ ] 每章有数据可视化（卡片或图表）
- [ ] 有丰富的交互效果
- [ ] 风格与内容协调
- [ ] 布局美观，有创意

## 输出格式
直接输出完整 HTML，从 <!DOCTYPE html> 开始，到 </html> 结束。
不要任何解释，不要 markdown 代码块。

**⚠️ 核心：内容丰富 + 视觉精美 + 交互流畅！发挥你的创意！**`;

  // 心跳保活（用于长时间无输出情况）
  let lastChunkTime = Date.now();
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(async () => {
      const sinceLastChunk = Date.now() - lastChunkTime;
      if (sinceLastChunk > 10000) {
        // 超过 10 秒没有收到内容，发送心跳
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
          await sendEvent({
            type: 'thought',
            iteration: 0,
            content: `⏱️ Gemini 生成中... 已运行 ${elapsed} 秒`
          });
        } catch {
          // 忽略
        }
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

    // 处理流式响应
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
              await sendEvent({
                type: 'html_chunk',
                chunk: content
              });

              // 每 50 个 chunk 报告一次进度
              if (chunkCount % 50 === 0) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                console.log(`[Scrollytelling Agent] Gemini generated ${chunkCount} chunks in ${elapsed}s`);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    // 发送完成信息
    const totalDuration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Scrollytelling Agent] Gemini generation completed in ${totalDuration}s, ${chunkCount} chunks`);

  } catch (error) {
    console.error('[Scrollytelling Agent] Gemini generation error:', error);
    throw error;
  } finally {
    stopHeartbeat();
  }
}
