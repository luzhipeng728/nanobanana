/**
 * 配图提示词生成器 v7
 * 使用 AI 动态生成图文并茂的信息图提示词
 *
 * v7 新特性：
 * - 智能决定每段解说需要多少张图片（1-3张）
 * - 根据内容长度和复杂度分配图片
 * - 每张图片包含丰富的文字内容
 *
 * 支持不同模型的提示词优化：
 * - NanoBanana/NanoBanana Pro (Gemini): 支持 hex 颜色代码
 * - Seedream 4.5: 使用描述性颜色名称（不支持 hex 代码）
 */

import Anthropic from "@anthropic-ai/sdk";
import { ScriptSegment, ImagePromptConfig, ImageResult, ImageBatchConfig, TTSResult, ResearchVideoEvent, ImageGenerationPlan, SegmentImage } from "./types";
import { generateImage } from "@/lib/image-generation";
import { CLAUDE_MODEL } from "@/lib/claude-config";

const anthropic = new Anthropic();

/**
 * 判断是否为 Seedream 模型
 */
function isSeedreamModel(model: string): boolean {
  return model.toLowerCase().includes('seedream');
}

// ============================================
// Gemini/NanoBanana 专用指南（支持 hex 颜色）
// ============================================
const IMAGE_GENERATION_GUIDE_GEMINI = `
## Gemini/NanoBanana 图片生成最佳实践

1. **叙事化描述** > 关键词堆砌：用自然语言完整描述场景
2. **详细具体**：描述材质、结构、元素细节
3. **分步指令**：复杂场景分段描述（先背景、再前景、最后关键道具）
4. **摄影术语**：使用 wide-angle shot、cinematic lighting、shallow depth of field 等
5. **中文文字**：用双引号包裹，如 "今日AI速报"，限制 ≤200 字/张
6. **分辨率**：使用 4K resolution

## 信息图设计规范

### 背景层 (BACKGROUND)
- 深色渐变：deep navy (#0f172a) to charcoal (#1e293b)
- 科技感元素：circuit board patterns, holographic particles, data streams
- 氛围光效：soft cyan-purple ambient glow

### 标题层 (HEADER)
- 大标题：bold white text with cyan glow, 48pt equivalent
- 副标题/日期：holographic pill badge style
- 分隔线：thin cyan horizontal line

### 内容层 (CONTENT CARDS)
- Glassmorphism 卡片：frosted glass effect, backdrop blur
- 编号徽章：numbered circle badges (1, 2, 3...)
- 颜色编码：cyan (#06b6d4), purple (#a855f7), emerald (#10b981), amber (#f59e0b), rose (#f43f5e) 轮换
- 中文文字清晰显示在卡片上

### 装饰层 (DECORATIVE)
- 浮动元素：translucent hexagons, holographic icons
- 数据可视化：mini charts, sparklines at low opacity
- 光效：lens flare, particle dust
`;

// ============================================
// Seedream 4.5 专用指南（使用描述性颜色名称）
// ============================================
const IMAGE_GENERATION_GUIDE_SEEDREAM = `
## Seedream 4.5 图片生成最佳实践

**重要：Seedream 不支持 hex 颜色代码（如 #0f172a），必须使用描述性颜色名称！**

1. **叙事化描述** > 关键词堆砌：用自然语言完整描述场景
2. **详细具体**：描述材质、结构、元素细节
3. **颜色描述**：使用 "deep navy blue"、"dark charcoal gray" 等描述性名称，禁止使用 #开头的颜色代码
4. **中文文字**：用双引号包裹，如 "今日AI速报"，限制 ≤100 字/张
5. **分辨率**：使用 4K resolution, ultra high quality

## 信息图设计规范（Seedream 优化版）

### 背景层 (BACKGROUND)
- 深色渐变：deep navy blue gradient to dark charcoal gray
- 科技感元素：subtle circuit board patterns, glowing particles, digital data streams
- 氛围光效：soft cyan and purple ambient lighting

### 标题层 (HEADER)
- 大标题：bold white text with cyan glowing effect
- 副标题/日期：modern pill-shaped badge design
- 分隔线：thin glowing cyan line

### 内容层 (CONTENT CARDS)
- 毛玻璃卡片：frosted glass cards with semi-transparent background
- 编号徽章：circular numbered badges with glowing borders
- 颜色编码：bright cyan, vibrant purple, emerald green, warm amber, soft rose 轮换使用
- 每张卡片有微妙的彩色边框发光效果

### 装饰层 (DECORATIVE)
- 浮动几何元素：translucent hexagons at corners
- 科技图标：small holographic icons floating
- 微妙粒子效果：subtle glowing particles scattered

### 禁止事项
- 不要使用任何 # 开头的颜色代码
- 不要使用 RGB 或 RGBA 数值
- 所有颜色必须用英文描述性词语
`;

