/**
 * 管理员 - 用户详情 API
 *
 * GET /api/admin/users/[userId]
 * 获取指定用户的详细信息（仅管理员可访问）
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // 验证管理员权限
    const cookieStore = await cookies();
    const currentUserId = cookieStore.get('userId')?.value;

    if (!currentUserId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { isAdmin: true },
    });

    if (!currentUser?.isAdmin) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { userId } = await params;

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '10');
    const skip = (page - 1) * limit;

    // 查询用户详情
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        balance: true,
        createdAt: true,
        modelPermissions: {
          select: { modelId: true },
        },
        _count: {
          select: {
            imageTasks: true,
            consumptionRecords: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    // 查询消费记录
    const [consumptionRecords, consumptionTotal, consumptionSum] = await Promise.all([
      prisma.consumptionRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.consumptionRecord.count({
        where: { userId },
      }),
      prisma.consumptionRecord.aggregate({
        where: { userId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        balance: Number(user.balance),
        createdAt: user.createdAt,
        permissions: user.modelPermissions.map((p) => p.modelId),
        taskCount: user._count.imageTasks,
        consumptionCount: user._count.consumptionRecords,
      },
      consumption: {
        records: consumptionRecords.map((r) => ({
          id: r.id,
          type: r.type,
          modelId: r.modelId,
          taskId: r.taskId,
          amount: Number(r.amount),
          balanceBefore: Number(r.balanceBefore),
          balanceAfter: Number(r.balanceAfter),
          description: r.description,
          createdAt: r.createdAt,
        })),
        total: consumptionTotal,
        totalAmount: Number(consumptionSum._sum.amount ?? 0),
      },
    });
  } catch (error) {
    console.error('[API/admin/users/[userId]] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取用户详情失败' },
      { status: 500 }
    );
  }
}
