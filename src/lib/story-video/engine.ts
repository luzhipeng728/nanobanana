/**
 * 故事视频引擎 - 简化版
 *
 * 流程：
 * 1. 分镜规划
 * 2. 并发生成首帧
 * 3. 并发生成视频
 * 4. 视频合成
 */

import { PrismaClient } from '@prisma/client';
import { generateImage } from '@/lib/image-generation';
import { generateStoryboard, generateFirstFramePrompt, generateVideoPrompt } from './storyboard-planner';
import { createSora2Task, waitForSora2Task, selectSora2Model } from './sora2-client';
import type {
  StoryVideoConfig,
  Storyboard,
  StoryboardScene,
  VideoSegment,
  StoryVideoEvent,
} from './types';
import { DEFAULT_CONFIG as defaultConfig } from './types';

const prisma = new PrismaClient();

export type EventEmitter = (event: StoryVideoEvent) => void;

/**
 * 故事视频引擎
 */
export class StoryVideoEngine {
  private projectId: string;
  private config: StoryVideoConfig;
  private emit: EventEmitter;
  private aborted: boolean = false;

  constructor(
    projectId: string,
    config: Partial<StoryVideoConfig> = {},
    emit: EventEmitter = () => {}
  ) {
    this.projectId = projectId;
    this.config = { ...defaultConfig, ...config };
    this.emit = emit;
  }