/**
 * 根据模型选择合适的提示词指南
 */
function getImageGenerationGuide(imageModel: string): string {
  if (isSeedreamModel(imageModel)) {
    return IMAGE_GENERATION_GUIDE_SEEDREAM;
  }
  return IMAGE_GENERATION_GUIDE_GEMINI;
}

/**
 * 使用 AI 为每段解说生成图片 prompt
 * v6: 深度分析解说内容，生成信息丰富的图片提示词
 */
async function generatePromptWithAI(
  segment: ScriptSegment,
  topic: string,
  imageModel: string = 'nano-banana'
): Promise<string> {
  const chapterTitle = segment.chapterTitle || `第${segment.order + 1}章`;
  const keyPoints = segment.keyPoints || [];
  const visualStyle = segment.visualStyle || 'infographic';
  const fullText = segment.text; // 使用完整解说文本

  // 根据模型选择合适的指南
  const guide = getImageGenerationGuide(imageModel);
  const isSeedream = isSeedreamModel(imageModel);

  // 构建给 AI 的指令 - v6 大幅增强
  const systemPrompt = `你是一位专业的信息图设计师和图片提示词工程师。你的任务是将解说文案转化为**信息极其丰富**的信息图提示词。

${guide}

## 核心原则：内容为王
用户看着这张信息图，应该能够**完整理解**这一章节的核心内容，不需要听解说就能获取关键信息。

## 你必须做到：

### 1. 深度提取内容（最重要！）
从解说文本中提取：
- **所有具体数据**：百分比、金额、数量、日期、排名等
- **所有人名/公司名/产品名**：如 "OpenAI"、"Claude"、"马斯克"
- **所有技术术语/概念**：如 "多模态"、"AGI"、"大语言模型"
- **所有因果关系**：A导致B、因为X所以Y
- **所有对比关系**：A vs B、优势/劣势

### 2. 内容布局设计（最大化利用空间）
- **标题区（10%）**：章节主标题 + 副标题/摘要
- **主体卡片区（80%）**：**8-12 张内容卡片**，网格排列（2-3 列 x 3-4 行）
- **底部信息条（10%）**：关键结论或来源

### 3. 卡片内容要求（塞满内容！）
每张卡片是一个**完整的信息点**，20-40 字：
❌ 错误示例："AI发展" （4字太少！）
❌ 错误示例：只有 4 张卡片（太少，浪费空间！）
✅ 正确示例："GPT-4.5 发布：多模态能力提升 40%，支持 128K 上下文，处理图片视频" （35字）
✅ 一张图必须包含 8-12 张这样的卡片！

### 4. 中文文字规范
- 所有中文用双引号包裹
- 可以包含大量中文（这是用户的核心需求）
- 保留原文的关键术语和数据
${isSeedream ? '\n### 5. Seedream 颜色规范\n**严禁使用任何 # 开头的颜色代码！只能用描述性颜色名称（如 deep navy blue, vibrant cyan）**' : ''}

## 输出格式
直接输出英文提示词（中文内容用引号包裹），不要任何解释。
提示词长度应该在 800-1500 字，确保信息完整。`;

  const colorNote = isSeedream
    ? 'Use descriptive color names only (deep navy blue, vibrant cyan, etc). NO hex codes!'
    : 'Use hex color codes for precise colors (#0f172a, #06b6d4, etc)';

  const userPrompt = `## 章节信息
- 章节标题：${chapterTitle}
- 视觉风格：${visualStyle}

## 完整解说文案（必须深度分析提取所有信息！）
${fullText}

## 额外关键要点
${keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## 生成要求
1. 仔细阅读解说文案，提取**所有**具体信息（数据、人名、产品名、技术术语等）
2. 设计 4-8 张内容卡片，每张卡片是一个**完整的信息点**
3. 如果有数据（百分比、金额、排名等），必须大字号突出显示
4. 标题 "${chapterTitle}" 显示在顶部
5. 使用深色科技感背景 + glassmorphism 卡片
6. 4K 分辨率，专业设计
7. 颜色：${colorNote}

请生成一个**信息极其丰富**的信息图提示词，让用户看图就能理解这一章节的完整内容！`;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096, // 增加输出长度
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      return content.text.trim();
    }
  } catch (error) {
    console.error("[ImagePrompt] AI generation failed:", error);
  }

  // 如果 AI 生成失败，使用备用模板
  return generateFallbackPrompt(segment, topic, imageModel);
}

