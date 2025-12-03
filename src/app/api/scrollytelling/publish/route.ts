// Scrollytelling 发布 API - 上传 HTML 到 R2 并保存到数据库

import { NextRequest, NextResponse } from "next/server";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { html, title, images, theme } = body as {
      html: string;
      title: string;
      images: string[];
      theme?: string;
    };

    if (!html || !title) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 生成唯一 ID
    const id = uuidv4();
    const fileName = `nanobanana/scrollytelling/${id}.html`;

    // 上传 HTML 到 R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: Buffer.from(html, "utf-8"),
      ContentType: "text/html; charset=utf-8",
      // 设置缓存控制
      CacheControl: "public, max-age=31536000",
    });

    await r2Client.send(command);

    const htmlUrl = `${R2_PUBLIC_URL}/${fileName}`;

    // 保存到数据库
    const scrollytelling = await prisma.scrollytelling.create({
      data: {
        id,
        title,
        htmlUrl,
        images: JSON.stringify(images),
        theme: theme || null,
        cover: images[0] || null, // 使用第一张图片作为封面
      },
    });

    console.log(`[Scrollytelling Publish] Created: ${id} -> ${htmlUrl}`);

    return NextResponse.json({
      success: true,
      id: scrollytelling.id,
      url: `/scrollytelling/${scrollytelling.id}`,
      htmlUrl,
    });
  } catch (error) {
    console.error("[Scrollytelling Publish] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "发布失败" },
      { status: 500 }
    );
  }
}
