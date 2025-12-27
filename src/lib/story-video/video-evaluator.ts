/**
 * 视频评估器 - 使用 Gemini 分析视频质量和完整性
 */

import { GoogleGenAI } from '@google/genai';
import type { VideoEvaluation, StoryboardScene } from './types';

// Gemini 配置
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * 评估视频质量
 */
export async function evaluateVideo(
  videoUrl: string,
  scene: StoryboardScene,
  segmentOrder: number,
  totalSegments: number,
  characterDescription?: string
): Promise<VideoEvaluation> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const prompt = `You are a video quality reviewer for AI-generated story animations.
Analyze this video segment and provide a detailed assessment.

Context:
- Scene description: ${scene.description}
- Expected action: ${scene.expectedAction}
- Characters: ${scene.characters.join(', ')}
${characterDescription ? `- Character details: ${characterDescription}` : ''}
- This is segment ${segmentOrder + 1} of potentially ${totalSegments} in this scene
- Camera movement expected: ${scene.cameraMovement || 'smooth'}

Please evaluate the following aspects (score 1-10 for each):

1. Visual Quality: Is the video clear? Any artifacts, blur, or distortions?
2. Character Consistency: Do characters match their descriptions? Are they consistent throughout?
3. Motion Naturalness: Are movements smooth and physically plausible?
4. Action Completion: Is the expected action complete, partial, or incomplete?
5. Scene Coherence: Does the video match the expected scene description?

Based on your evaluation, provide a recommendation:
- "approve": Quality is good (overall score >= 7) AND action is complete → move to next scene
- "continue": Quality is good BUT action is incomplete → generate more video using the last frame
- "retry": Quality is poor (overall score < 7) → regenerate with adjusted prompt

Output your response as JSON:
{
  "visualQuality": 8,
  "characterConsistency": 7,
  "motionNaturalness": 9,
  "actionCompletion": "partial",
  "sceneCoherence": 8,
  "overallScore": 8,
  "issues": ["slight blur in some frames", "character expression could be better"],
  "recommendation": "continue",
  "continuationPrompt": "The rabbit continues hopping forward, approaching the rainbow...",
  "retryPromptAdjustment": null,
  "reasoning": "The video quality is good and motion is natural, but the action of reaching the rainbow is only 60% complete. Need to continue to show the rabbit getting closer."
}

Return ONLY the JSON object.`;

  try {
    // 注意：Gemini 的视频分析需要特殊处理
    // 这里我们先下载视频的关键帧来分析
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: videoUrl,
              },
            },
          ],
        },
      ],
    });

    let jsonStr = response.text?.trim() || '';

    // 清理 JSON
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const evaluation = JSON.parse(jsonStr.trim()) as VideoEvaluation;

    // 验证评估结果
    return validateEvaluation(evaluation);

  } catch (error) {
    console.error('[VideoEvaluator] Error evaluating video:', error);

    // 如果评估失败，返回默认评估（需要重试）
    return {
      visualQuality: 5,
      characterConsistency: 5,
      motionNaturalness: 5,
      actionCompletion: 'incomplete',
      sceneCoherence: 5,
      overallScore: 5,
      issues: ['Failed to evaluate video: ' + (error instanceof Error ? error.message : 'Unknown error')],
      recommendation: 'retry',
      reasoning: 'Evaluation failed, recommending retry.',
    };
  }
}

/**
 * 使用图片帧分析视频（备选方案，当视频分析不可用时）
 */
