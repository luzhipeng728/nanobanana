// 超级智能体 API 路由 - 流式响应

import { NextRequest } from 'next/server';
import { runReActLoop } from '@/lib/super-agent';
import type { SuperAgentStreamEvent } from '@/types/super-agent';
import {
  addChatRound,
  generateResponseSummary,
  getChatHistoryCount,
} from '@/lib/chat-history';

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
    try {
      const body = await request.json();
      const { userRequest, referenceImages, enableDeepResearch, nodeId } = body as {
        userRequest: string;
        referenceImages?: string[];
        enableDeepResearch?: boolean;
        nodeId?: string;  // 节点 ID，用于会话历史
      };

      if (!userRequest || typeof userRequest !== 'string') {
        await sendEvent({
          type: 'error',
          error: '请提供有效的用户需求描述'
        });
        await writer.close();
        return;
      }

      // 获取历史记录数（用于日志）
      let historyCount = 0;
      if (nodeId) {
        historyCount = await getChatHistoryCount(nodeId);
        console.log(`[SuperAgent API] Node ${nodeId} has ${historyCount} rounds of history`);
      }

      console.log('[SuperAgent API] Starting ReAct loop...');
      console.log('[SuperAgent API] User request:', userRequest.substring(0, 100));
      console.log('[SuperAgent API] Reference images:', referenceImages?.length || 0);
      console.log('[SuperAgent API] Deep research enabled:', enableDeepResearch);
      console.log('[SuperAgent API] Node ID:', nodeId || 'none');

      // 运行 ReAct 循环（传入 nodeId）
      const result = await runReActLoop(
        userRequest,
        referenceImages,
        sendEvent,
        { enableDeepResearch, nodeId }
      );

      // 保存会话历史（如果有 nodeId）
      if (nodeId && result.prompts && result.prompts.length > 0 && !isAborted) {
        try {
          const responseSummary = generateResponseSummary(result.prompts);
          await addChatRound(
            nodeId,
            'super-agent',
            userRequest,
            responseSummary,
            {
              prompts: result.prompts,
              matchedSkill: result.matchedSkill || undefined,
              iterationCount: result.iterationCount,
            }
          );
          console.log(`[SuperAgent API] Saved chat round for node ${nodeId}`);
        } catch (err) {
          console.error(`[SuperAgent API] Failed to save chat history:`, err);
        }
      }

      if (!isAborted) {
        console.log('[SuperAgent API] ReAct loop completed');
        console.log('[SuperAgent API] Iterations:', result.iterationCount);
        console.log('[SuperAgent API] Matched skill:', result.matchedSkill);
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