/**
 * 备用模板（当 AI 生成失败时使用）
 * v6: 增强内容丰富度
 */
function generateFallbackPrompt(segment: ScriptSegment, topic: string, imageModel: string = 'nano-banana'): string {
  const chapterTitle = segment.chapterTitle || `第${segment.order + 1}章`;
  const keyPoints = segment.keyPoints || [];
  const fullText = segment.text;
  const isSeedream = isSeedreamModel(imageModel);

  // 从解说文本中提取更多信息
  const sentences = fullText.split(/[。！？]/).filter(s => s.trim().length > 10).slice(0, 6);

  const colors = ['cyan', 'purple', 'emerald', 'amber', 'rose', 'blue'];

  // 构建丰富的卡片内容
  const contentCards = sentences.map((sentence, i) => {
    const color = colors[i % colors.length];
    const cleanSentence = sentence.trim().substring(0, 80);
    return `Card ${i + 1}: Glassmorphism card with ${color} glowing border, numbered badge "${i + 1}", displaying Chinese text "${cleanSentence}" in white text with good readability.`;
  }).join(' ');

  // 额外的关键要点
  const keyPointsCards = keyPoints.map((point, i) => {
    const color = colors[(i + sentences.length) % colors.length];
    return `Highlight card with ${color} accent: "${point}"`;
  }).join(' ');

  // Seedream 专用模板（无 hex 颜色代码）
  if (isSeedream) {
    return `A professional Chinese infographic slide with RICH and DETAILED content for educational purposes.

BACKGROUND: Deep gradient from dark navy blue to charcoal gray. Subtle tech grid pattern at low opacity. Soft cyan and purple ambient glow. Floating holographic particles scattered across.

HEADER SECTION:
- Large Chinese title "${chapterTitle}" in bold white text with cyan outer glow effect, centered at top
- Subtitle line summarizing the topic in smaller text
- Thin glowing cyan separator line below the header

MAIN CONTENT AREA (4-6 information cards arranged in grid):
${contentCards}

HIGHLIGHT SECTION:
${keyPointsCards || 'Key insights displayed in accent colored pill badges'}

VISUAL ELEMENTS:
- Each card has frosted glass effect with semi-transparent background
- Numbered circle badges with glowing borders on each card
- Text is clearly readable with good contrast
- Cards have generous padding and proper spacing

DECORATIVE ELEMENTS:
- Floating hexagons at corners with low opacity
- Small holographic tech icons floating
- Subtle particle dust effect
- Soft lens flare effects

TECHNICAL REQUIREMENTS:
- Ultra high quality, 4K resolution
- Professional infographic design
- All Chinese text must be CLEARLY VISIBLE and COMPLETE
- The infographic should convey comprehensive information from the content`;
  }

  // Gemini/NanoBanana 模板（支持 hex 颜色）
  return `A professional Chinese infographic slide with RICH and DETAILED content for educational purposes.

BACKGROUND: Deep gradient from dark navy (#0f172a) to charcoal (#1e293b). Subtle tech grid pattern at 5% opacity. Soft cyan-purple ambient glow. Floating holographic particles scattered across.

HEADER SECTION:
- Large Chinese title "${chapterTitle}" in bold white text (48pt) with cyan (#06b6d4) outer glow, centered at top
- Subtitle line summarizing the topic in smaller text
- Thin cyan separator line below the header

MAIN CONTENT AREA (4-6 information cards arranged in grid):
${contentCards}

HIGHLIGHT SECTION:
${keyPointsCards || 'Key insights displayed in accent colored pill badges'}

VISUAL ELEMENTS:
- Each card has frosted glass effect (backdrop-blur) with semi-transparent background
- Numbered circle badges with glowing borders (colors: #06b6d4, #a855f7, #10b981, #f59e0b, #f43f5e)
- Text is clearly readable with good contrast
- Cards have generous padding and proper spacing

DECORATIVE ELEMENTS:
- Floating hexagons at corners (10% opacity)
- Small holographic tech icons floating
- Subtle particle dust effect
- Soft lens flare effects

TECHNICAL REQUIREMENTS:
- Ultra high quality, 4K resolution
- Professional infographic design
- All Chinese text must be CLEARLY VISIBLE and COMPLETE
- The infographic should convey comprehensive information from the content`;
}

