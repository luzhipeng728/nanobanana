// 会话历史 API 端点
// GET: 获取节点的会话历史信息
// DELETE: 清除节点的会话历史

import { NextRequest, NextResponse } from 'next/server';
import {
  getChatHistory,
  getChatHistoryCount,
  clearChatHistory,
} from '@/lib/chat-history';

// GET /api/chat-history?nodeId=xxx
// 获取节点的会话历史信息
export async function GET(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get('nodeId');

  if (!nodeId) {
    return NextResponse.json(
      { success: false, error: '缺少 nodeId 参数' },
      { status: 400 }
    );
  }

  try {
    const count = await getChatHistoryCount(nodeId);
    const history = await getChatHistory(nodeId);

    return NextResponse.json({
      success: true,
      nodeId,
      count,
      history: history.map(h => ({
        roundNumber: h.roundNumber,
        userMessage: h.userMessage.substring(0, 100) + (h.userMessage.length > 100 ? '...' : ''),
        assistantResponse: h.assistantResponse,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    console.error('[ChatHistory API] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取历史记录失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/chat-history?nodeId=xxx
// 清除节点的会话历史
export async function DELETE(request: NextRequest) {
  const nodeId = request.nextUrl.searchParams.get('nodeId');

  if (!nodeId) {
    return NextResponse.json(
      { success: false, error: '缺少 nodeId 参数' },
      { status: 400 }
    );
  }

  try {
    const deleted = await clearChatHistory(nodeId);

    return NextResponse.json({
      success: true,
      nodeId,
      deleted,
      message: deleted ? '历史记录已清除' : '没有历史记录需要清除',
    });
  } catch (error) {
    console.error('[ChatHistory API] Error:', error);
    return NextResponse.json(
      { success: false, error: '清除历史记录失败' },
      { status: 500 }
    );
  }
}
