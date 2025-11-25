import { NextRequest, NextResponse } from "next/server";
import GIFEncoder from "gif-encoder-2";
import { createCanvas, loadImage } from "canvas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frames, fps = 8, width = 256, height = 256 } = body;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { success: false, error: "缺少帧图片" },
        { status: 400 }
      );
    }

    console.log(`Generating GIF with ${frames.length} frames at ${fps} FPS...`);

    // 创建 GIF 编码器
    const encoder = new GIFEncoder(width, height, "neuquant", true);
    encoder.setDelay(Math.round(1000 / fps)); // 帧间隔（毫秒）
    encoder.setRepeat(0); // 0 = 无限循环
    encoder.setQuality(10); // 质量（1-30，越小越好）
    encoder.start();

    // 创建 canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 处理每一帧
    for (let i = 0; i < frames.length; i++) {
      const frameUrl = frames[i];
      console.log(`Processing frame ${i + 1}/${frames.length}...`);

      try {
        // 加载图片
        const image = await loadImage(frameUrl);
        
        // 清空画布并绘制图片
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        
        // 保持宽高比居中绘制
        const scale = Math.min(width / image.width, height / image.height);
        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;
        const x = (width - scaledWidth) / 2;
        const y = (height - scaledHeight) / 2;
        
        ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
        
        // 添加帧
        encoder.addFrame(ctx);
      } catch (err) {
        console.error(`Error processing frame ${i + 1}:`, err);
        // 跳过失败的帧，继续处理
      }
    }

    encoder.finish();

    // 获取 GIF buffer
    const buffer = encoder.out.getData();

    console.log(`GIF generated successfully, size: ${buffer.length} bytes`);

    // 返回 GIF 文件
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Content-Disposition": 'attachment; filename="sticker.gif"',
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("GIF generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "GIF 生成失败",
      },
      { status: 500 }
    );
  }
}