/**
 * 根据配置生成图片提示词
 */
export async function generateImagePrompt(
  config: ImagePromptConfig & { imageModel?: string; topic?: string }
): Promise<string> {
  const { segment, topic = '', imageModel = 'nano-banana' } = config;
  return generatePromptWithAI(segment, topic, imageModel);
}

/**
 * 智能图片规划器 v7
 * 让 AI 分析解说内容，决定需要多少张图片，以及每张图片的内容和时长分配
 */
export async function generateMultiImagePlan(
  segment: ScriptSegment,
  topic: string,
  imageModel: string = 'nano-banana'
): Promise<ImageGenerationPlan> {
  const chapterTitle = segment.chapterTitle || `第${segment.order + 1}章`;
  const fullText = segment.text;
  const textLength = fullText.length;
  const isSeedream = isSeedreamModel(imageModel);

  // 根据模型选择合适的指南
  const guide = getImageGenerationGuide(imageModel);
  const colorNote = isSeedream
    ? '使用描述性颜色名称（如 deep navy blue），禁止使用 hex 颜色代码'
    : '可使用 hex 颜色代码（如 #0f172a）';

  const systemPrompt = `你是一位专业的信息图设计师。你需要分析解说内容，决定应该生成多少张信息图，并为每张图片规划内容。

## 🔴 核心原则：尽量只用一张图！

**每张图片都有成本，我们要最大化每张图片的内容量，减少不必要的图片数量！**

1. **默认使用一张图** - 绝大多数情况下，一张信息图就能展示所有内容
2. **一张图可以包含 8-12 张卡片** - 足够容纳丰富的信息
3. **只有信息量极其庞大时才考虑分图** - 超过 15 个独立信息点才考虑分图
4. **省钱是优先级** - 用户明确要求节省图片数量

## 决策标准（严格！）
- 解说词 < 500 字：**必须 1 张图**
- 解说词 500-800 字：**优先 1 张图**，只有超过 12 个独立信息点才考虑 2 张
- 解说词 > 800 字：最多 2 张图（极其罕见情况才用 3 张）
- **95% 的情况应该只用 1 张图！**

## 时长分配
- 单张图：durationRatio = 1.0（这是最常见的情况）
- 多张图：根据每张图包含的内容量分配比例，比例之和 = 1.0

## 输出格式
返回 JSON（不要其他内容）：
{
  "imageCount": 1,
  "reasoning": "内容简洁，一张图可以完整展示",
  "images": [
    {
      "contentPortion": "这张图片涵盖的具体内容描述",
      "durationRatio": 1.0,
      "prompt": "完整的英文图片生成提示词（中文内容用双引号包裹）"
    }
  ]
}

${guide}

## 🔴 超级重要：单张图片内容最大化 🔴

**目标：把整个章节的所有重要信息都塞进一张图片！省钱！**

### 内容量硬性要求
- 每张图片必须至少包含 **200-400 个中文字**
- 必须设计 **8-12 张内容卡片**，每张卡片包含 **20-40 个中文字**
- 把整个章节的核心内容全部展示出来！

### 错误示例（绝对禁止）
❌ 卡片太少：只有 3-4 张卡片（浪费图片空间！）
❌ 内容太简单："AI技术"（4个字，太少！）
❌ 分成多张图：明明一张图能装下的内容分成两张（浪费钱！）

### 正确示例（必须这样）
一张图包含 8-12 张卡片：
✅ 卡片1："OpenAI 发布 GPT-4.5，多模态能力提升 40%，支持实时语音对话和图像理解"（35字）
✅ 卡片2："Claude 3.5 Sonnet 在代码生成任务上超越 GPT-4，速度提升 2 倍，成本降低 50%"（38字）
✅ 卡片3："谷歌 Gemini 2.0 支持 100 万 token 上下文，可以处理完整书籍和长视频"（35字）
✅ 卡片4："国内大模型百度文心、阿里通义、讯飞星火纷纷发布新版本，追赶国际水平"（33字）
✅ 卡片5："微软 Copilot 全面集成 Windows 和 Office，月活用户突破 1 亿"（30字）
✅ 卡片6："AI 生成视频领域 Sora 引发热潮，国内快手可灵、字节即梦快速跟进"（32字）
✅ 卡片7："开源模型 Llama 3.1 405B 发布，性能接近闭源模型，降低 AI 门槛"（33字）
✅ 卡片8："AI 芯片市场英伟达一家独大，市值突破 3 万亿美元，股价年涨幅超 200%"（35字）

### 布局设计（最大化利用空间）
1. **顶部标题区（10%）**：大标题 + 副标题
2. **主体卡片区（80%）**：8-12 张卡片，网格排列（2-3 列 x 3-4 行）
3. **底部信息条（10%）**：关键结论或来源

### 必须提取的信息（全部塞进一张图）
- 所有人名、公司名、产品名
- 所有数据（百分比、金额、数量、日期、排名）
- 所有因果关系和对比关系
- 所有关键结论和观点
- 解说词中 90% 以上的核心信息

## 提示词长度和质量
- 提示词必须 **1500-2500 字**
- 必须详细描述每张卡片的完整中文内容
- ${colorNote}

## 最终检查
在决定图片数量前问自己：**这些内容真的需要两张图吗？**
答案 95% 的情况应该是：**不需要，一张图足够！**`;

  const userPrompt = `## 章节信息
- 章节标题：${chapterTitle}
- 解说词长度：${textLength} 字

## 完整解说内容
${fullText}

## 任务要求
1. **强烈建议使用 1 张图！** 只有信息量极其庞大（超过 15 个独立信息点）才考虑分图
2. 用 8-12 张内容卡片把所有核心信息都装进一张图
3. 每张卡片 20-40 字，写完整的句子，不是关键词
4. 生成详细的提示词（1500-2500 字）

**记住：省钱是第一优先级，不要浪费图片！**`;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      // 解析 JSON
      let parsed: ImageGenerationPlan;
      try {
        parsed = JSON.parse(content.text);
      } catch {
        // 尝试从代码块中提取
        const jsonMatch = content.text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          const rawJson = content.text.match(/\{[\s\S]*\}/);
          if (!rawJson) {
            throw new Error("无法解析 JSON");
          }
          parsed = JSON.parse(rawJson[0]);
        }
      }

      // 验证和规范化
      if (!parsed.images || parsed.images.length === 0) {
        throw new Error("没有生成图片计划");
      }

      // 确保比例之和为 1
      const totalRatio = parsed.images.reduce((sum, img) => sum + (img.durationRatio || 0), 0);
      if (totalRatio !== 1) {
        parsed.images = parsed.images.map(img => ({
          ...img,
          durationRatio: (img.durationRatio || 1 / parsed.images.length) / totalRatio
        }));
      }

      parsed.imageCount = parsed.images.length;
      return parsed;
    }
  } catch (error) {
    console.error("[MultiImagePlan] AI 规划失败:", error);
  }

  // 失败时使用默认单图模式
  const fallbackPrompt = await generatePromptWithAI(segment, topic, imageModel);
  return {
    imageCount: 1,
    reasoning: "使用默认单图模式",
    images: [{
      contentPortion: fullText.substring(0, 100) + "...",
      durationRatio: 1.0,
      prompt: fallbackPrompt
    }]
  };
}

