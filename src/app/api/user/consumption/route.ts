/**
 * 用户消费记录 API
 *
 * GET /api/user/consumption
 * 获取当前用户消费记录
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getConsumptionRecords } from '@/lib/billing';
import { CONSUMPTION_TYPE_LABELS, IMAGE_MODEL_PRICING } from '@/lib/pricing';
import type { ConsumptionType } from '@/lib/pricing';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');
    const type = searchParams.get('type') as ConsumptionType | null;

    const offset = (page - 1) * limit;

    const result = await getConsumptionRecords(userId, {
      limit,
      offset,
      type: type ?? undefined,
    });

    // 格式化记录
    const records = result.records.map((r) => ({
      id: r.id,
      type: r.type,
      typeLabel: CONSUMPTION_TYPE_LABELS[r.type as ConsumptionType] ?? r.type,
      modelId: r.modelId,
      modelLabel: IMAGE_MODEL_PRICING[r.modelId]?.originalPrice ?? r.modelId,
      taskId: r.taskId,
      amount: r.amount,
      balanceBefore: r.balanceBefore,
      balanceAfter: r.balanceAfter,
      description: r.description,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({
      success: true,
      records,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error('[API/user/consumption] Error:', error);
    return NextResponse.json({ success: false, error: '获取消费记录失败' }, { status: 500 });
  }
}
