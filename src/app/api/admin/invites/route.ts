/**
 * 管理员 - 邀请码管理 API
 *
 * GET /api/admin/invites
 * POST /api/admin/invites
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

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
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);

    const invites = await prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        code: true,
        note: true,
        isActive: true,
        createdAt: true,
        usedAt: true,
        createdBy: { select: { username: true } },
        usedBy: { select: { username: true, id: true } },
      },
    });

    return NextResponse.json({
      success: true,
      invites: invites.map((i) => ({
        id: i.id,
        code: i.code,
        note: i.note,
        isActive: i.isActive,
        createdAt: i.createdAt,
        usedAt: i.usedAt,
        createdBy: i.createdBy.username,
        usedBy: i.usedBy ? { id: i.usedBy.id, username: i.usedBy.username } : null,
      })),
    });
  } catch (error) {
    console.error('[API/admin/invites] GET Error:', error);
    return NextResponse.json({ success: false, error: '获取邀请码失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    let invite: { id: string; code: string; note: string | null; createdAt: Date } | null = null;
    for (let i = 0; i < 5; i += 1) {
      const code = generateInviteCode();
      try {
        invite = await prisma.inviteCode.create({
          data: {
            code,
            note: note || null,
            createdById: auth.user!.id,
          },
          select: {
            id: true,
            code: true,
            note: true,
            createdAt: true,
          },
        });
        break;
      } catch (error) {
        // Ignore duplicate and retry
        if (i === 4) throw error;
      }
    }

    if (!invite) {
      return NextResponse.json({ success: false, error: '创建邀请码失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, invite });
  } catch (error) {
    console.error('[API/admin/invites] POST Error:', error);
    return NextResponse.json({ success: false, error: '创建邀请码失败' }, { status: 500 });
  }
}
