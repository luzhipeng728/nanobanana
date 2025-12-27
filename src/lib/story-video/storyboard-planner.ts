/**
 * 分镜规划器 - 使用 AI 分析故事并生成分镜脚本
 *
 * 核心设计：
 * - 15秒视频 ≈ 40-50字台词（正常语速3-4字/秒，留空余）
 * - 视频提示词包含：文字显示、配音、动作描述
 * - 支持古诗、儿童故事等多种内容类型
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type {
  Storyboard,
  StoryboardScene,
  CharacterReference,
  ContentType,
  StoryVideoConfig,
  CONTENT_TYPE_CONFIGS,
} from './types';
import { CONTENT_TYPE_CONFIGS as configs } from './types';

// 初始化 AI 客户端
const anthropic = new Anthropic();

// 台词控制常量
const CHARS_PER_SECOND = 3.5;  // 正常语速：3-4字/秒
const BUFFER_SECONDS = 2;      // 留2秒空余
const MAX_CHARS_15S = Math.floor((15 - BUFFER_SECONDS) * CHARS_PER_SECOND);  // ≈45字
const MAX_CHARS_10S = Math.floor((10 - BUFFER_SECONDS) * CHARS_PER_SECOND);  // ≈28字

/**
 * 生成分镜脚本
 */
