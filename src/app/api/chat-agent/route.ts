// Chat Agent API 路由 - SSE 流式响应

import { NextRequest, NextResponse } from 'next/server';
import {
  createSSEStream,
  clearSessionContext,
  getSessionState,
  generateSessionId,
} from '@/lib/chat-agent/sse-handler';
import type { ClientChatMessage } from '@/lib/chat-agent/types';

// 设置较长的超时时间（5 分钟）
export const maxDuration = 300;

// 不使用 Edge Runtime，因为需要 Anthropic SDK
export const runtime = 'nodejs';

/**
 * POST - 发送消息并获取流式响应
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求体
    const { content, attachments, settings, sessionId } = body as {
      content: string;
      attachments?: Array<{
        type: 'image' | 'document';
        url?: string;
        content?: string;
        filename?: string;
      }>;
      settings?: {
        enableDeepResearch?: boolean;
      };
      sessionId?: string;
    };

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: '消息内容不能为空' },
        { status: 400 }
      );
    }

    // 使用提供的 sessionId 或生成新的
    const currentSessionId = sessionId || generateSessionId();

    // 构建请求对象
    const chatMessage: ClientChatMessage = {
      type: 'message',
      content,
      attachments: attachments?.map(a => ({
        type: a.type,
        url: a.url,
        content: a.content,
        filename: a.filename,
      })),
      settings: {
        enableDeepResearch: settings?.enableDeepResearch ?? false,
      },
    };

    // 创建 AbortController
    const abortController = new AbortController();

    // 监听请求中断
    request.signal.addEventListener('abort', () => {
      abortController.abort();
    });

    // 创建 SSE 流
    const stream = createSSEStream(
      chatMessage,
      currentSessionId,
      abortController.signal
    );

    // 返回流式响应
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Session-Id': currentSessionId,
      },
    });
  } catch (error) {
    console.error('Chat Agent API 错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 清除会话上下文
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: '需要提供 sessionId' },
        { status: 400 }
      );
    }

    const cleared = clearSessionContext(sessionId);

    return NextResponse.json({
      success: true,
      cleared,
      sessionId,
    });
  } catch (error) {
    console.error('清除会话错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * GET - 获取会话状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      // 返回新的 sessionId
      return NextResponse.json({
        sessionId: generateSessionId(),
        isNew: true,
      });
    }

    const state = getSessionState(sessionId);

    if (!state) {
      return NextResponse.json({
        sessionId,
        exists: false,
        tokens: 0,
        messageCount: 0,
      });
    }

    return NextResponse.json({
      sessionId,
      exists: true,
      ...state,
    });
  } catch (error) {
    console.error('获取会话状态错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
