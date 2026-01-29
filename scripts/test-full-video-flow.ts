/**
 * Test Full Video Generation Flow (including Loop Video)
 *
 * This script tests the complete video generation pipeline:
 * 1. Fetch slideshow data from the API
 * 2. Generate narration using the narration agent
 * 3. Generate TTS audio for each narration
 * 4. Generate loop videos using Seedance (if enabled)
 * 5. Compose the final video using FFmpeg
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import os from 'os';

// Test configuration
const SLIDESHOW_ID = '2cf7d054-cd32-4015-9ff0-275e73719950';
const SPEAKER = 'zh_female_sichuan'; // 呆萌川妹
const SPEED = 1.0;
const ENABLE_LOOP_VIDEO = true; // 测试循环视频生成

async function main() {
  console.log('=== Full Video Generation Flow Test (with Loop Video) ===\n');
  console.log('Configuration:');
  console.log(`  Slideshow ID: ${SLIDESHOW_ID}`);
  console.log(`  Speaker: ${SPEAKER}`);
  console.log(`  Speed: ${SPEED}`);
  console.log(`  Enable Loop Video: ${ENABLE_LOOP_VIDEO}`);
  console.log('');

  // Dynamic imports
  const { BytedanceTTSClient, textToSpeech } = await import('../src/lib/tts/bytedance-tts');
  const { composeVideo } = await import('../src/lib/video/compose-video');
  const { generateVideo: generateLoopVideoWithSeedance } = await import('../src/lib/volcano/seedance');

  // Step 1: Fetch slideshow data
  console.log('Step 1: Fetching slideshow data...');

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const slideshow = await prisma.slideshow.findUnique({
    where: { id: SLIDESHOW_ID },
  });

  if (!slideshow) {
    console.error('Slideshow not found!');
    process.exit(1);
  }

  const images = JSON.parse(slideshow.images) as string[];
  console.log(`  Found ${images.length} images`);
  console.log(`  Title: ${slideshow.title}`);

  // 只测试前2张图片以节省时间
  const testImages = images.slice(0, 2);
  console.log(`  Testing with first ${testImages.length} images`);

  // Step 2: Generate narrations
  console.log('\nStep 2: Generating test narrations...');

  const narrations = testImages.map((_, i) =>
    `这是第${i + 1}张图片的讲解内容。让我们来看看这张精彩的图片吧！`
  );

  console.log(`  Generated ${narrations.length} narrations`);

  // Step 3: Generate TTS audio
  console.log('\nStep 3: Generating TTS audio...');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-video-'));
  console.log(`  Temp directory: ${tempDir}`);

  const speakerId = BytedanceTTSClient.getSpeakerId(SPEAKER as any);
  console.log(`  Using speaker: ${speakerId}`);

  const audioPaths: string[] = [];

  for (let i = 0; i < narrations.length; i++) {
    const startTime = Date.now();
    console.log(`  Generating TTS ${i + 1}/${narrations.length}...`);

    const result = await textToSpeech(narrations[i], {
      speaker: speakerId,
      format: 'mp3',
      speed: SPEED,
    });

    if (!result.success || !result.audioBuffer) {
      console.error(`    ❌ TTS failed: ${result.error}`);
      process.exit(1);
    }

    const audioPath = path.join(tempDir, `audio_${i}.mp3`);
    fs.writeFileSync(audioPath, result.audioBuffer);
    audioPaths.push(audioPath);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`    ✅ Done in ${elapsed}s - ${(result.audioBuffer.length / 1024).toFixed(1)} KB`);
  }

  // Step 4: Generate loop videos using Seedance
  let loopVideoUrls: string[] | undefined;

  if (ENABLE_LOOP_VIDEO) {
    console.log('\nStep 4: Generating loop videos with Seedance...');
    console.log('  ⚠️  This may take a few minutes...');

    loopVideoUrls = [];
    const seedanceStartTime = Date.now();

    // 并发生成所有循环视频
    const seedancePromises = testImages.map(async (imageUrl, i) => {
      const startTime = Date.now();
      console.log(`  [${i + 1}] Starting Seedance for image ${i + 1}...`);

      try {
        // 提示词策略：只描述要动的部分，不提静止部分（模型会自动保持未提及的元素静止）
        const loopVideoUrl = await generateLoopVideoWithSeedance({
          startFrame: imageUrl,
          endFrame: imageUrl, // 首尾帧相同，实现无缝循环
          duration: 5, // 5秒视频
          aspectRatio: '16:9',
          model: 'doubao-seedance-1-5-pro-251215',
          prompt: 'Background particles float gently upward. Soft light rays pulse slowly. Small decorative elements drift subtly. Ambient glow breathes softly. Camera fixed.',
        });

        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${i + 1}] ✅ Seedance done in ${elapsedTime}s`);
        console.log(`       URL: ${loopVideoUrl.substring(0, 80)}...`);

        return loopVideoUrl;
      } catch (error) {
        console.error(`  [${i + 1}] ❌ Seedance failed:`, error);
        throw error;
      }
    });

    try {
      loopVideoUrls = await Promise.all(seedancePromises);
      const totalElapsed = ((Date.now() - seedanceStartTime) / 1000).toFixed(1);
      console.log(`\n  All ${loopVideoUrls.length} loop videos completed in ${totalElapsed}s`);
    } catch (error) {
      console.error('\n  ❌ Loop video generation failed, falling back to image mode');
      loopVideoUrls = undefined;
    }
  } else {
    console.log('\nStep 4: Loop video generation skipped (ENABLE_LOOP_VIDEO=false)');
  }

  // Step 5: Compose final video
  console.log('\nStep 5: Composing final video...');

  const outputPath = path.join(tempDir, 'output.mp4');
  console.log(`  Output path: ${outputPath}`);
  console.log(`  Mode: ${loopVideoUrls ? 'Loop Video' : 'Static Image'}`);

  const composeStartTime = Date.now();
  const result = await composeVideo({
    imageUrls: testImages,
    audioPaths,
    transition: 'fade',
    outputPath,
    loopVideoUrls,
  }, (percent, message) => {
    console.log(`  [${percent}%] ${message}`);
  });

  const composeElapsed = ((Date.now() - composeStartTime) / 1000).toFixed(1);

  if (result.success) {
    console.log(`\n✅ Video composition successful!`);
    console.log(`  Output: ${result.outputPath}`);
    console.log(`  Duration: ${result.duration?.toFixed(1)}s`);
    console.log(`  Compose time: ${composeElapsed}s`);

    // Check file size
    const stats = fs.statSync(outputPath);
    console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Copy to scripts folder for easy access
    const finalPath = path.join(__dirname, 'test-output-loop.mp4');
    fs.copyFileSync(outputPath, finalPath);
    console.log(`\n  Copied to: ${finalPath}`);
  } else {
    console.error(`\n❌ Video composition failed: ${result.error}`);
  }

  // Cleanup
  console.log('\nCleaning up temp directory...');
  fs.rmSync(tempDir, { recursive: true, force: true });

  await prisma.$disconnect();

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
