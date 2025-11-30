// 编辑图片工具

import type { ChatAgentTool, ToolContext, ToolCallbacks, ToolResult } from '../types';
import { editImageSchema } from '../tool-registry';

// 图片编辑 API（可以复用生图接口或使用专门的编辑接口）
const IMAGE_EDIT_API_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/edit-image`
  : '/api/edit-image';

interface ImageEditRequest {
  imageUrl: string;
  editPrompt: string;
  maskArea?: string;
}

interface ImageEditResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

/**
 * 轮询任务状态
 */
async function pollEditTaskStatus(
  taskId: string,
  callbacks: ToolCallbacks,
  abortSignal: AbortSignal,
  maxWaitTime: number = 120000
): Promise<ImageEditResponse> {
  const startTime = Date.now();
  const pollInterval = 2000;

  while (Date.now() - startTime < maxWaitTime) {
    if (abortSignal.aborted) {
      throw new Error('用户中断');
    }

    const response = await fetch(`/api/image-task?taskId=${taskId}`, {
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`查询任务状态失败: ${response.status}`);
    }

    const result: ImageEditResponse = await response.json();

    if (result.status === 'completed') {
      return result;
    }

    if (result.status === 'failed') {
      throw new Error(result.error || '图片编辑失败');
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    callbacks.onProgress(`编辑中... (${elapsed}s)`);

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('图片编辑超时');
}

/**
 * 使用生图接口实现编辑（通过 img2img 方式）
 */
async function editImageViaGeneration(
  imageUrl: string,
  editPrompt: string,
  callbacks: ToolCallbacks,
  abortSignal: AbortSignal
): Promise<string> {
  // 如果没有专门的编辑接口，使用生图接口的 img2img 能力
  const response = await fetch('/api/generate-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: editPrompt,
      model: 'nano-banana',
      referenceImages: [imageUrl],
      // img2img 模式：高度参考原图
      strength: 0.7,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`创建编辑任务失败: ${response.status}`);
  }

  const result = await response.json();

  if (!result.taskId) {
    throw new Error('未获取到任务 ID');
  }

  // 轮询任务状态
  const finalResult = await pollEditTaskStatus(
    result.taskId,
    callbacks,
    abortSignal
  );

  if (!finalResult.imageUrl) {
    throw new Error('未获取到编辑后的图片');
  }

  return finalResult.imageUrl;
}

/**
 * 编辑图片工具
 */
export const editImageTool: ChatAgentTool = {
  name: 'edit_image',
  description: `编辑或修改已有图片。

功能：
- 修改图片内容（添加/删除/替换元素）
- 调整图片风格
- 局部修改（指定区域）

使用提示：
- imageUrl：要编辑的图片URL（可从对话上下文获取）
- editPrompt：描述如何修改图片
- maskArea：可选，描述需要修改的区域`,

  schema: editImageSchema,

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
    callbacks: ToolCallbacks
  ): Promise<ToolResult> {
    const {
      imageUrl,
      editPrompt,
      maskArea,
    } = input as {
      imageUrl: string;
      editPrompt: string;
      maskArea?: string;
    };

    // 如果没有指定图片，使用上下文中的第一张
    const targetImage = imageUrl || context.attachedImages[0];

    if (!targetImage) {
      return {
        success: false,
        error: '没有找到要编辑的图片。请先上传图片或指定图片URL。',
      };
    }

    callbacks.onProgress('准备编辑图片...');

    try {
      // 构建完整的编辑提示
      let fullPrompt = editPrompt;
      if (maskArea) {
        fullPrompt = `${editPrompt}。修改区域：${maskArea}`;
      }

      callbacks.onProgress('调用图片编辑服务...');

      // 尝试使用专门的编辑接口
      try {
        const response = await fetch(IMAGE_EDIT_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: targetImage,
            editPrompt: fullPrompt,
            maskArea,
          } as ImageEditRequest),
          signal: context.abortSignal,
        });

        if (response.ok) {
          const result: ImageEditResponse = await response.json();

          if (result.taskId) {
            const finalResult = await pollEditTaskStatus(
              result.taskId,
              callbacks,
              context.abortSignal
            );

            if (finalResult.imageUrl) {
              callbacks.onProgress('图片编辑完成！');
              return {
                success: true,
                imageUrl: finalResult.imageUrl,
                data: {
                  originalImage: targetImage,
                  editPrompt: fullPrompt,
                  editedImageUrl: finalResult.imageUrl,
                },
              };
            }
          }
        }
      } catch {
        // 专门接口不可用，回退到生图方式
        callbacks.onProgress('使用图生图模式编辑...');
      }

      // 回退：使用生图接口的 img2img 能力
      const editedImageUrl = await editImageViaGeneration(
        targetImage,
        fullPrompt,
        callbacks,
        context.abortSignal
      );

      callbacks.onProgress('图片编辑完成！');

      return {
        success: true,
        imageUrl: editedImageUrl,
        data: {
          originalImage: targetImage,
          editPrompt: fullPrompt,
          editedImageUrl,
          method: 'img2img',
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '图片编辑失败';
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

export default editImageTool;
