// 单个对话详情 API

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteConversation } from '@/lib/super-agent/conversation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/super-agent/conversations/[id]
 * 获取单个对话详情
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const conversation = await prisma.superAgentConversation.findUnique({
      where: { id }
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: '对话不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title || '未命名对话',
        messages: JSON.parse(conversation.messages),
        compressedHistory: conversation.compressedHistory,
        totalTokens: conversation.totalTokens,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('[Conversation API] GET error:', error);
    return NextResponse.json(
      { success: false, error: '获取对话详情失败' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/super-agent/conversations/[id]
 * 更新对话（如标题）
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title } = body as { title?: string };

    const updated = await prisma.superAgentConversation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title })
      }
    });

    return NextResponse.json({
      success: true,
      conversation: {
        id: updated.id,
        title: updated.title
      }
    });
  } catch (error) {
    console.error('[Conversation API] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: '更新对话失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/super-agent/conversations/[id]
 * 删除单个对话
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await deleteConversation(id);

    return NextResponse.json({
      success: true,
      message: '对话已删除'
    });
  } catch (error) {
    console.error('[Conversation API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: '删除对话失败' },
      { status: 500 }
    );
  }
}
