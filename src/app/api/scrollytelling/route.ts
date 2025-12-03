// Reveal.js 演示文稿生成 API - 三阶段流式响应
// 阶段1: Claude Agent 分析参考图片、规划结构、收集材料
// 阶段2: 并发生成 AI 图片（nanobanana pro）
// 阶段3: Gemini 生成 reveal.js HTML
// 修改模式: 跳过阶段1和2，直接让 Gemini 修改

import { NextRequest } from 'next/server';
import {
  ImageInfo,
  ScrollytellingStreamEvent,
  ScrollytellingAgentConfig,
  runScrollytellingAgent,
  generateHtmlWithGemini,
  modifyHtmlWithGemini
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
    console.log('[Presentation API] Request aborted by client');
  });

  // 发送事件的辅助函数
  const sendEvent = async (event: ScrollytellingStreamEvent) => {
    if (isAborted) return;
    try {
      // SSE 格式
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch (error) {
      console.error('[Presentation API] Write error:', error);
      isAborted = true;
    }
  };

  // 异步处理
  (async () => {
    try {
      const body = await request.json();
      const {
        images = [],
        prompts,
        theme,
        userPrompt,  // 无图片模式的用户提示词
        // 修改模式参数
        modification,
        previousHtml,
        // 图片分辨率
        imageResolution = '1k'
      } = body as {
        images?: string[];
        prompts?: string[];
        theme?: string;
        userPrompt?: string;
        modification?: string;
        previousHtml?: string;
        imageResolution?: '1k' | '2k' | '4k';
      };

      // 验证：有图片 或 有用户提示词（无图片模式）
      const hasImages = images && Array.isArray(images) && images.length > 0;
      const hasUserPrompt = userPrompt && typeof userPrompt === 'string' && userPrompt.trim().length > 0;

      if (!hasImages && !hasUserPrompt) {
        await sendEvent({ type: 'error', error: '请提供参考图片或输入主题描述' });
        await writer.close();
        return;
      }

      // 构建图片信息
      const imageInfos: ImageInfo[] = images.map((url, i) => ({
        url,
        prompt: prompts?.[i] || undefined
      }));

      // ========== 修改模式：跳过 Claude Agent 和图片生成 ==========
      if (modification && previousHtml) {
        console.log('[Presentation API] Modification mode: Skipping Agent and image generation...');

        await sendEvent({
          type: 'phase',
          phase: 'generation',
          message: 'Gemini 正在根据您的要求修改...'
        });

        await modifyHtmlWithGemini(
          previousHtml,
          modification,
          imageInfos,
          sendEvent
        );

        await sendEvent({
          type: 'complete',
          htmlLength: 0
        });

        console.log('[Presentation API] Modification completed');
        await writer.close();
        return;
      }

      // ========== 正常模式：三阶段生成 ==========
      console.log('[Presentation API] Starting three-phase generation...');
      console.log('[Presentation API] Mode:', hasImages ? 'With images' : 'No images (deep research)');
      console.log('[Presentation API] Reference images count:', images.length);
      console.log('[Presentation API] Theme:', theme || 'auto');
      console.log('[Presentation API] User prompt:', userPrompt || '(none)');
      console.log('[Presentation API] Image resolution:', imageResolution);

      // Agent 配置
      const agentConfig: ScrollytellingAgentConfig = {
        theme,
        userPrompt: userPrompt || undefined,  // 无图片模式的用户提示词
        enableSearch: true,
        maxSearchQueries: hasImages ? images.length * 2 : 8,  // 无图片模式需要更多搜索
        imageResolution
      };

      // ========== 阶段1 & 2: Claude Agent + 图片生成 ==========
      console.log('[Presentation API] Phase 1 & 2: Running Claude Agent and generating images...');

      const agentResult = await runScrollytellingAgent(
        imageInfos,
        agentConfig,
        sendEvent
      );

      if (!agentResult) {
        await sendEvent({ type: 'error', error: 'Claude Agent 未能完成任务' });
        await writer.close();
        return;
      }

      console.log('[Presentation API] Phase 1 & 2 complete.');
      console.log('[Presentation API] Slides:', agentResult.structurePlan.slides.length);
      console.log('[Presentation API] Generated images:', agentResult.generatedImages.length);

      // 构建图片 URL Map
      const generatedImageUrls = new Map<number, string>();
      agentResult.structurePlan.slides.forEach((slide, index) => {
        if (slide.imageConfig?.generatedUrl) {
          generatedImageUrls.set(index, slide.imageConfig.generatedUrl);
        }
      });

      // ========== 阶段3: Gemini 生成 reveal.js HTML ==========
      console.log('[Presentation API] Phase 3: Generating reveal.js HTML with Gemini...');

      await generateHtmlWithGemini(
        agentResult.finalPrompt,
        imageInfos,
        generatedImageUrls,
        sendEvent
      );

      // 发送完成事件
      await sendEvent({
        type: 'complete',
        htmlLength: 0
      });

      console.log('[Presentation API] Generation completed');

    } catch (error) {
      if (!isAborted) {
        console.error('[Presentation API] Error:', error);
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
