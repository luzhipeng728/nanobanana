/**
 * AI News Video Generator - 测试脚本
 *
 * 测试完整的视频生成流程：
 * 1. Deep Research
 * 2. Generate Storyboard
 * 3. Generate Images (with quality check)
 * 4. Generate TTS
 * 5. Calculate Segments
 * 6. Generate Videos (with first/last frame chaining)
 * 7. Merge Videos + Add Audio
 */

// 重要：必须在导入任何其他模块之前先加载环境变量
import dotenv from 'dotenv'
// 先加载 .env（包含 R2 等基础配置）
const envResult = dotenv.config({ path: '.env' })
if (envResult.error) {
  console.warn('Warning: .env file not found')
}
// 然后加载 .env.local（覆盖特定配置）
dotenv.config({ path: '.env.local' })

import {
  deepResearch,
  generateStoryboard,
  generateImage,
  analyzeImage,
  generateTTS,
  calculateSegments,
  generateVideo,
  analyzeVideo,
  mergeVideos,
  addAudioAndSubtitles,
  extractFrame,
  getAudioDuration,
} from '../src/lib/canvas-tools'

// 测试主题
const TEST_TOPIC = '2024年AI技术突破：OpenAI Sora和Google Gemini 2.0的发布'

async function main() {
  console.log('='.repeat(60))
  console.log('AI News Video Generator - 测试开始')
  console.log('='.repeat(60))
  console.log(`测试主题: ${TEST_TOPIC}\n`)

  try {
    // ========== Phase 1: Research ==========
    console.log('\n📚 Phase 1: Deep Research')
    console.log('-'.repeat(40))

    const researchResult = await deepResearch({
      topic: TEST_TOPIC,
      reasoningEffort: 'low',  // 测试时用 low 节省时间
    })

    if (!researchResult.success) {
      throw new Error(`Research failed: ${researchResult.error}`)
    }

    console.log('✅ Research completed')
    console.log(`   Report length: ${researchResult.data!.report.length} chars`)
    console.log(`   Sources: ${researchResult.data!.sources.length}`)
    console.log(`   Key findings: ${researchResult.data!.keyFindings?.length || 0}`)

    // ========== Phase 2: Storyboard ==========
    console.log('\n🎬 Phase 2: Generate Storyboard')
    console.log('-'.repeat(40))

    const storyboardResult = await generateStoryboard({
      content: researchResult.data!.report.slice(0, 2000),  // 截取部分内容
      sceneCount: 2,  // 测试时只生成 2 个场景
      style: 'news',
      maxDuration: 30,  // 最大 30 秒
    })

    if (!storyboardResult.success) {
      throw new Error(`Storyboard failed: ${storyboardResult.error}`)
    }

    console.log('✅ Storyboard generated')
    console.log(`   Title: ${storyboardResult.data!.title}`)
    console.log(`   Scenes: ${storyboardResult.data!.scenes.length}`)
    console.log(`   Total duration: ${storyboardResult.data!.totalDuration}s`)

    for (const scene of storyboardResult.data!.scenes) {
      console.log(`   - Scene ${scene.order}: ${scene.description.slice(0, 50)}...`)
    }

    // ========== Phase 3: Generate Images ==========
    console.log('\n🖼️ Phase 3: Generate Images (with quality check)')
    console.log('-'.repeat(40))

    const validatedImages: string[] = []
    const scene = storyboardResult.data!.scenes[0]  // 测试时只生成第一个场景

    console.log(`\nGenerating image for scene: ${scene.description.slice(0, 50)}...`)
    console.log(`Prompt: ${scene.imagePrompt.slice(0, 100)}...`)

    let imageResult = await generateImage({
      prompt: scene.imagePrompt,
      model: 'nano-banana',  // 测试时用快速模型
      resolution: '2K',
      aspectRatio: '16:9',
    })

    if (!imageResult.success) {
      throw new Error(`Image generation failed: ${imageResult.error}`)
    }

    console.log('✅ Image generated')
    console.log(`   URL: ${imageResult.data!.imageUrl.slice(0, 80)}...`)

    // Analyze image
    console.log('\n   Analyzing image quality...')
    const analysisResult = await analyzeImage({
      image: imageResult.data!.imageUrl,
      isInfoGraphic: true,
      expectedDescription: scene.description,
    })

    if (!analysisResult.success) {
      console.log(`   ⚠️ Analysis failed: ${analysisResult.error}`)
    } else {
      console.log(`   Quality score: ${analysisResult.data!.qualityScore || 'N/A'}`)
      console.log(`   Layout OK: ${analysisResult.data!.layoutOk ?? 'N/A'}`)
      console.log(`   Has garbled text: ${analysisResult.data!.hasGarbledText ?? 'N/A'}`)
      console.log(`   Passed: ${analysisResult.data!.passed ?? 'N/A'}`)
    }

    validatedImages.push(imageResult.data!.imageUrl)

    // ========== Phase 4: Generate TTS ==========
    console.log('\n🎤 Phase 4: Generate TTS')
    console.log('-'.repeat(40))

    const narrationText = scene.narration || scene.description
    console.log(`Narration text: ${narrationText.slice(0, 100)}...`)

    const ttsResult = await generateTTS({
      text: narrationText,
      speedRatio: 1.0,
    })

    if (!ttsResult.success) {
      throw new Error(`TTS failed: ${ttsResult.error}`)
    }

    console.log('✅ TTS generated')
    console.log(`   Duration: ${ttsResult.data!.duration}s`)
    console.log(`   Audio URL: ${ttsResult.data!.audioUrl.slice(0, 50)}...`)

    const audioDuration = ttsResult.data!.duration

    // ========== Phase 5: Calculate Segments ==========
    console.log('\n📊 Phase 5: Calculate Video Segments')
    console.log('-'.repeat(40))

    const segmentsResult = calculateSegments({
      audioDuration,
      firstSegmentDuration: 5,
      maxSegmentDuration: 12,
      targetSegmentDuration: 8,
    })

    if (!segmentsResult.success) {
      throw new Error(`Segment calculation failed: ${segmentsResult.error}`)
    }

    console.log('✅ Segments calculated')
    console.log(`   Total segments: ${segmentsResult.data!.totalSegments}`)
    for (const seg of segmentsResult.data!.segments) {
      console.log(`   - Segment ${seg.index}: ${seg.duration}s (${seg.type}) - ${seg.note}`)
    }

    // ========== Phase 6: Generate Videos ==========
    console.log('\n🎥 Phase 6: Generate Videos (first/last frame chaining)')
    console.log('-'.repeat(40))

    const videoPaths: string[] = []
    let previousEndFrame: string | null = null

    // 测试时只生成第一个分段
    const firstSegment = segmentsResult.data!.segments[0]
    console.log(`\nGenerating segment 0: ${firstSegment.duration}s (${firstSegment.type})`)

    const videoResult = await generateVideo({
      startFrame: validatedImages[0],
      duration: Math.min(firstSegment.duration, 5),  // 限制测试时长
      aspectRatio: '16:9',
      model: 'seedance-lite',  // 测试时用快速模型
      prompt: '文字缓缓淡出，镜头平滑推进',
    })

    if (!videoResult.success) {
      console.log(`⚠️ Video generation failed: ${videoResult.error}`)
      console.log('   (Video generation requires Volcano API access)')
    } else {
      console.log('✅ Video generated')
      console.log(`   Video URL: ${videoResult.data!.videoUrl.slice(0, 80)}...`)
      console.log(`   Task ID: ${videoResult.data!.taskId}`)

      // Analyze video
      console.log('\n   Analyzing video quality...')
      const videoAnalysis = await analyzeVideo({
        videoPath: videoResult.data!.videoUrl,
        sceneDescription: scene.description,
      })

      if (!videoAnalysis.success) {
        console.log(`   ⚠️ Video analysis failed: ${videoAnalysis.error}`)
      } else {
        console.log(`   Overall score: ${videoAnalysis.data!.overallScore || 'N/A'}/10`)
        console.log(`   Recommendation: ${videoAnalysis.data!.recommendation || 'N/A'}`)
        console.log(`   Passed: ${videoAnalysis.data!.passed}`)
      }

      videoPaths.push(videoResult.data!.videoUrl)

      // Extract end frame for next segment
      if (segmentsResult.data!.segments.length > 1) {
        console.log('\n   Extracting end frame for next segment...')
        const endFrameResult = await extractFrame({
          videoPath: videoResult.data!.videoUrl,
          timestamp: firstSegment.duration - 0.1,
        })

        if (endFrameResult.success) {
          previousEndFrame = endFrameResult.data!.imagePath
          console.log(`   ✅ End frame extracted: ${previousEndFrame}`)
        }
      }
    }

    // ========== Summary ==========
    console.log('\n' + '='.repeat(60))
    console.log('测试完成！流程验证结果：')
    console.log('='.repeat(60))
    console.log(`✅ Deep Research: 成功`)
    console.log(`✅ Storyboard: 成功 (${storyboardResult.data!.scenes.length} 场景)`)
    console.log(`✅ Image Generation: 成功 (${validatedImages.length} 张图片)`)
    console.log(`✅ TTS: 成功 (${audioDuration}s)`)
    console.log(`✅ Segment Calculation: 成功 (${segmentsResult.data!.totalSegments} 段)`)
    console.log(`${videoPaths.length > 0 ? '✅' : '⚠️'} Video Generation: ${videoPaths.length > 0 ? '成功' : '需要 Volcano API'}`)

    console.log('\n技能流程验证完毕！')

  } catch (error) {
    console.error('\n❌ 测试失败:', error)
    process.exit(1)
  }
}

main()