export async function generateStoryboard(
  story: string,
  config: StoryVideoConfig
): Promise<Storyboard> {
  const contentTypeConfig = configs[config.contentType];

  const systemPrompt = `You are an expert storyboard artist and director for AI-generated videos with voiceover.

Content Type: ${contentTypeConfig.label}
Art Style: ${config.artStyle}
Aspect Ratio: ${config.aspectRatio}
Structure Hint: ${contentTypeConfig.structureHint}

CRITICAL TIMING CONSTRAINTS:
- Normal speech rate: 3-4 Chinese characters per second
- 15-second video: maximum 45 characters narration (leave 2s buffer for silence)
- 10-second video: maximum 28 characters narration
- ALWAYS leave time for the narration to finish naturally
- For poetry (古诗): split by natural pauses (句号、逗号), NOT by line count

SCENE DESIGN FOR VIDEO WITH VOICEOVER:
Each scene should include:
1. Visual description (what the viewer sees)
2. Narration text (what the viewer hears - MUST fit within time limit)
3. On-screen text display (optional: key phrases, poem lines, subtitles)
4. Action/animation (what moves in the scene)
5. Camera movement (how the view changes)
6. Mood and lighting

EXAMPLE FOR POETRY (将进酒):
Scene 1 (15s, ~40 chars):
- narration: "君不见黄河之水天上来，奔流到海不复回" (20字)
- displayText: "黄河之水天上来" (显示在画面上的重点文字)
- description: "Majestic Yellow River flowing from mountains..."
- action: "Water rushing, camera tracking with flow"

OUTPUT FORMAT:
Return a JSON object:
{
  "title": "故事标题",
  "totalDuration": 120,
  "sceneCount": 8,
  "artStyle": "detailed art style for consistency",
  "bgmSuggestion": "background music style",
  "characters": [
    {
      "name": "角色名",
      "description": "physical description",
      "firstAppearance": 0
    }
  ],
  "scenes": [
    {
      "order": 0,
      "description": "detailed visual description",
      "expectedAction": "what happens, movements, animations",
      "characters": ["角色名"],
      "duration": 15,
      "orientation": "landscape",
      "narration": "配音文本 (严格控制字数!)",
      "displayText": "显示在画面上的文字 (可选)",
      "cameraMovement": "pan left, zoom in, tracking shot, etc.",
      "mood": "epic, romantic, mysterious, etc.",
      "lighting": "golden hour, dramatic, soft, etc.",
      "transitionTo": "how scene transitions to next"
    }
  ]
}`;

  const userPrompt = `Please analyze this content and create a detailed storyboard:

${story}

Requirements:
1. Split into scenes based on NARRATION LENGTH (40-45 chars per 15s scene)
2. For poetry: respect natural rhythm and pauses
3. Include displayText for important text to show on screen
4. Each scene needs clear visual description for image generation
5. Include smooth camera movements
6. The art style should be: ${config.artStyle}
7. Aspect ratio is ${config.aspectRatio}

CRITICAL: Count the characters in narration! Maximum 45 chars for 15s, 28 chars for 10s.

Return ONLY the JSON object, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: systemPrompt,
    });

    // 提取 JSON
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // 尝试解析 JSON
    let jsonStr = content.text.trim();

    // 移除可能的 markdown 代码块
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    const storyboard = JSON.parse(jsonStr.trim()) as Storyboard;

    // 验证和补充数据
    return validateAndEnrichStoryboard(storyboard, config);

  } catch (error) {
    console.error('[StoryboardPlanner] Error generating storyboard:', error);
    throw error;
  }
}

/**
 * 验证和补充分镜数据
 */
function validateAndEnrichStoryboard(
  storyboard: Storyboard,
  config: StoryVideoConfig
): Storyboard {
  const orientation = config.aspectRatio === '9:16' ? 'portrait' : 'landscape';

  storyboard.scenes = storyboard.scenes.map((scene, index) => {
    // 验证台词字数
    const narrationLength = scene.narration?.length || 0;
    const maxChars = scene.duration === 15 ? MAX_CHARS_15S : MAX_CHARS_10S;

    if (narrationLength > maxChars) {
      console.warn(
        `[StoryboardPlanner] Scene ${index + 1} narration too long: ${narrationLength} chars (max ${maxChars})`
      );
    }

    return {
      ...scene,
      order: index,
      duration: scene.duration === 15 ? 15 : 10,
      orientation: scene.orientation || orientation,
      characters: scene.characters || [],
      expectedAction: scene.expectedAction || scene.description,
      mood: scene.mood || 'cinematic',
      lighting: scene.lighting || 'natural',
    };
  });

  // 计算总时长
  storyboard.totalDuration = storyboard.scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0
  );

  storyboard.sceneCount = storyboard.scenes.length;

  if (!storyboard.artStyle) {
    storyboard.artStyle = config.artStyle;
  }

  return storyboard;
}

/**
 * 生成首帧图片提示词
 */
export function generateFirstFramePrompt(
  scene: StoryboardScene,
  storyboard: Storyboard,
  characterRefs?: CharacterReference[]
): string {
  // 构建角色描述
  let characterDescriptions = '';
  if (characterRefs && characterRefs.length > 0) {
    const sceneCharacters = characterRefs.filter(
      (c) => scene.characters.includes(c.name)
    );
    if (sceneCharacters.length > 0) {
      characterDescriptions = '\n\nCharacters in this scene:\n' +
        sceneCharacters.map((c) => `- ${c.name}: ${c.description}`).join('\n');
    }
  }

  // 构建提示词
  const prompt = `${storyboard.artStyle}

Scene: ${scene.description}

${scene.expectedAction ? `Action: ${scene.expectedAction}` : ''}
${characterDescriptions}

${scene.transitionFrom ? `This scene starts: ${scene.transitionFrom}` : ''}

High quality, detailed illustration, consistent style, cinematic composition.`;

  return prompt.trim();
}

/**
 * 生成视频提示词 - 包含配音和文字显示
 *
 * Sora2 视频提示词最佳实践:
 * 1. 场景视觉描述
 * 2. 配音/旁白内容 (让AI生成带配音的视频)
 * 3. 画面文字显示 (可选)
 * 4. 动作节拍描述
 * 5. 镜头运动
 * 6. 氛围和灯光
 */
export function generateVideoPrompt(
  scene: StoryboardScene,
  isFirstSegment: boolean = true,
  previousEvaluation?: string
): string {
  const parts: string[] = [];

  // 1. 镜头类型 (具体的电影语言)
  const shotType = scene.cameraMovement?.includes('close')
    ? 'Close-up shot'
    : scene.cameraMovement?.includes('wide')
      ? 'Wide shot'
      : scene.cameraMovement?.includes('aerial')
        ? 'Aerial shot'
        : 'Medium shot';

  parts.push(`${shotType}, eye level`);

  // 2. 视觉场景描述
  parts.push(scene.description);

  // 3. 动作描述
  parts.push(scene.expectedAction);

  // 4. 配音/旁白 - 让视频生成带解说
  if (scene.narration) {
    parts.push(`Voiceover in Chinese: "${scene.narration}"`);
  }

  // 5. 画面文字显示 (如果有)
  if (scene.displayText) {
    parts.push(`Display text on screen: "${scene.displayText}"`);
  }

  // 6. 镜头运动
  const cameraMotion = scene.cameraMovement || 'slow smooth tracking';
  parts.push(`Camera: ${cameraMotion}`);

  // 7. 氛围和灯光
  const mood = scene.mood || 'cinematic';
  const lighting = scene.lighting || 'natural lighting';
  parts.push(`${mood} atmosphere, ${lighting}`);

  // 8. 质量和时间控制
  parts.push('high quality animation, fluid motion');
  parts.push(`complete action and narration within ${scene.duration} seconds`);

  return parts.join('. ') + '.';
}

/**
 * 计算文本可以在多少秒内念完
 */
export function calculateNarrationDuration(text: string): number {
  const charCount = text.replace(/[，。！？、；：""''（）\s]/g, '').length;
  return Math.ceil(charCount / CHARS_PER_SECOND) + BUFFER_SECONDS;
}

/**
 * 将长文本按字数切分成场景
 */
export function splitTextIntoScenes(
  text: string,
  maxCharsPerScene: number = MAX_CHARS_15S
): string[] {
  const scenes: string[] = [];

  // 按句号、感叹号、问号分割
  const sentences = text.split(/([。！？])/).filter(Boolean);

  let currentScene = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // 如果是标点符号，加到当前句子
    if (/^[。！？]$/.test(sentence)) {
      currentScene += sentence;
      continue;
    }

    // 检查加上这句后是否超出限制
    const potentialScene = currentScene + sentence;
    const charCount = potentialScene.replace(/[，。！？、；：""''（）\s]/g, '').length;

    if (charCount <= maxCharsPerScene) {
      currentScene = potentialScene;
    } else {
      // 当前场景已满，保存并开始新场景
      if (currentScene.trim()) {
        scenes.push(currentScene.trim());
      }
      currentScene = sentence;
    }
  }

  // 保存最后一个场景
  if (currentScene.trim()) {
    scenes.push(currentScene.trim());
  }

  return scenes;
}

/**
 * 分析古诗并生成场景 (专门针对将进酒等古诗)
 */
export function analyzePoetryForScenes(poetry: string): Array<{
  narration: string;
  displayText: string;
  suggestedDuration: number;
  charCount: number;
}> {
  const scenes: Array<{
    narration: string;
    displayText: string;
    suggestedDuration: number;
    charCount: number;
  }> = [];

  // 按句号分割古诗
  const lines = poetry.split(/[。]/).filter((line) => line.trim());

  let currentNarration = '';
  let currentDisplay = '';

  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    const charCount = cleanLine.replace(/[，、；：""''（）\s]/g, '').length;

    // 如果当前累积的字数加上新行超过限制，先保存当前场景
    const currentCharCount = currentNarration.replace(/[，、；：""''（）\s]/g, '').length;

    if (currentCharCount + charCount > MAX_CHARS_15S && currentNarration) {
      scenes.push({
        narration: currentNarration + '。',
        displayText: extractKeyPhrase(currentNarration),
        suggestedDuration: 15,
        charCount: currentCharCount,
      });
      currentNarration = cleanLine;
      currentDisplay = '';
    } else {
      currentNarration += (currentNarration ? '，' : '') + cleanLine;
    }
  }

  // 保存最后一个场景
  if (currentNarration) {
    const charCount = currentNarration.replace(/[，、；：""''（）\s]/g, '').length;
    scenes.push({
      narration: currentNarration + '。',
      displayText: extractKeyPhrase(currentNarration),
      suggestedDuration: charCount > MAX_CHARS_10S ? 15 : 10,
      charCount,
    });
  }

  return scenes;
}

/**
 * 从句子中提取关键词句用于显示
 */
function extractKeyPhrase(text: string): string {
  // 取前半句作为显示文字
  const parts = text.split(/[，、]/);
  if (parts.length > 0) {
    return parts[0];
  }
  return text.substring(0, 10);
}

/**
 * 使用 Gemini 分析故事（备选方案）
 */
export async function generateStoryboardWithGemini(
  story: string,
  config: StoryVideoConfig
): Promise<Storyboard> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const contentTypeConfig = configs[config.contentType];

  const prompt = `You are an expert storyboard artist. Analyze this story and create a detailed storyboard for AI video generation with voiceover.

Content Type: ${contentTypeConfig.label}
Art Style: ${config.artStyle}
Aspect Ratio: ${config.aspectRatio}

CRITICAL: Each 15-second scene can have maximum 45 characters of narration (Chinese speech rate: 3-4 chars/sec).

Story:
${story}

Create a JSON storyboard with scenes. Each scene should have:
- order (number)
- description (detailed visual description)
- expectedAction (what happens)
- characters (array of character names)
- duration (10 or 15 seconds)
- orientation (portrait or landscape)
- narration (voiceover text - MAX 45 chars for 15s, 28 chars for 10s!)
- displayText (optional: text to show on screen)
- cameraMovement (pan, zoom, tracking, etc.)
- mood (epic, romantic, mysterious, etc.)
- lighting (golden hour, dramatic, soft, etc.)
- transitionTo (how it transitions to next scene)

Also include:
- title
- characters array with name, description, firstAppearance
- artStyle
- bgmSuggestion

Return ONLY valid JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
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

    const storyboard = JSON.parse(jsonStr.trim()) as Storyboard;
    return validateAndEnrichStoryboard(storyboard, config);

  } catch (error) {
    console.error('[StoryboardPlanner] Gemini error:', error);
    throw error;
  }
}
