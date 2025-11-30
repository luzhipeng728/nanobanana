// 页面访问统计 API

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST - 记录访问并返回当前计数
export async function POST(request: NextRequest) {
  try {
    const { page } = await request.json();

    if (!page || typeof page !== 'string') {
      return NextResponse.json({ error: '缺少页面路径' }, { status: 400 });
    }

    // 规范化页面路径
    const normalizedPage = page.startsWith('/') ? page : `/${page}`;

    // 使用 upsert 原子操作：存在则 +1，不存在则创建
    const pageView = await prisma.pageView.upsert({
      where: { page: normalizedPage },
      update: { count: { increment: 1 } },
      create: { page: normalizedPage, count: 1 },
    });

    return NextResponse.json({
      success: true,
      page: pageView.page,
      count: pageView.count,
    });
  } catch (error) {
    console.error('[PageView] Error recording view:', error);
    return NextResponse.json({ error: '记录失败' }, { status: 500 });
  }
}

// GET - 获取页面访问统计（支持单个或多个页面）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page');
    const all = searchParams.get('all');

    // 获取所有页面统计
    if (all === 'true') {
      const views = await prisma.pageView.findMany({
        orderBy: { count: 'desc' },
      });

      const total = views.reduce((sum, v) => sum + v.count, 0);

      return NextResponse.json({
        success: true,
        total,
        pages: views.map(v => ({
          page: v.page,
          count: v.count,
          lastVisit: v.updatedAt,
        })),
      });
    }

    // 获取单个页面统计
    if (page) {
      const normalizedPage = page.startsWith('/') ? page : `/${page}`;
      const pageView = await prisma.pageView.findUnique({
        where: { page: normalizedPage },
      });

      return NextResponse.json({
        success: true,
        page: normalizedPage,
        count: pageView?.count || 0,
      });
    }

    return NextResponse.json({ error: '请提供 page 参数或 all=true' }, { status: 400 });
  } catch (error) {
    console.error('[PageView] Error fetching stats:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
