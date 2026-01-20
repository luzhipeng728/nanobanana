/**
 * 管理员 - 额度申请审核 API
 *
 * GET /api/admin/quota-requests
 * POST /api/admin/quota-requests
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

async function requireAdmin() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) {
    return { error: NextResponse.json({ success: false, error: '未登录' }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, username: true },
  });

  if (!user?.isAdmin) {
    return { error: NextResponse.json({ success: false, error: '无权限' }, { status: 403 }) };
  }

  return { user };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') ?? 'pending';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    const requests = await prisma.quotaRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        reviewedBy: true,
        reviewNote: true,
        user: { select: { id: true, username: true } },
      },
    });

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        reviewedBy: r.reviewedBy,
        reviewNote: r.reviewNote,
        user: r.user,
      })),
    });
  } catch (error) {
    console.error('[API/admin/quota-requests] GET Error:', error);
    return NextResponse.json({ success: false, error: '获取申请失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const requestId = body?.requestId as string | undefined;
    const action = body?.action as 'approve' | 'reject' | undefined;
    const reviewNote = typeof body?.reviewNote === 'string' ? body.reviewNote.trim() : '';

    if (!requestId || !action) {
      return NextResponse.json({ success: false, error: '参数缺失' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.quotaRequest.findUnique({
        where: { id: requestId },
        select: { id: true, amount: true, status: true, userId: true },
      });

      if (!requestRecord) {
        return { error: '申请不存在' };
      }

      if (requestRecord.status !== 'pending') {
        return { error: '申请已处理' };
      }

      if (action === 'reject') {
        await tx.quotaRequest.update({
          where: { id: requestId },
          data: {
            status: 'rejected',
            reviewedBy: auth.user!.username,
            reviewNote: reviewNote || null,
            reviewedAt: new Date(),
          },
        });
        return { approved: false };
      }

      const user = await tx.user.findUnique({
        where: { id: requestRecord.userId },
        select: { balance: true, freeBalance: true },
      });

      if (!user) {
        return { error: '用户不存在' };
      }

      const paidBalanceBefore = Number(user.balance);
      const paidBalanceAfter = paidBalanceBefore + Number(requestRecord.amount);
      const totalBefore = paidBalanceBefore + Number(user.freeBalance);
      const totalAfter = paidBalanceAfter + Number(user.freeBalance);

      await tx.user.update({
        where: { id: requestRecord.userId },
        data: { balance: new Decimal(paidBalanceAfter) },
      });

      await tx.quotaRequest.update({
        where: { id: requestId },
        data: {
          status: 'approved',
          reviewedBy: auth.user!.username,
          reviewNote: reviewNote || null,
          reviewedAt: new Date(),
        },
      });

      await tx.consumptionRecord.create({
        data: {
          userId: requestRecord.userId,
          type: 'quota_grant',
          modelId: 'system',
          amount: new Decimal(-Number(requestRecord.amount)),
          balanceBefore: new Decimal(totalBefore),
          balanceAfter: new Decimal(totalAfter),
          description: '额度申请通过',
        },
      });

      return { approved: true };
    });

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/admin/quota-requests] POST Error:', error);
    return NextResponse.json({ success: false, error: '处理申请失败' }, { status: 500 });
  }
}
