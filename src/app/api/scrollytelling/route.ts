// Scrollytelling HTML 生成 API - 两阶段流式响应
// 阶段1: Claude Agent 分析图片、收集材料、规划结构
// 阶段2: Gemini 根据 Claude 准备的 prompt 生成 HTML

import { NextRequest } from 'next/server';
import {
  ImageInfo,
  ScrollytellingStreamEvent,
  ScrollytellingAgentConfig,
  runScrollytellingAgent,
  generateHtmlWithGemini
} from '@/lib/scrollytelling-agent';

export const maxDuration = 300; // 5分钟超时

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // 创建流式响应
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 跟踪连接状态
  let isAborted = false;

  // 监听请求中断
  request.signal.addEventListener('abort', () => {
    isAborted = true;
    console.log('[Scrollytelling API] Request aborted by client');
  });

  // 发送事件的辅助函数
  const sendEvent = async (event: ScrollytellingStreamEvent) => {
    if (isAborted) return;
    try {
      // SSE 格式
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch (error) {
      console.error('[Scrollytelling API] Write error:', error);
      isAborted = true;
    }
  };

  // 异步处理
  (async () => {
    try {
      const body = await request.json();
      const { images, prompts, theme } = body as {
        images: string[];   // 图片 URL 数组
        prompts?: string[]; // 图片描述数组（与 images 对应）
        theme?: string;     // 可选的主题描述
      };

      if (!images || !Array.isArray(images) || images.length === 0) {
        await sendEvent({ type: 'error', error: '请提供至少一张图片' });
        await writer.close();
        return;
      }

      console.log('[Scrollytelling API] Starting two-phase generation...');
      console.log('[Scrollytelling API] Images count:', images.length);
      console.log('[Scrollytelling API] Has prompts:', !!prompts && prompts.length > 0);
      console.log('[Scrollytelling API] Theme:', theme || 'auto');

      // 构建图片信息
      const imageInfos: ImageInfo[] = images.map((url, i) => ({
        url,
        prompt: prompts?.[i] || undefined
      }));

      // Agent 配置
      const agentConfig: ScrollytellingAgentConfig = {
        theme,
        enableSearch: true,
        maxSearchQueries: images.length * 2
      };

      // ========== 阶段1: Claude Agent 收集材料 ==========
      console.log('[Scrollytelling API] Phase 1: Running Claude Agent...');

      const agentResult = await runScrollytellingAgent(
        imageInfos,
        agentConfig,
        sendEvent
      );

      if (!agentResult) {
        await sendEvent({ type: 'error', error: 'Claude Agent 未能完成材料收集' });
        await writer.close();
        return;
      }

      console.log('[Scrollytelling API] Phase 1 complete. Prompt length:', agentResult.finalPrompt.length);

      // ========== 阶段2: Gemini 生成 HTML ==========
      console.log('[Scrollytelling API] Phase 2: Generating HTML with Gemini...');

      await generateHtmlWithGemini(
        agentResult.finalPrompt,
        imageInfos,
        sendEvent
      );

      // 发送完成事件
      await sendEvent({
        type: 'complete',
        htmlLength: 0 // 客户端会自行计算
      });

      console.log('[Scrollytelling API] Generation completed');

    } catch (error) {
      if (!isAborted) {
        console.error('[Scrollytelling API] Error:', error);
        await sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        });
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // 忽略关闭错误
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
