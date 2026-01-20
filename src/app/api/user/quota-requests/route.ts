/**
 * 用户额度申请 API
 *
 * GET /api/user/quota-requests
 * POST /api/user/quota-requests
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const requests = await prisma.quotaRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      requests: requests.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        reason: r.reason,
        status: r.status,
        reviewNote: r.reviewNote,
        reviewedBy: r.reviewedBy,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
      })),
    });
  } catch (error) {
    console.error('[API/user/quota-requests] GET Error:', error);
    return NextResponse.json({ success: false, error: '获取申请记录失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const amount = Number(body?.amount);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: '申请额度必须大于 0' }, { status: 400 });
    }

    const requestRecord = await prisma.quotaRequest.create({
      data: {
        userId,
        amount: new Decimal(amount),
        reason: reason || null,
      },
    });

    return NextResponse.json({
      success: true,
      request: {
        id: requestRecord.id,
        amount: Number(requestRecord.amount),
        status: requestRecord.status,
        createdAt: requestRecord.createdAt,
      },
    });
  } catch (error) {
    console.error('[API/user/quota-requests] POST Error:', error);
    return NextResponse.json({ success: false, error: '提交申请失败' }, { status: 500 });
  }
}
