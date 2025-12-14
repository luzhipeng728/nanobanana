/**
 * 管理员 - 权限管理 API
 *
 * POST /api/admin/permissions - 添加用户模型权限
 * DELETE /api/admin/permissions - 删除用户模型权限
 * GET /api/admin/permissions - 获取所有权限列表
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/** 验证管理员权限 */
async function verifyAdmin(): Promise<{ success: boolean; userId?: string; error?: string }> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) {
    return { success: false, error: '未登录' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, username: true },
  });

  if (!user?.isAdmin) {
    return { success: false, error: '无权限' };
  }

  return { success: true, userId };
}

/**
 * 获取所有权限列表
 */
export async function GET() {
  try {
    const auth = await verifyAdmin();
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.error === '未登录' ? 401 : 403 });
    }

    const permissions = await prisma.userModelPermission.findMany({
      include: {
        user: {
          select: { username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      permissions: permissions.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user.username,
        modelId: p.modelId,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('[API/admin/permissions] GET Error:', error);
    return NextResponse.json({ success: false, error: '获取权限列表失败' }, { status: 500 });
  }
}

/**
 * 添加用户模型权限
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyAdmin();
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.error === '未登录' ? 401 : 403 });
    }

    const body = await request.json();
    const { userId, modelId } = body;

    if (!userId || !modelId) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    // 添加权限（如果已存在则忽略）
    const permission = await prisma.userModelPermission.upsert({
      where: { userId_modelId: { userId, modelId } },
      update: {},
      create: { userId, modelId },
    });

    return NextResponse.json({
      success: true,
      permission: {
        id: permission.id,
        userId: permission.userId,
        modelId: permission.modelId,
        createdAt: permission.createdAt,
      },
    });
  } catch (error) {
    console.error('[API/admin/permissions] POST Error:', error);
    return NextResponse.json({ success: false, error: '添加权限失败' }, { status: 500 });
  }
}

/**
 * 删除用户模型权限
 */
export async function DELETE(request: Request) {
  try {
    const auth = await verifyAdmin();
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.error === '未登录' ? 401 : 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const modelId = searchParams.get('modelId');

    if (!userId || !modelId) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    // 删除权限
    await prisma.userModelPermission.deleteMany({
      where: { userId, modelId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/admin/permissions] DELETE Error:', error);
    return NextResponse.json({ success: false, error: '删除权限失败' }, { status: 500 });
  }
}
