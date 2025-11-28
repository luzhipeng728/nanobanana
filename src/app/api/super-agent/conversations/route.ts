// 对话历史管理 API

import { NextRequest, NextResponse } from 'next/server';
import { getUserConversations, deleteConversation } from '@/lib/super-agent/conversation';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/super-agent/conversations
 * 获取对话列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const userId = searchParams.get('userId') || undefined;

    const conversations = await getUserConversations(userId, limit);

    return NextResponse.json({
      success: true,
      conversations: conversations.map(conv => ({
        id: conv.id,
        title: conv.title || '未命名对话',
        totalTokens: conv.totalTokens,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('[Conversations API] GET error:', error);
    return NextResponse.json(
      { success: false, error: '获取对话列表失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/super-agent/conversations
 * 删除对话（通过 query param id）
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: '请提供对话 ID' },
        { status: 400 }
      );
    }

    await deleteConversation(conversationId);

    return NextResponse.json({
      success: true,
      message: '对话已删除'
    });
  } catch (error) {
    console.error('[Conversations API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: '删除对话失败' },
      { status: 500 }
    );
  }
}
