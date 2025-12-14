/**
 * 用户余额 API
 *
 * GET /api/user/balance
 * 获取当前用户余额
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserBalance } from '@/lib/billing';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const balance = await getUserBalance(userId);

    return NextResponse.json({
      success: true,
      balance,
    });
  } catch (error) {
    console.error('[API/user/balance] Error:', error);
    return NextResponse.json({ success: false, error: '获取余额失败' }, { status: 500 });
  }
}