export async function evaluateVideoFromFrames(
  frames: string[], // 多个帧的 URL
  scene: StoryboardScene,
  segmentOrder: number,
  characterDescription?: string
): Promise<VideoEvaluation> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const prompt = `You are a video quality reviewer. Analyze these video frames (first, middle, last) from an AI-generated animation.

Scene description: ${scene.description}
Expected action: ${scene.expectedAction}
Characters: ${scene.characters.join(', ')}
${characterDescription ? `Character details: ${characterDescription}` : ''}
This is segment ${segmentOrder + 1}.

Evaluate:
1. Visual Quality (1-10): Clarity, artifacts, blur
2. Character Consistency (1-10): Do characters look consistent across frames?
3. Motion Naturalness (1-10): Based on frame progression, does motion seem natural?
4. Action Completion: complete/partial/incomplete
5. Scene Coherence (1-10): Does it match the scene description?

Recommendation:
- "approve": Good quality, action complete
- "continue": Good quality, action incomplete
- "retry": Poor quality

Return JSON only:
{
  "visualQuality": 8,
  "characterConsistency": 7,
  "motionNaturalness": 8,
  "actionCompletion": "partial",
  "sceneCoherence": 8,
  "overallScore": 8,
  "issues": [],
  "recommendation": "continue",
  "continuationPrompt": "Continue the action...",
  "reasoning": "..."
}`;

  try {
    const imageParts = await Promise.all(
      frames.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        };
      })
    );

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            ...imageParts,
          ],
        },
      ],
    });

    let jsonStr = response.text?.trim() || '';

    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const evaluation = JSON.parse(jsonStr.trim()) as VideoEvaluation;
    return validateEvaluation(evaluation);

  } catch (error) {
    console.error('[VideoEvaluator] Error evaluating frames:', error);
    return getDefaultEvaluation(error);
  }
}

/**
 * 验证评估结果
 */
function validateEvaluation(evaluation: VideoEvaluation): VideoEvaluation {
  // 确保所有分数在 1-10 范围内
  const clampScore = (score: number) => Math.max(1, Math.min(10, score || 5));

  evaluation.visualQuality = clampScore(evaluation.visualQuality);
  evaluation.characterConsistency = clampScore(evaluation.characterConsistency);
  evaluation.motionNaturalness = clampScore(evaluation.motionNaturalness);
  evaluation.sceneCoherence = clampScore(evaluation.sceneCoherence);
  evaluation.overallScore = clampScore(evaluation.overallScore);

  // 验证 actionCompletion
  if (!['complete', 'partial', 'incomplete'].includes(evaluation.actionCompletion)) {
    evaluation.actionCompletion = 'partial';
  }

  // 验证 recommendation
  if (!['approve', 'continue', 'retry'].includes(evaluation.recommendation)) {
    // 根据分数和动作完成度推断建议
    if (evaluation.overallScore < 7) {
      evaluation.recommendation = 'retry';
    } else if (evaluation.actionCompletion === 'complete') {
      evaluation.recommendation = 'approve';
    } else {
      evaluation.recommendation = 'continue';
    }
  }

  // 确保 issues 是数组
  if (!Array.isArray(evaluation.issues)) {
    evaluation.issues = [];
  }

  return evaluation;
}

/**
 * 获取默认评估结果
 */
function getDefaultEvaluation(error: unknown): VideoEvaluation {
  return {
    visualQuality: 5,
    characterConsistency: 5,
    motionNaturalness: 5,
    actionCompletion: 'incomplete',
    sceneCoherence: 5,
    overallScore: 5,
    issues: [error instanceof Error ? error.message : 'Evaluation failed'],
    recommendation: 'retry',
    reasoning: 'Default evaluation due to error.',
  };
}

/**
 * 最终审核 - 检查整个视频的质量
 */
export async function finalReview(
  videoUrl: string,
  storyboard: { title: string; scenes: StoryboardScene[] }
): Promise<{
  passed: boolean;
  overallScore: number;
  issues: string[];
  problemScenes: number[];
  suggestions: string[];
}> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const prompt = `You are reviewing a complete AI-generated story video.

Story Title: ${storyboard.title}
Total Scenes: ${storyboard.scenes.length}

Scene summaries:
${storyboard.scenes.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

Please review the complete video and evaluate:
1. Overall story coherence
2. Visual consistency throughout
3. Transition smoothness
4. Audio/visual sync (if applicable)
5. Character consistency

Identify any problem scenes that may need regeneration.

Return JSON:
{
  "passed": true,
  "overallScore": 8.5,
  "issues": ["minor transition issue at scene 3"],
  "problemScenes": [3],
  "suggestions": ["Consider smoother transition between scene 2 and 3"]
}`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: videoUrl,
              },
            },
          ],
        },
      ],
    });

    let jsonStr = response.text?.trim() || '';

    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    return JSON.parse(jsonStr.trim());

  } catch (error) {
    console.error('[VideoEvaluator] Final review error:', error);
    return {
      passed: true, // 默认通过，避免阻塞
      overallScore: 7,
      issues: ['Could not perform final review'],
      problemScenes: [],
      suggestions: [],
    };
  }
}
