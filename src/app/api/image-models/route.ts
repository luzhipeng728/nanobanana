/**
 * 图片生成模型列表 API
 *
 * GET /api/image-models
 * 返回当前用户可用的图片生成模型及其能力信息
 *
 * 权限机制：
 * - 基础模型（nano-banana, seedream-4.5）：所有登录用户可用
 * - 高级模型（nano-banana-pro）：需要在 UserModelPermission 表中有授权记录
 *
 * 响应格式：
 * {
 *   models: [
 *     { id: 'nano-banana', label: 'Gemini 快速', adapter: 'gemini', supportsReferenceImages: true },
 *     { id: 'seedream-4.5', label: 'Seedream 4.5', adapter: 'seedream', supportsReferenceImages: false },
 *   ],
 *   capabilities: [...] // 完整能力信息
 * }
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getModelListForUser, getAvailableModelsForUserWithCapabilities } from '@/lib/image-generation';

export async function GET() {
  try {
    // 获取当前用户授权的高级模型列表
    let grantedModels: string[] = [];

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (userId) {
      // 查询用户被授权的模型
      const permissions = await prisma.userModelPermission.findMany({
        where: { userId },
        select: { modelId: true },
      });
      grantedModels = permissions.map(p => p.modelId);
    }

    // 根据授权过滤模型列表（基础模型 + 授权的高级模型）
    const models = getModelListForUser(grantedModels);

    // 获取完整能力信息（同样根据授权过滤）
    const capabilities = getAvailableModelsForUserWithCapabilities(grantedModels);

    return NextResponse.json({
      success: true,
      models,
      capabilities,
    });
  } catch (error) {
    console.error('[API/image-models] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取模型列表失败',
      },
      { status: 500 }
    );
  }
}
