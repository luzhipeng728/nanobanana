/**
 * 查询故事视频项目状态 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json(
      { success: false, error: 'projectId is required' },
      { status: 400 }
    );
  }

  try {
    const project = await prisma.storyVideoProject.findUnique({
      where: { id: projectId },
      include: {
        scenes: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    const storyboard = project.storyboard ? JSON.parse(project.storyboard) : null;
    const characterRefs = project.characterRefs ? JSON.parse(project.characterRefs) : null;

    // 解析场景的 JSON 字段
    const scenes = project.scenes.map((scene) => ({
      ...scene,
      characters: scene.characters ? JSON.parse(scene.characters) : [],
      videoSegments: scene.videoSegments ? JSON.parse(scene.videoSegments) : [],
    }));

    // 计算进度
    const progress = calculateProgress(project.status, scenes);

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        status: project.status,
        title: project.title,
        story: project.story,
        contentType: project.contentType,
        artStyle: project.artStyle,
        aspectRatio: project.aspectRatio,
        videoUrl: project.videoUrl,
        coverUrl: project.coverUrl,
        duration: project.duration,
        storyboard,
        characterRefs,
        scenes,
        progress,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        completedAt: project.completedAt,
      },
    });

  } catch (error) {
    console.error('[API story-video/status] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function calculateProgress(status: string, scenes: any[]): number {
  const statusProgress: Record<string, number> = {
    draft: 0,
    planning: 10,
    generating_frames: 30,
    generating_videos: 50,
    evaluating: 80,
    composing: 90,
    completed: 100,
    failed: 0,
  };

  let base = statusProgress[status] || 0;

  // 如果在生成阶段，根据场景进度细化
  if (status === 'generating_frames' || status === 'generating_videos') {
    const totalScenes = scenes.length;
    if (totalScenes > 0) {
      const completedScenes = scenes.filter(
        (s) =>
          s.status === 'approved' ||
          (status === 'generating_frames' && s.firstFrameUrl)
      ).length;
      const sceneProgress = completedScenes / totalScenes;

      if (status === 'generating_frames') {
        base = 10 + sceneProgress * 20; // 10-30
      } else {
        base = 30 + sceneProgress * 50; // 30-80
      }
    }
  }

  return Math.round(base);
}
