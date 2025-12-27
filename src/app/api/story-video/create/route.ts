/**
 * 创建故事视频项目 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { cookies } from 'next/headers';
import type { ContentType, StoryVideoConfig } from '@/lib/story-video/types';

const prisma = new PrismaClient();

async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('userId')?.value || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      story,
      contentType = 'children_book',
      artStyle,
      aspectRatio = '16:9',
      qualityMode = 'standard',
      voiceId,
      bgmStyle,
    } = body;

    if (!story || typeof story !== 'string' || story.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '请输入故事内容' },
        { status: 400 }
      );
    }

    const userId = await getCurrentUserId();

    // 创建项目
    const project = await prisma.storyVideoProject.create({
      data: {
        story: story.trim(),
        status: 'draft',
        contentType: contentType as ContentType,
        artStyle: artStyle || getDefaultArtStyle(contentType),
        aspectRatio,
        qualityMode,
        voiceId,
        bgmStyle,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      projectId: project.id,
    });

  } catch (error) {
    console.error('[API story-video/create] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function getDefaultArtStyle(contentType: string): string {
  const styles: Record<string, string> = {
    children_book: 'watercolor children\'s book illustration, soft colors, cute characters, warm and friendly atmosphere',
    poetry: 'traditional Chinese ink painting (水墨画), elegant and poetic atmosphere, subtle gradients, artistic composition',
    science: 'modern flat illustration, infographic style, educational, clean lines, vibrant colors',
    fairy_tale: 'fantasy illustration, magical atmosphere, detailed backgrounds, enchanting lighting',
  };
  return styles[contentType] || styles.children_book;
}
