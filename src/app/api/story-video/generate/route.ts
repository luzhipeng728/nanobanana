/**
 * 启动故事视频生成 API (SSE 流式)
 */

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { StoryVideoEngine } from '@/lib/story-video/engine';
import type { StoryVideoConfig, StoryVideoEvent } from '@/lib/story-video/types';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId } = body;

  if (!projectId) {
    return new Response(
      JSON.stringify({ success: false, error: 'projectId is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 获取项目
  const project = await prisma.storyVideoProject.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return new Response(
      JSON.stringify({ success: false, error: 'Project not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 创建 SSE 响应
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 事件发送函数
  const sendEvent = async (event: StoryVideoEvent) => {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      await writer.write(encoder.encode(data));
    } catch (error) {
      console.error('[SSE] Write error:', error);
    }
  };

  // 配置
  const config: Partial<StoryVideoConfig> = {
    contentType: project.contentType as any,
    artStyle: project.artStyle,
    aspectRatio: project.aspectRatio as any,
    qualityMode: project.qualityMode as any,
    voiceId: project.voiceId || undefined,
    bgmStyle: project.bgmStyle || undefined,
  };

  // 启动引擎
  const engine = new StoryVideoEngine(projectId, config, sendEvent);

  // 异步执行生成
  (async () => {
    try {
      await engine.generate(project.story);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await sendEvent({
        type: 'error',
        message: errorMsg,
        timestamp: Date.now(),
      });
    } finally {
      await writer.close();
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
