/**
 * 代理兼容的 Anthropic 流处理工具
 *
 * 问题：部分代理（如 DashScope）返回 thinking_delta 类型的 block，
 * 但 Anthropic SDK 不支持，导致流挂死超时。
 *
 * 解决：绕过 SDK，直接 fetch + 手动解析 SSE，过滤掉 thinking 相关事件。
 */

export interface AnthropicStreamParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
  tools?: unknown[];
}

// ============================================================================
// 内部：原始 SSE 事件流（过滤 thinking 块）
// ============================================================================

async function* rawEventStream(params: AnthropicStreamParams): AsyncGenerator<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未配置');

  const baseURL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${baseURL}/v1/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ ...params, stream: true }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentBlockIsThinking = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(dataStr);
      } catch {
        continue;
      }

      const eventType = event.type as string;

      // --- 过滤 thinking 块 ---
      if (eventType === 'content_block_start') {
        const block = event.content_block as { type?: string } | undefined;
        if (block?.type === 'thinking') {
          currentBlockIsThinking = true;
          continue; // 跳过 thinking block 的开始
        }
        currentBlockIsThinking = false;
        yield event;
        continue;
      }

      if (eventType === 'content_block_delta') {
        if (currentBlockIsThinking) continue; // 跳过 thinking delta
        const delta = event.delta as { type?: string } | undefined;
        if (delta?.type === 'thinking_delta') continue;
        yield event;
        continue;
      }

      if (eventType === 'content_block_stop') {
        if (currentBlockIsThinking) {
          currentBlockIsThinking = false;
          continue; // 跳过 thinking block 的结束
        }
        yield event;
        continue;
      }

      // 其他事件（message_start, message_delta, message_stop, ping）直接 yield
      yield event;
    }
  }
}

// ============================================================================
// 1. 纯文字流：只 yield 文字 chunk（最简单，用于无工具调用场景）
// ============================================================================

/**
 * 文字流生成器，自动跳过 thinking_delta，只 yield 实际文字 chunk
 */
export async function* streamAnthropicText(
  params: AnthropicStreamParams
): AsyncGenerator<string> {
  for await (const event of rawEventStream(params)) {
    if (
      event.type === 'content_block_delta' &&
      (event.delta as Record<string, unknown>)?.type === 'text_delta'
    ) {
      yield (event.delta as Record<string, unknown>).text as string;
    }
  }
}

/**
 * 非流式版本：返回完整文字响应
 */
export async function callAnthropicText(params: AnthropicStreamParams): Promise<string> {
  let result = '';
  for await (const chunk of streamAnthropicText(params)) {
    result += chunk;
  }
  return result;
}

// ============================================================================
// 2. 完整事件流：用于工具调用场景（chat-agent、scrollytelling 等）
// ============================================================================

export interface AnthropicFinalMessage {
  id: string;
  model: string;
  content: unknown[];
  stop_reason: string | null;
}

export interface AnthropicStreamHandle extends AsyncIterable<any> {
  finalMessage(): Promise<AnthropicFinalMessage>;
}

/**
 * 完整事件流（过滤 thinking 块），适用于工具调用场景
 * 返回对象同时支持 for-await 迭代和 finalMessage() 调用
 */
export function createAnthropicStream(params: AnthropicStreamParams): AnthropicStreamHandle {
  let messageId = '';
  let messageModel = '';
  let stopReason: string | null = null;
  const contentBlocks: unknown[] = [];
  let currentText = '';
  let currentToolInput = '';
  let currentBlockIndex = -1;

  async function* generator(): AsyncGenerator<Record<string, unknown>> {
    for await (const event of rawEventStream(params)) {
      const eventType = event.type as string;

      // 收集数据用于 finalMessage()
      if (eventType === 'message_start') {
        const msg = (event.message || event) as Record<string, unknown>;
        messageId = (msg.id as string) || '';
        messageModel = (msg.model as string) || params.model;
      }

      if (eventType === 'message_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason as string;
      }

      if (eventType === 'content_block_start') {
        const block = event.content_block as Record<string, unknown>;
        currentBlockIndex = event.index as number ?? contentBlocks.length;
        currentText = '';
        currentToolInput = '';
        if (block.type === 'text') {
          contentBlocks.push({ type: 'text', text: '' });
        } else if (block.type === 'tool_use') {
          contentBlocks.push({ type: 'tool_use', id: block.id, name: block.name, input: {} });
        }
      }

      if (eventType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>;
        if (delta.type === 'text_delta') {
          currentText += delta.text as string;
          const lastBlock = contentBlocks[contentBlocks.length - 1] as Record<string, unknown> | undefined;
          if (lastBlock?.type === 'text') {
            lastBlock.text = (lastBlock.text as string) + (delta.text as string);
          }
        } else if (delta.type === 'input_json_delta') {
          currentToolInput += delta.partial_json as string;
        }
      }

      if (eventType === 'content_block_stop') {
        if (currentToolInput) {
          const lastBlock = contentBlocks[contentBlocks.length - 1] as Record<string, unknown> | undefined;
          if (lastBlock?.type === 'tool_use') {
            try {
              lastBlock.input = JSON.parse(currentToolInput);
            } catch {
              lastBlock.input = {};
            }
          }
          currentToolInput = '';
        }
      }

      yield event;
    }
  }

  const gen = generator();

  return {
    [Symbol.asyncIterator]: () => gen,
    finalMessage: async () => {
      // 如果还没迭代完，先消费剩余事件
      for await (const _ of gen) { /* drain */ }
      return {
        id: messageId,
        model: messageModel,
        content: contentBlocks,
        stop_reason: stopReason,
      };
    },
  };
}
