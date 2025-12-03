import { prisma } from "@/lib/prisma";
import { generateImageAction } from "@/app/actions/generate";

// 为指定 scrollytelling 生成封面图
export async function generateCoverForScrollytelling(scrollytellingId: string): Promise<{
  success: boolean;
  cover?: string;
  cached?: boolean;
  error?: string;
}> {
  try {
    // 获取 scrollytelling 信息
    const scrollytelling = await prisma.scrollytelling.findUnique({
      where: { id: scrollytellingId },
    });

    if (!scrollytelling) {
      return { success: false, error: "Scrollytelling 不存在" };
    }

    // 如果已有封面，直接返回
    if (scrollytelling.cover) {
      return { success: true, cover: scrollytelling.cover, cached: true };
    }

    // 生成封面图的 prompt
    const coverPrompt = `Create a stylish cover image for an immersive scrollytelling webpage titled "${scrollytelling.title}".
Design requirements:
- Square format (1:1 aspect ratio)
- Modern, dynamic, cinematic design
- The title "${scrollytelling.title}" should be prominently displayed
- Use elegant typography with a sense of motion
- Gradient background with harmonious colors that suggest scrolling/depth
- Include subtle visual elements suggesting interactivity (like scroll indicators, parallax layers)
- Professional and artistic look suitable for a web experience showcase`;

    console.log(`[Scrollytelling Cover Generator] Generating cover for: ${scrollytelling.title}`);

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
      console.error(`[Scrollytelling Cover Generator] Failed to generate cover:`, result.error);
      return { success: false, error: result.error || "生成封面失败" };
    }

    // 更新 scrollytelling 的封面
    await prisma.scrollytelling.update({
      where: { id: scrollytellingId },
      data: { cover: result.imageUrl },
    });

    console.log(`[Scrollytelling Cover Generator] Cover generated successfully: ${result.imageUrl}`);

    return { success: true, cover: result.imageUrl, cached: false };
  } catch (error) {
    console.error("[Scrollytelling Cover Generator] Error:", error);
    return { success: false, error: "生成封面失败" };
  }
}

// 批量触发封面生成（后台异步执行，不阻塞）
export function triggerScrollytellingCoverBatch(scrollytellingIds: string[]) {
  if (scrollytellingIds.length === 0) return;

  console.log(`[Scrollytelling Cover Generator] Triggering batch generation for ${scrollytellingIds.length} items:`, scrollytellingIds);

  // 在后台依次生成，不阻塞主流程
  (async () => {
    for (const scrollytellingId of scrollytellingIds) {
      try {
        await generateCoverForScrollytelling(scrollytellingId);
        // 避免同时生成太多，间隔 1 秒
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Scrollytelling Cover Generator] Failed to generate cover for ${scrollytellingId}:`, error);
      }
    }
  })();
}
