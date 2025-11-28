import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";

// 为指定 slide 生成封面图
export async function generateCoverForSlide(slideId: string): Promise<{
  success: boolean;
  cover?: string;
  cached?: boolean;
  error?: string;
}> {
  try {
    // 获取 slide 信息
    const slide = await prisma.slideshow.findUnique({
      where: { id: slideId },
    });

    if (!slide) {
      return { success: false, error: "Slide 不存在" };
    }

    // 如果已有封面，直接返回
    if (slide.cover) {
      return { success: true, cover: slide.cover, cached: true };
    }

    // 生成封面图的 prompt
    const coverPrompt = `Create a stylish cover image for a slideshow titled "${slide.title}".
Design requirements:
- Square format (1:1 aspect ratio)
- Modern, clean, minimalist design
- The title "${slide.title}" should be prominently displayed in the center
- Use elegant typography
- Soft gradient background with harmonious colors
- Professional and artistic look
- No complex illustrations, focus on typography and abstract elements`;

    console.log(`[Cover Generator] Generating cover for slide: ${slide.title}`);

    // 调用 Gemini 生成图片
    const result = await generateImageAction(
      coverPrompt,
      "nano-banana-pro",
      {
        aspectRatio: "1:1",
        imageSize: "2K",
      }
    );

    if (!result.success || !result.imageUrl) {
      console.error(`[Cover Generator] Failed to generate cover:`, result.error);
      return { success: false, error: result.error || "生成封面失败" };
    }

    // 更新 slide 的封面
    await prisma.slideshow.update({
      where: { id: slideId },
      data: { cover: result.imageUrl },
    });

    console.log(`[Cover Generator] Cover generated successfully: ${result.imageUrl}`);

    return { success: true, cover: result.imageUrl, cached: false };
  } catch (error) {
    console.error("[Cover Generator] Error:", error);
    return { success: false, error: "生成封面失败" };
  }
}

// 批量触发封面生成（后台异步执行，不阻塞）
export function triggerCoverGenerationBatch(slideIds: string[]) {
  if (slideIds.length === 0) return;

  console.log(`[Cover Generator] Triggering batch generation for ${slideIds.length} slides:`, slideIds);

  // 在后台依次生成，不阻塞主流程
  (async () => {
    for (const slideId of slideIds) {
      try {
        await generateCoverForSlide(slideId);
        // 避免同时生成太多，间隔 1 秒
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Cover Generator] Failed to generate cover for ${slideId}:`, error);
      }
    }
  })();
}
