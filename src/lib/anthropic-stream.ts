/**
 * 代理兼容的 Anthropic 文字流生成器
 *
 * 问题：部分代理（如 DashScope）会在流中返回 thinking_delta 类型的 block，
 * 但 Anthropic SDK 不支持该类型，导致流挂死超时。
 *
 * 解决：绕过 SDK，直接用 fetch 解析 SSE，只取 text_delta。
 */

export interface AnthropicStreamParams {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: string | unknown[] }>;
}

/**
 * 生成文字流（自动跳过 thinking_delta，兼容各类代理）
 * 只 yield 实际文字 chunk
 */
export async function* streamAnthropicText(
  params: AnthropicStreamParams
): AsyncGenerator<string> {
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

      try {
        const event = JSON.parse(dataStr);
        // 只处理 text_delta，忽略 thinking_delta 等其他类型
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta?.text
        ) {
          yield event.delta.text as string;
        }
      } catch {
        // 忽略 JSON 解析错误
      }
    }
  }
}

/**
 * 非流式版本：获取完整文字响应
 */
export async function callAnthropicText(params: AnthropicStreamParams): Promise<string> {
  let result = '';
  for await (const chunk of streamAnthropicText(params)) {
    result += chunk;
  }
  return result;
}
