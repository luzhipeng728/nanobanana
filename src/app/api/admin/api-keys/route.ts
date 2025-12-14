/**
 * 管理员 - API Key 管理
 *
 * GET    /api/admin/api-keys          获取所有 API Key
 * POST   /api/admin/api-keys          添加新 API Key
 * PUT    /api/admin/api-keys          更新 API Key
 * DELETE /api/admin/api-keys?id=xxx   删除 API Key
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { clearApiKeyCache, type ApiKeyProvider } from '@/lib/api-keys';

// 验证管理员权限
async function verifyAdmin(): Promise<{ success: true; userId: string } | { success: false; error: string; status: number }> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) {
    return { success: false, error: '未登录', status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) {
    return { success: false, error: '无权限', status: 403 };
  }

  return { success: true, userId };
}

// GET - 获取所有 API Key
export async function GET() {
  const auth = await verifyAdmin();
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: [
        { provider: 'asc' },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        provider: true,
        key: true,
        name: true,
        isActive: true,
        priority: true,
        usageCount: true,
        lastUsedAt: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 对 key 进行脱敏处理（只显示前 8 位和后 4 位）
    const maskedKeys = keys.map(k => ({
      ...k,
      key: k.key.length > 12
        ? `${k.key.substring(0, 8)}...${k.key.substring(k.key.length - 4)}`
        : '***',
      fullKey: k.key, // 完整 key 也返回，用于复制
    }));

    return NextResponse.json({ success: true, keys: maskedKeys });
  } catch (error) {
    console.error('[API/admin/api-keys] GET Error:', error);
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 });
  }
}

// POST - 添加新 API Key
export async function POST(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { provider, key, name, priority = 0 } = body;

    if (!provider || !key) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 验证 provider
    if (!['gemini', 'seedream'].includes(provider)) {
      return NextResponse.json({ success: false, error: '无效的 provider' }, { status: 400 });
    }

    // 检查 key 是否已存在
    const existing = await prisma.apiKey.findFirst({
      where: { provider, key },
    });

    if (existing) {
      return NextResponse.json({ success: false, error: '该 API Key 已存在' }, { status: 400 });
    }

    const newKey = await prisma.apiKey.create({
      data: {
        provider,
        key,
        name: name || null,
        priority: parseInt(priority) || 0,
        isActive: true,
      },
    });

    // 清除缓存
    clearApiKeyCache(provider as ApiKeyProvider);

    return NextResponse.json({
      success: true,
      key: {
        id: newKey.id,
        provider: newKey.provider,
        name: newKey.name,
        priority: newKey.priority,
        isActive: newKey.isActive,
      },
    });
  } catch (error) {
    console.error('[API/admin/api-keys] POST Error:', error);
    return NextResponse.json({ success: false, error: '添加失败' }, { status: 500 });
  }
}

// PUT - 更新 API Key
export async function PUT(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { id, name, priority, isActive } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    }

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'API Key 不存在' }, { status: 404 });
    }

    const updated = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(priority !== undefined && { priority: parseInt(priority) || 0 }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    // 清除缓存
    clearApiKeyCache(existing.provider as ApiKeyProvider);

    return NextResponse.json({ success: true, key: updated });
  } catch (error) {
    console.error('[API/admin/api-keys] PUT Error:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

// DELETE - 删除 API Key
export async function DELETE(request: Request) {
  const auth = await verifyAdmin();
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    }

    const existing = await prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'API Key 不存在' }, { status: 404 });
    }

    await prisma.apiKey.delete({ where: { id } });

    // 清除缓存
    clearApiKeyCache(existing.provider as ApiKeyProvider);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API/admin/api-keys] DELETE Error:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}