/**
 * 检测是否为敏感词错误
 */
function isSensitiveContentError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  return message.includes('sensitive') ||
    message.includes('敏感') ||
    (message.includes('400') && message.includes('input text'));
}

/**
 * 使用 AI 润色提示词，移除可能触发敏感词过滤的内容
 */
async function sanitizePromptWithAI(originalPrompt: string): Promise<string> {
  console.log('[Sanitize] 开始润色提示词，移除敏感内容...');

  const systemPrompt = `你是一位专业的图片提示词优化专家。用户的提示词触发了图片生成 API 的敏感词过滤。

你的任务是：
1. 分析原始提示词，识别可能触发过滤的内容
2. 重写提示词，保留核心设计意图，但移除或替换敏感内容

常见触发过滤的内容：
- 政治敏感词汇（领导人名字、政治事件等）
- 暴力、战争相关描述
- 医疗、药物相关敏感词
- 宗教敏感内容
- 版权人物/品牌（有时需要模糊化）
- 某些中文人名或专有名词

处理策略：
- 政治人物 → 使用"商业领袖"、"行业专家"等通用描述
- 具体公司名 → 使用"科技公司"、"行业巨头"等通用描述
- 医疗相关 → 使用更委婉的科学术语
- 保留设计风格、颜色、布局等技术描述
- 保留数据和统计信息（如果没有敏感来源）

输出要求：
- 直接输出润色后的提示词
- 不要任何解释或说明
- 保持相似的长度和详细程度
- 确保图片仍然有丰富的信息内容`;

  const userPrompt = `以下提示词触发了敏感词过滤，请润色后重新输出：

${originalPrompt}`;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type === "text") {
      console.log('[Sanitize] 提示词润色完成');
      return content.text.trim();
    }
  } catch (error) {
    console.error('[Sanitize] AI 润色失败:', error);
  }

  // 如果 AI 润色失败，尝试简单的替换策略
  return originalPrompt
    .replace(/[""「」『』【】]/g, '') // 移除中文引号
    .replace(/[\u4e00-\u9fa5]{2,20}/g, (match) => {
      // 对较长的中文保留，但缩短
      return match.length > 10 ? match.substring(0, 10) + '...' : match;
    });
}

