/**
 * 图片生成模型列表 API
 *
 * GET /api/image-models
 * 返回所有可用的图片生成模型及其能力信息
 *
 * 响应格式：
 * {
 *   models: [
 *     { id: 'nano-banana', label: 'Gemini 快速', adapter: 'gemini', supportsReferenceImages: true },
 *     { id: 'nano-banana-pro', label: 'Gemini 高级', adapter: 'gemini', supportsReferenceImages: true },
 *     { id: 'seedream-4.5', label: 'Seedream 4.5', adapter: 'seedream', supportsReferenceImages: false },
 *   ],
 *   capabilities: [...] // 完整能力信息
 * }
 */

import { NextResponse } from 'next/server';
import { getAvailableModels, getModelList } from '@/lib/image-generation';

export async function GET() {
  try {
    // 获取模型列表（简化版）
    const models = getModelList();

    // 获取完整能力信息
    const capabilities = getAvailableModels();

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
