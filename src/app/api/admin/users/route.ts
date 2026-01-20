/**
 * 管理员 - 用户列表 API
 *
 * GET /api/admin/users
 * 获取所有用户列表（仅管理员可访问）
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // 验证管理员权限
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!currentUser?.isAdmin) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '20');
    const search = searchParams.get('search') ?? '';

    const skip = (page - 1) * limit;

    // 查询用户列表
    const where = search
      ? { username: { contains: search } }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          isAdmin: true,
          balance: true,
          freeBalance: true,
          freeBalanceUpdatedAt: true,
          remark: true,
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        isAdmin: u.isAdmin,
        balance: Number(u.balance) + Number(u.freeBalance),
        paidBalance: Number(u.balance),
        freeBalance: Number(u.freeBalance),
        freeBalanceUpdatedAt: u.freeBalanceUpdatedAt,
        remark: u.remark,
        createdAt: u.createdAt,
        permissions: u.modelPermissions.map((p) => p.modelId),
        taskCount: u._count.imageTasks,
        consumptionCount: u._count.consumptionRecords,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[API/admin/users] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取用户列表失败' },
      { status: 500 }
    );
  }
}