/**
 * 带敏感词重试的图片生成
 */
async function generateImageWithRetry(
  prompt: string,
  imageModel: string,
  aspectRatio: string,
  maxRetries: number = 2
): Promise<{ imageUrl: string; finalPrompt: string }> {
  let currentPrompt = prompt;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateImage({
        prompt: currentPrompt,
        model: imageModel as "nano-banana" | "nano-banana-pro" | "seedream-4.5",
        aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
        resolution: "4K",
      });

      if (!result.success || !result.imageUrl) {
        throw new Error(result.error || "图片生成失败");
      }

      return {
        imageUrl: result.imageUrl,
        finalPrompt: currentPrompt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 检查是否为敏感词错误
      if (isSensitiveContentError(lastError) && attempt < maxRetries) {
        console.log(`[ImageGen] 检测到敏感词错误，尝试润色提示词 (${attempt + 1}/${maxRetries})...`);
        currentPrompt = await sanitizePromptWithAI(currentPrompt);
        // 继续下一次重试
      } else {
        // 其他错误或已用完重试次数
        throw lastError;
      }
    }
  }

  throw lastError || new Error("图片生成失败");
}

/**
 * 并发池执行器
 * 支持指定并发数，任务完成后立即从队列取下一个任务
 */
async function runConcurrentPool<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  onComplete?: (result: R | null, index: number, error?: Error) => void
): Promise<Array<R | null>> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let currentIndex = 0;

  const processNext = async (): Promise<void> => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      try {
        const result = await processor(item, index);
        results[index] = result;
        onComplete?.(result, index);
      } catch (error) {
        results[index] = null;
        onComplete?.(null, index, error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  // 启动 concurrency 个并发 worker
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

/**
 * 批量生成配图提示词（10 并发队列模式）
 */
export async function generateBatchImagePrompts(
  segments: ScriptSegment[],
  imageModel: string,
  topic: string,
  style?: string,
  aspectRatio?: string,
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<string[]> {
  const total = segments.length;

  sendEvent?.({
    type: "images_progress",
    message: `AI 正在为 ${total} 个章节生成图片提示词...`,
  });

  // 记录使用的模型
  console.log(`[ImagePrompt] 使用模型: ${imageModel}, Seedream模式: ${isSeedreamModel(imageModel)}`);

  // 使用 10 并发队列生成提示词
  const PROMPT_CONCURRENCY = 10;
  let completedCount = 0;

  const results = await runConcurrentPool(
    segments,
    PROMPT_CONCURRENCY,
    async (segment) => {
      return await generatePromptWithAI(segment, topic, imageModel);
    },
    (result, index) => {
      if (result) {
        completedCount++;
        const segment = segments[index];
        const chapterTitle = segment.chapterTitle || `第${segment.order + 1}章`;
        sendEvent?.({
          type: "images_progress",
          message: `提示词 ${completedCount}/${total}: ${chapterTitle}`,
          progress: Math.round((completedCount / total) * 30), // 0-30% for prompts
        });
      }
    }
  );

  sendEvent?.({
    type: "images_progress",
    message: `提示词生成完成，开始生成图片...`,
  });

  // 过滤出成功的结果，失败的使用备用模板
  return results.map((prompt, index) => {
    if (prompt) return prompt;
    // 如果生成失败，使用备用模板
    return generateFallbackPrompt(segments[index], topic, imageModel);
  });
}

/**
 * 生成单个分段的配图
 */
export async function generateSegmentImage(
  segment: ScriptSegment,
  imagePrompt: string,
  imageModel: string,
  aspectRatio: string
): Promise<ImageResult> {
  const result = await generateImage({
    prompt: imagePrompt,
    model: imageModel as "nano-banana" | "nano-banana-pro" | "seedream-4.5",
    aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
    resolution: "4K", // Gemini 高级和 Seedream 都需要 4K
  });

  if (!result.success || !result.imageUrl) {
    throw new Error(result.error || "Image generation failed");
  }

  return {
    segmentOrder: segment.order,
    imageUrl: result.imageUrl,
    prompt: imagePrompt,
  };
}

/**
 * 批量生成配图 v7（支持智能多图模式）
 *
 * 流程：
 * 1. AI 分析每段解说，决定需要 1-3 张图片
 * 2. 并发生成所有图片
 * 3. 返回包含多图信息的结果
 */
export async function generateBatchImages(
  config: ImageBatchConfig & { topic?: string },
  sendEvent?: (event: ResearchVideoEvent) => void
): Promise<ImageResult[]> {
  const { segments, ttsResults, imageModel, aspectRatio, style, topic = '', onProgress } = config;
  const segmentCount = segments.length;

  sendEvent?.({
    type: "images_start",
    message: `开始智能分析 ${segmentCount} 个章节，AI 决定图片数量...`,
    data: { total: segmentCount, imageModel },
  });

  const errors: Array<{ order: number; error: string }> = [];

  // 第一步：AI 规划每个章节的图片数量和内容
  console.log(`[ImageGen v7] 开始 AI 规划 ${segmentCount} 个章节的图片...`);
  const planStartTime = Date.now();

  const PLAN_CONCURRENCY = 5; // 规划并发数（Claude API 调用）
  let planCompletedCount = 0;

  const plans = await runConcurrentPool(
    segments,
    PLAN_CONCURRENCY,
    async (segment) => {
      return await generateMultiImagePlan(segment, topic, imageModel);
    },
    (result, index) => {
      if (result) {
        planCompletedCount++;
        const segment = segments[index];
        const chapterTitle = segment.chapterTitle || `第${segment.order + 1}章`;
        sendEvent?.({
          type: "images_progress",
          message: `规划 ${planCompletedCount}/${segmentCount}: ${chapterTitle} → ${result.imageCount} 张图`,
          progress: Math.round((planCompletedCount / segmentCount) * 20),
        });
      }
    }
  );

  const planElapsed = Math.round((Date.now() - planStartTime) / 1000);

  // 统计总图片数
  const validPlans = plans.filter((p): p is ImageGenerationPlan => p !== null);
  const totalImages = validPlans.reduce((sum, p) => sum + p.imageCount, 0);

  console.log(`[ImageGen v7] 规划完成，共 ${totalImages} 张图片，耗时 ${planElapsed}s`);
  sendEvent?.({
    type: "images_progress",
    message: `规划完成：${segmentCount} 个章节 → ${totalImages} 张图片，开始生成...`,
    progress: 20,
  });

  // 第二步：展开所有图片任务
  interface ImageTask {
    segmentIndex: number;
    segmentOrder: number;
    chapterTitle: string;
    imageIndex: number;
    prompt: string;
    durationRatio: number;
  }

  const imageTasks: ImageTask[] = [];
  for (let i = 0; i < segments.length; i++) {
    const plan = plans[i];
    const segment = segments[i];
    if (!plan) continue;

    for (let j = 0; j < plan.images.length; j++) {
      imageTasks.push({
        segmentIndex: i,
        segmentOrder: segment.order,
        chapterTitle: segment.chapterTitle || `第${segment.order + 1}章`,
        imageIndex: j,
        prompt: plan.images[j].prompt,
        durationRatio: plan.images[j].durationRatio,
      });
    }
  }

  // 第三步：并发生成所有图片
  const IMAGE_CONCURRENCY = 10;
  let imageCompletedCount = 0;
  const imageStartTime = Date.now();

  console.log(`[ImageGen v7] 开始生成 ${imageTasks.length} 张图片，并发 ${IMAGE_CONCURRENCY}`);

  const imageResults = await runConcurrentPool(
    imageTasks,
    IMAGE_CONCURRENCY,
    async (task) => {
      // 使用带敏感词重试的图片生成
      const result = await generateImageWithRetry(
        task.prompt,
        imageModel,
        aspectRatio,
        2 // 最多重试 2 次
      );

      return {
        ...task,
        imageUrl: result.imageUrl,
        finalPrompt: result.finalPrompt, // 可能经过润色
      };
    },
    (result, index, error) => {
      imageCompletedCount++;
      const task = imageTasks[index];

      if (result) {
        const imageLabel = imageTasks.length > segmentCount
          ? `${task.chapterTitle} (${task.imageIndex + 1}/${plans[task.segmentIndex]?.imageCount || 1})`
          : task.chapterTitle;

        sendEvent?.({
          type: "images_segment_complete",
          data: {
            segmentOrder: task.segmentOrder,
            imageUrl: result.imageUrl,
            imageIndex: task.imageIndex,
            chapterTitle: task.chapterTitle,
          },
          progress: 20 + Math.round((imageCompletedCount / imageTasks.length) * 80),
          message: `生成 ${imageCompletedCount}/${imageTasks.length}: ${imageLabel}`,
        });
      } else if (error) {
        console.error(`[ImageGen v7] 章节 ${task.segmentOrder} 图片 ${task.imageIndex} 失败:`, error.message);
        errors.push({ order: task.segmentOrder, error: error.message });
      }
    }
  );

  const imageElapsed = Math.round((Date.now() - imageStartTime) / 1000);
  console.log(`[ImageGen v7] 图片生成完成，耗时 ${imageElapsed}s`);

  // 第四步：组装结果，按章节分组
  const results: ImageResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const plan = plans[i];
    if (!plan) continue;

    // 找到该章节的所有图片
    const segmentImages: SegmentImage[] = [];
    for (let j = 0; j < plan.images.length; j++) {
      const imgResult = imageResults.find(
        r => r && r.segmentIndex === i && r.imageIndex === j
      );
      if (imgResult) {
        segmentImages.push({
          index: j,
          imageUrl: imgResult.imageUrl,
          prompt: plan.images[j].prompt,
          durationRatio: plan.images[j].durationRatio,
          contentSummary: plan.images[j].contentPortion,
        });
      }
    }

    if (segmentImages.length > 0) {
      results.push({
        segmentOrder: segment.order,
        imageUrl: segmentImages[0].imageUrl, // 主图（兼容旧模式）
        prompt: segmentImages[0].prompt,
        images: segmentImages, // 多图模式
      });
    }
  }

  results.sort((a, b) => a.segmentOrder - b.segmentOrder);

  if (errors.length > 0) {
    console.error("[ImageGen v7] 生成错误:", errors);
  }

  const totalElapsed = planElapsed + imageElapsed;

  sendEvent?.({
    type: "images_complete",
    data: { results, errors, totalImages },
    message: `信息图生成完成：${segmentCount} 章节 → ${results.length} 个结果（共 ${totalImages} 张图），耗时 ${totalElapsed}s`,
  });

  return results;
}

/**
 * 重新生成单个分段的配图
 */
export async function regenerateSegmentImage(
  segment: ScriptSegment,
  imageModel: string,
  aspectRatio: string,
  topic: string,
  customPrompt?: string
): Promise<ImageResult> {
  const imagePrompt = customPrompt || await generatePromptWithAI(segment, topic, imageModel);
  return generateSegmentImage(segment, imagePrompt, imageModel, aspectRatio);
}

/**
 * 流式生成配图
 */
export async function* generateBatchImagesStream(
  config: ImageBatchConfig & { topic?: string }
): AsyncGenerator<ResearchVideoEvent> {
  const { segments, imageModel, aspectRatio, style, topic = '' } = config;
  const total = segments.length;

  yield {
    type: "images_start",
    message: `开始生成 ${total} 张信息图`,
    data: { total, imageModel },
  };

  yield {
    type: "images_progress",
    message: "AI 正在分析内容并生成图片提示词...",
  };

  const prompts = await generateBatchImagePrompts(segments, imageModel, topic, style, aspectRatio);

  const results: ImageResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    try {
      const result = await generateSegmentImage(
        segment,
        prompts[i],
        imageModel,
        aspectRatio
      );
      results.push(result);

      yield {
        type: "images_segment_complete",
        data: {
          segmentOrder: segment.order,
          imageUrl: result.imageUrl,
          prompt: result.prompt,
          chapterTitle: segment.chapterTitle,
        },
        progress: Math.round(((i + 1) / total) * 100),
        message: `信息图 ${i + 1}/${total}: ${segment.chapterTitle || `章节${segment.order + 1}`}`,
      };
    } catch (error) {
      yield {
        type: "error",
        data: {
          segmentOrder: segment.order,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        message: `分段 ${segment.order + 1} 信息图生成失败`,
      };
    }

    if (i < segments.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  yield {
    type: "images_complete",
    data: { results },
    message: `信息图生成完成，共 ${results.length} 张`,
  };
}
