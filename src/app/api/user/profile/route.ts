/**
 * 用户信息 API
 *
 * GET /api/user/profile
 * 获取当前用户完整信息（包括余额、权限等）
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { IMAGE_MODEL_PRICING } from '@/lib/pricing';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        isAdmin: true,
        balance: true,
        createdAt: true,
        modelPermissions: {
          select: { modelId: true, createdAt: true },
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

    // 获取消费统计
    const consumptionStats = await prisma.consumptionRecord.aggregate({
      where: { userId, amount: { gt: 0 } },
      _sum: { amount: true },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        balance: Number(user.balance),
        createdAt: user.createdAt,
        permissions: user.modelPermissions.map((p) => ({
          modelId: p.modelId,
          modelLabel: IMAGE_MODEL_PRICING[p.modelId]?.originalPrice ?? p.modelId,
          grantedAt: p.createdAt,
        })),
        stats: {
          totalTasks: user._count.imageTasks,
          totalConsumption: Number(consumptionStats._sum.amount ?? 0),
          consumptionCount: consumptionStats._count,
        },
      },
    });
  } catch (error) {
    console.error('[API/user/profile] Error:', error);
    return NextResponse.json({ success: false, error: '获取用户信息失败' }, { status: 500 });
  }
}
