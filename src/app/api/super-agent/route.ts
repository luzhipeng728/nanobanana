// 超级智能体 API 路由 - 流式响应

import { NextRequest } from 'next/server';
import { runReActLoop } from '@/lib/super-agent';
import { ConversationManager, type ConversationMessage } from '@/lib/super-agent/conversation';
import type { SuperAgentStreamEvent } from '@/types/super-agent';

export const maxDuration = 300; // 5 分钟超时

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
    console.log('[SuperAgent API] Request aborted by client');
  });

  // 发送事件的辅助函数（带中断检查）
  const sendEvent = async (event: SuperAgentStreamEvent) => {
    if (isAborted) {
      return; // 连接已中断，不再发送
    }
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch (error) {
      // 静默处理连接中断错误
      if (error instanceof Error && error.name === 'ResponseAborted') {
        isAborted = true;
      } else {
        console.error('[SuperAgent API] Error sending event:', error);
      }
    }
  };

  // 异步处理
  (async () => {
    let conversationManager: ConversationManager | null = null;

    try {
      const body = await request.json();
      const { userRequest, referenceImages, enableDeepResearch, reasoningEffort, conversationId } = body as {
        userRequest: string;
        referenceImages?: string[];
        enableDeepResearch?: boolean;
        reasoningEffort?: 'low' | 'medium' | 'high';  // 深度研究强度
        conversationId?: string;  // 支持多轮对话
      };

      if (!userRequest || typeof userRequest !== 'string') {
        await sendEvent({
          type: 'error',
          error: '请提供有效的用户需求描述'
        });
        await writer.close();
        return;
      }

      console.log('[SuperAgent API] Starting ReAct loop...');
      console.log('[SuperAgent API] User request:', userRequest.substring(0, 100));
      console.log('[SuperAgent API] Reference images:', referenceImages?.length || 0);
      console.log('[SuperAgent API] Deep research enabled:', enableDeepResearch);
      console.log('[SuperAgent API] Reasoning effort:', reasoningEffort || 'low');
      console.log('[SuperAgent API] Conversation ID:', conversationId || 'new');

      // 初始化对话管理器
      conversationManager = new ConversationManager(conversationId);
      const conversationState = await conversationManager.getOrCreate();

      // 获取历史消息（用于 Claude API）
      const historyMessages = await conversationManager.getMessagesForClaude();

      console.log('[SuperAgent API] Conversation history:', historyMessages.length, 'messages');
      console.log('[SuperAgent API] Current tokens:', conversationState.totalTokens);

      // 发送对话状态事件
      await sendEvent({
        type: 'conversation_state',
        conversationId: conversationManager.getId(),
        totalTokens: conversationState.totalTokens,
        hasCompressedHistory: !!conversationState.compressedHistory
      } as any);

      // 添加用户消息到对话
      const userMessage: ConversationMessage = {
        role: 'user',
        content: userRequest,
        timestamp: Date.now(),
        metadata: referenceImages?.length ? { searchResults: referenceImages.map(url => ({ type: 'reference_image', url })) } : undefined
      };
      await conversationManager.addMessage(userMessage);

      // 运行 ReAct 循环
      const result = await runReActLoop(
        userRequest,
        referenceImages,
        sendEvent,
        {
          enableDeepResearch,
          reasoningEffort: reasoningEffort || 'low',  // 传递研究强度
          conversationId: conversationManager.getId(),
          historyMessages
        }
      );

      if (!isAborted) {
        console.log('[SuperAgent API] ReAct loop completed');
        console.log('[SuperAgent API] Iterations:', result.iterationCount);
        console.log('[SuperAgent API] Matched skill:', result.matchedSkill);

        // 保存助手回复到对话
        const assistantMessage: ConversationMessage = {
          role: 'assistant',
          content: JSON.stringify({
            prompts: result.prompts,
            matchedSkill: result.matchedSkill,
            iterationCount: result.iterationCount
          }),
          timestamp: Date.now(),
        };
        await conversationManager.addMessage(assistantMessage);

        // 发送更新后的对话状态
        await sendEvent({
          type: 'conversation_state',
          conversationId: conversationManager.getId(),
          totalTokens: conversationManager.getTotalTokens(),
          hasCompressedHistory: !!conversationState.compressedHistory
        });
      }

    } catch (error) {
      if (!isAborted) {
        console.error('[SuperAgent API] Error:', error);
        await sendEvent({
          type: 'error',
          error: error instanceof Error ? error.message : '处理请求时发生未知错误'
        });
      }
    } finally {
      try {
        await writer.close();
      } catch (e) {
        // 忽略关闭错误
      }
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// 获取技能列表的 GET 端点
export async function GET() {
  const { getSkillsSummary } = await import('@/lib/super-agent');
  const skills = getSkillsSummary();

  return Response.json({
    success: true,
    skills: skills.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category
    }))
  });
}