  /**
   * 发送事件
   */
  private sendEvent(type: StoryVideoEvent['type'], data?: any, message?: string) {
    this.emit({
      type,
      data,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * 发送日志
   */
  private log(message: string) {
    console.log(`[StoryVideoEngine ${this.projectId}] ${message}`);
    this.sendEvent('log', { message }, message);
  }

  /**
   * 中止生成
   */
  public abort() {
    this.aborted = true;
    this.log('Generation aborted');
  }

  /**
   * 主生成流程
   */
  async generate(story: string): Promise<void> {
    try {
      // Phase 1: 分镜规划
      await this.planStoryboard(story);
      if (this.aborted) return;

      // Phase 2: 并发生成首帧
      await this.generateFirstFramesConcurrent();
      if (this.aborted) return;

      // Phase 3: 并发生成视频
      await this.generateVideosConcurrent();
      if (this.aborted) return;

      // Phase 4: 合成最终视频
      await this.composeVideo();

      this.sendEvent('project_complete', { projectId: this.projectId });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Error: ${errorMsg}`);
      this.sendEvent('error', { error: errorMsg }, errorMsg);

      // 更新项目状态为失败
      await prisma.storyVideoProject.update({
        where: { id: this.projectId },
        data: { status: 'failed' },
      });

      throw error;
    }
  }

  /**
   * Phase 1: 分镜规划
   */
  private async planStoryboard(story: string): Promise<void> {
    this.log('Starting storyboard planning...');
    this.sendEvent('planning_start');

    // 更新状态
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: { status: 'planning' },
    });

    // 生成分镜
    const storyboard = await generateStoryboard(story, this.config);
    this.log(`Storyboard generated: ${storyboard.sceneCount} scenes, ${storyboard.totalDuration}s total`);

    // 保存分镜
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: {
        title: storyboard.title,
        storyboard: JSON.stringify(storyboard),
        characterRefs: JSON.stringify(storyboard.characters),
      },
    });

    // 创建场景记录
    for (const scene of storyboard.scenes) {
      await prisma.storyVideoScene.create({
        data: {
          projectId: this.projectId,
          order: scene.order,
          status: 'pending',
          description: scene.description,
          expectedAction: scene.expectedAction,
          characters: JSON.stringify(scene.characters),
          narration: scene.narration,
          transitionHint: scene.transitionTo,
        },
      });
    }

    this.sendEvent('planning_complete', {
      title: storyboard.title,
      sceneCount: storyboard.sceneCount,
      totalDuration: storyboard.totalDuration,
      characters: storyboard.characters,
    });
  }

  /**
   * Phase 2: 并发生成首帧
   */
  private async generateFirstFramesConcurrent(): Promise<void> {
    this.log('Generating first frames concurrently...');

    // 更新状态
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: { status: 'generating_frames' },
    });

    // 获取项目和场景
    const project = await prisma.storyVideoProject.findUnique({
      where: { id: this.projectId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });

    if (!project || !project.storyboard) {
      throw new Error('Project or storyboard not found');
    }

    const storyboard: Storyboard = JSON.parse(project.storyboard);

    // 并发生成所有首帧
    const framePromises = project.scenes.map(async (dbScene, i) => {
      const storyScene = storyboard.scenes[i];

      this.log(`Starting first frame for scene ${i + 1}/${project.scenes.length}`);
      this.sendEvent('scene_frame_start', {
        sceneOrder: i,
        description: storyScene.description,
      });

      // 更新场景状态
      await prisma.storyVideoScene.update({
        where: { id: dbScene.id },
        data: { status: 'generating_frame' },
      });

      // 生成提示词
      const prompt = generateFirstFramePrompt(storyScene, storyboard, storyboard.characters);

      // 生成图片（带重试）
      let result = await generateImage({
        prompt,
        model: 'nano-banana-pro',
        aspectRatio: this.config.aspectRatio as any,
      });

      if (!result.success || !result.imageUrl) {
        this.log(`First attempt failed for scene ${i + 1}, retrying...`);
        result = await generateImage({
          prompt,
          model: 'nano-banana-pro',
          aspectRatio: this.config.aspectRatio as any,
        });
      }

      if (!result.success || !result.imageUrl) {
        throw new Error(`Failed to generate first frame for scene ${i + 1}`);
      }

      // 保存首帧
      await prisma.storyVideoScene.update({
        where: { id: dbScene.id },
        data: {
          firstFrameUrl: result.imageUrl,
          firstFramePrompt: prompt,
        },
      });

      this.log(`First frame complete for scene ${i + 1}`);
      this.sendEvent('scene_frame_complete', {
        sceneOrder: i,
        frameUrl: result.imageUrl,
      });

      return { sceneId: dbScene.id, frameUrl: result.imageUrl };
    });

    // 等待所有首帧生成完成
    await Promise.all(framePromises);
    this.log('All first frames generated');
  }

  /**
   * Phase 3: 并发生成视频（无评估）
   */
  private async generateVideosConcurrent(): Promise<void> {
    this.log('Generating videos concurrently...');

    // 更新状态
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: { status: 'generating_videos' },
    });

    // 获取项目和场景
    const project = await prisma.storyVideoProject.findUnique({
      where: { id: this.projectId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });

    if (!project || !project.storyboard) {
      throw new Error('Project or storyboard not found');
    }

    const storyboard: Storyboard = JSON.parse(project.storyboard);

    // 并发生成所有视频
    const videoPromises = project.scenes.map(async (dbScene, i) => {
      const storyScene = storyboard.scenes[i];

      if (!dbScene.firstFrameUrl) {
        throw new Error(`Scene ${i + 1} missing first frame`);
      }

      this.log(`Starting video for scene ${i + 1}/${project.scenes.length}`);
      this.sendEvent('scene_video_start', {
        sceneOrder: i,
        description: storyScene.description,
      });

      // 更新场景状态
      await prisma.storyVideoScene.update({
        where: { id: dbScene.id },
        data: { status: 'generating_video' },
      });

      // 选择模型
      const model = selectSora2Model(this.config.aspectRatio, 'moderate');

      // 生成提示词
      const prompt = generateVideoPrompt(storyScene, true);

      // 创建视频生成任务
      const { taskId } = await createSora2Task({
        imageUrl: dbScene.firstFrameUrl,
        prompt,
        model,
        sceneId: dbScene.id,
      });

      this.sendEvent('scene_video_progress', {
        sceneOrder: i,
        segmentOrder: 0,
        status: 'generating',
        taskId,
      });

      // 等待生成完成
      const result = await waitForSora2Task(taskId, (progress) => {
        this.sendEvent('scene_video_progress', {
          sceneOrder: i,
          segmentOrder: 0,
          progress,
        });
      });

      if (!result.success || !result.videoUrl) {
        // 重试一次
        this.log(`Video generation failed for scene ${i + 1}, retrying...`);

        const { taskId: retryTaskId } = await createSora2Task({
          imageUrl: dbScene.firstFrameUrl,
          prompt,
          model,
          sceneId: dbScene.id,
        });

        const retryResult = await waitForSora2Task(retryTaskId);

        if (!retryResult.success || !retryResult.videoUrl) {
          throw new Error(`Failed to generate video for scene ${i + 1}: ${retryResult.error}`);
        }

        result.videoUrl = retryResult.videoUrl;
        result.duration = retryResult.duration;
      }

      // 创建片段记录
      const segment: VideoSegment = {
        id: taskId,
        order: 0,
        inputFrame: dbScene.firstFrameUrl,
        prompt,
        model,
        videoUrl: result.videoUrl,
        duration: result.duration,
        status: 'approved',
      };

      // 保存视频数据
      await prisma.storyVideoScene.update({
        where: { id: dbScene.id },
        data: {
          status: 'approved',
          videoSegments: JSON.stringify([segment]),
          totalDuration: result.duration,
        },
      });

      this.log(`Video complete for scene ${i + 1}`);
      this.sendEvent('scene_video_complete', {
        sceneOrder: i,
        segments: 1,
        totalDuration: result.duration,
      });

      return { sceneId: dbScene.id, videoUrl: result.videoUrl };
    });

    // 等待所有视频生成完成
    await Promise.all(videoPromises);
    this.log('All videos generated');
  }

  /**
   * Phase 4: 合成最终视频
   */
  private async composeVideo(): Promise<void> {
    this.log('Composing final video...');
    this.sendEvent('composing_start');

    // 更新状态
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: { status: 'composing' },
    });

    // 获取所有场景
    const scenes = await prisma.storyVideoScene.findMany({
      where: { projectId: this.projectId },
      orderBy: { order: 'asc' },
    });

    // 收集所有视频片段
    const allVideos: string[] = [];
    for (const scene of scenes) {
      if (scene.videoSegments) {
        const segments: VideoSegment[] = JSON.parse(scene.videoSegments);
        for (const segment of segments) {
          if (segment.videoUrl) {
            allVideos.push(segment.videoUrl);
          }
        }
      }
    }

    if (allVideos.length === 0) {
      throw new Error('No video segments to compose');
    }

    this.log(`Composing ${allVideos.length} video segments`);

    // 使用 FFmpeg 合成视频
    const finalVideoUrl = await this.concatVideos(allVideos);

    // 计算总时长
    const totalDuration = scenes.reduce((sum, s) => sum + (s.totalDuration || 0), 0);

    // 更新项目
    await prisma.storyVideoProject.update({
      where: { id: this.projectId },
      data: {
        status: 'completed',
        videoUrl: finalVideoUrl,
        coverUrl: scenes[0]?.firstFrameUrl,
        duration: totalDuration,
        completedAt: new Date(),
      },
    });

    this.sendEvent('composing_complete', {
      videoUrl: finalVideoUrl,
      duration: totalDuration,
    });

    this.log('Video composition complete!');
  }

  /**
   * 使用 FFmpeg 拼接视频
   */
  private async concatVideos(videoUrls: string[]): Promise<string> {
    const { spawn } = await import('child_process');
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');

    const tempDir = os.tmpdir();
    const listFile = path.join(tempDir, `concat-${this.projectId}-${Date.now()}.txt`);
    const outputFile = path.join(tempDir, `output-${this.projectId}-${Date.now()}.mp4`);

    // 下载视频并创建列表文件
    const localFiles: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = path.join(tempDir, `video-${this.projectId}-${i}.mp4`);

      this.log(`Downloading video ${i + 1}/${videoUrls.length}...`);

      // 下载视频
      const response = await fetch(videoUrls[i]);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(localPath, Buffer.from(buffer));

      localFiles.push(localPath);

      this.sendEvent('composing_progress', {
        step: 'downloading',
        current: i + 1,
        total: videoUrls.length,
      });
    }

    // 创建 FFmpeg concat 列表
    const listContent = localFiles.map((f) => `file '${f}'`).join('\n');
    await fs.writeFile(listFile, listContent);

    // 执行 FFmpeg 合成
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-y',
        outputFile,
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        // 清理临时文件
        for (const file of localFiles) {
          await fs.unlink(file).catch(() => {});
        }
        await fs.unlink(listFile).catch(() => {});

        if (code !== 0) {
          console.error('FFmpeg error:', stderr);
          reject(new Error(`FFmpeg exited with code ${code}`));
          return;
        }

        try {
          // 上传到 R2
          const videoBuffer = await fs.readFile(outputFile);
          const { uploadVideoBuffer } = await import('@/app/actions/storage');
          const url = await uploadVideoBuffer(videoBuffer, `story-video-${this.projectId}.mp4`);

          // 清理输出文件
          await fs.unlink(outputFile).catch(() => {});

          resolve(url);
        } catch (error) {
          reject(error);
        }
      });

      ffmpeg.on('error', reject);
    });
  }
}

/**
 * 创建并启动故事视频生成
 */
export async function createStoryVideo(
  story: string,
  config: Partial<StoryVideoConfig> = {},
  userId?: string,
  emit?: EventEmitter
): Promise<string> {
  // 创建项目
  const project = await prisma.storyVideoProject.create({
    data: {
      story,
      status: 'draft',
      contentType: config.contentType || 'children_book',
      artStyle: config.artStyle || defaultConfig.artStyle,
      aspectRatio: config.aspectRatio || '16:9',
      qualityMode: config.qualityMode || 'standard',
      voiceId: config.voiceId,
      bgmStyle: config.bgmStyle,
      userId,
    },
  });

  // 启动引擎
  const engine = new StoryVideoEngine(project.id, config, emit);

  // 异步执行
  engine.generate(story).catch((error) => {
    console.error(`[StoryVideo ${project.id}] Generation failed:`, error);
  });

  return project.id;
}
