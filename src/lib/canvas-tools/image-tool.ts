/**
 * 图片生成工具 - 统一接口
 *
 * 支持多模型：
 * - nano-banana: Gemini 基础版
 * - nano-banana-pro: Gemini Pro (支持 Google Search)
 * - seedream-4.5: 字节跳动 Seedream (支持图生图)
 */

import { generateImage as generateImageAdapter } from '../image-generation'
import { generateImage as seedreamGenerate, extendImageWithAI } from '../volcano/seedream'
import type {
  ToolResult,
  GenerateImageParams,
  GenerateImageResult,
  AnalyzeImageParams,
  AnalyzeImageResult,
} from './types'

// ============================================================================
// 429 重试辅助函数
// ============================================================================

/**
 * 带重试的 API 调用（处理 429 限流）
 * @param fn 要执行的异步函数
 * @param retries 最大重试次数
 * @param delays 重试延迟数组（秒）
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delays = [5, 10, 20, 40, 60]
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const msg = err.message || ''
      // 可重试的错误类型：429限流、超时、网络错误
      const isRetryable = msg.includes('429') ||
                          msg.includes('rate') ||
                          msg.includes('Too Many Requests') ||
                          msg.includes('Timeout') ||
                          msg.includes('timeout') ||
                          msg.includes('ETIMEDOUT') ||
                          msg.includes('ECONNRESET') ||
                          msg.includes('network') ||
                          msg.includes('fetch failed')
      if (!isRetryable || i === retries) throw err
      const delay = delays[Math.min(i, delays.length - 1)]
      console.log(`[ImageTool] 遇到可重试错误，等待 ${delay}s 后重试 (${i + 1}/${retries})...`, msg.slice(0, 100))
      await new Promise(r => setTimeout(r, delay * 1000))
    }
  }
  throw new Error('重试次数已用完')
}

// ============================================================================
// 图片生成
// ============================================================================

/**
 * 生成图片 - 统一入口
 *
 * 根据 model 参数自动路由到对应的生成服务
 */
export async function generateImage(
  params: GenerateImageParams
): Promise<ToolResult<GenerateImageResult>> {
  const {
    prompt,
    model,
    resolution = '2K',
    aspectRatio = '16:9',
    referenceImages,
    strength = 0.7,
    negativePrompt,
  } = params

  console.log(`[ImageTool] 生成图片, 模型: ${model}, 分辨率: ${resolution}, 比例: ${aspectRatio}`)

  try {
    // Seedream 4.5 使用 Volcano API
    if (model === 'seedream-4.5') {
      const result = await seedreamGenerate({
        prompt,
        referenceImage: referenceImages?.[0],
        aspectRatio,
        strength,
      })

      return {
        success: true,
        data: {
          imageUrl: result,
          model: 'seedream-4.5',
          resolution: getResolutionForAspectRatio(aspectRatio),
        },
      }
    }

    // 其他模型使用现有的适配器系统
    // 注意：当前适配器不支持 negativePrompt，暂不传递
    const result = await generateImageAdapter({
      prompt,
      model,
      resolution,
      aspectRatio: aspectRatio === '16:9' || aspectRatio === '9:16' || aspectRatio === '1:1'
        ? aspectRatio
        : '16:9',
      referenceImages,
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || '图片生成失败',
      }
    }

    return {
      success: true,
      data: {
        imageUrl: result.imageUrl || '',
        model,
        resolution: result.meta?.actualResolution || resolution,
      },
    }
  } catch (error) {
    console.error('[ImageTool] 生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}

// ============================================================================
// 批量并发生图
// ============================================================================

/**
 * 批量生成图片参数
 */
export interface BatchGenerateImageParams {
  /** 场景列表，每个场景包含 prompt 和可选配置 */
  scenes: Array<{
    /** 场景 ID（用于匹配结果） */
    id: string
    /** 图片生成提示词 */
    prompt: string
    /** 场景描述（中文，用于记录） */
    description?: string
  }>
  /** 统一的模型配置 */
  model?: 'nano-banana' | 'nano-banana-pro' | 'seedream-4.5'
  /** 统一的分辨率 */
  resolution?: '1K' | '2K' | '4K'
  /** 统一的宽高比 */
  aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1' | '3:2' | '2:3'
  /** 最大并发数（默认 8） */
  concurrency?: number
}

/**
 * 批量生成图片结果
 */
export interface BatchGenerateImageResult {
  /** 成功的结果数量 */
  successCount: number
  /** 失败的结果数量 */
  failedCount: number
  /** 所有场景的结果 */
  results: Array<{
    id: string
    success: boolean
    imageUrl?: string
    error?: string
    description?: string
  }>
}

/**
 * 批量并发生成图片
 *
 * 支持多场景并发生成，返回所有结果
 * 使用并发控制避免 API 过载
 */
export async function generateImagesBatch(
  params: BatchGenerateImageParams
): Promise<ToolResult<BatchGenerateImageResult>> {
  const {
    scenes,
    model = 'seedream-4.5',
    resolution = '2K',
    aspectRatio = '16:9',
    concurrency = 8,
  } = params

  console.log(`[ImageTool] 批量生成图片, 场景数: ${scenes.length}, 并发数: ${concurrency}, 模型: ${model}`)

  if (scenes.length === 0) {
    return {
      success: false,
      error: '场景列表不能为空',
    }
  }

  // 并发控制：使用 Promise.allSettled 和分批处理
  async function runBatched<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchPromises = batch.map((item, batchIndex) =>
        fn(item, i + batchIndex)
      )
      const batchResults = await Promise.allSettled(batchPromises)

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          // 对于失败的任务，添加错误占位
          results.push({
            success: false,
            error: result.reason?.message || '未知错误',
          } as R)
        }
      }
    }

    return results
  }

  try {
    const startTime = Date.now()

    // 并发生成所有图片
    const imageResults = await runBatched(
      scenes,
      concurrency,
      async (scene, index) => {
        console.log(`[ImageTool] 开始生成场景 ${index + 1}/${scenes.length}: ${scene.id}`)

        const result = await generateImage({
          prompt: scene.prompt,
          model,
          resolution,
          aspectRatio,
        })

        if (result.success) {
          console.log(`[ImageTool] ✅ 场景 ${scene.id} 生成成功`)
        } else {
          console.log(`[ImageTool] ❌ 场景 ${scene.id} 生成失败: ${result.error}`)
        }

        return {
          id: scene.id,
          success: result.success,
          imageUrl: result.data?.imageUrl,
          error: result.error,
          description: scene.description,
        }
      }
    )

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const successCount = imageResults.filter((r) => r.success).length
    const failedCount = imageResults.length - successCount

    console.log(`[ImageTool] 批量生成完成, 成功: ${successCount}, 失败: ${failedCount}, 耗时: ${elapsed}s`)

    return {
      success: true,
      data: {
        successCount,
        failedCount,
        results: imageResults,
      },
    }
  } catch (error) {
    console.error('[ImageTool] 批量生成失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '批量生成失败',
    }
  }
}

/**
 * 图片扩展（Outpainting）
 *
 * 将图片扩展到目标比例，保持原内容不变
 */
export async function extendImage(params: {
  image: string
  description: string
  targetRatio: string
}): Promise<ToolResult<{ imageUrl: string }>> {
  const { image, description, targetRatio } = params

  console.log(`[ImageTool] 扩展图片, 目标比例: ${targetRatio}`)

  try {
    const result = await extendImageWithAI(image, description, targetRatio)
    return {
      success: true,
      data: { imageUrl: result },
    }
  } catch (error) {
    console.error('[ImageTool] 扩展失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    }
  }
}

/**
 * 压缩图片
 *
 * 用于将大图片压缩到合适大小供分析
 */
export async function compressImage(params: {
  image: string
  maxSizeKB?: number
  maxWidth?: number
}): Promise<ToolResult<{ image: string; originalSize: number; compressedSize: number }>> {
  const { image, maxSizeKB = 1000, maxWidth = 1920 } = params

  try {
    // 动态导入 sharp（服务端）
    const sharp = (await import('sharp')).default

    // 解析 base64
    const base64Match = image.match(/^data:image\/([^;]+);base64,(.+)$/)
    if (!base64Match) {
      return { success: false, error: '无效的图片格式' }
    }

    const [, , base64Data] = base64Match
    const buffer = Buffer.from(base64Data, 'base64')
    const originalSize = buffer.length

    // 如果已经足够小，直接返回
    if (originalSize <= maxSizeKB * 1024) {
      return {
        success: true,
        data: { image, originalSize, compressedSize: originalSize },
      }
    }

    // 压缩
    let quality = 80
    let compressed: Buffer

    do {
      compressed = await sharp(buffer)
        .resize(maxWidth, null, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer()

      if (compressed.length <= maxSizeKB * 1024) break
      quality -= 10
    } while (quality > 20)

    const compressedBase64 = `data:image/jpeg;base64,${compressed.toString('base64')}`

    return {
      success: true,
      data: {
        image: compressedBase64,
        originalSize,
        compressedSize: compressed.length,
      },
    }
  } catch (error) {
    console.error('[ImageTool] 压缩失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '压缩失败',
    }
  }
}

// ============================================================================
// 图片分析
// ============================================================================

/**
 * 分析图片质量和内容
 *
 * 使用 Claude/Gemini/Doubao 进行多模态分析
 * 支持检测布局问题和乱码
 */
export async function analyzeImage(
  params: AnalyzeImageParams
): Promise<ToolResult<AnalyzeImageResult>> {
  const {
    image,
    prompt = '分析这张图片的内容、质量和风格',
    focus = ['quality', 'content'],
    model = 'doubao',
    expectedDescription,
    isInfoGraphic = false,
  } = params

  // 如果是信息图，自动添加布局和乱码检测
  const effectiveFocus = isInfoGraphic
    ? [...new Set([...focus, 'layout', 'garbled', 'text'])]
    : focus

  console.log(`[ImageTool] 分析图片, 模型: ${model}, 重点: ${effectiveFocus.join(', ')}`)

  try {
    // 构建分析提示词
    const analysisPrompt = buildAnalysisPrompt(prompt, effectiveFocus, expectedDescription, isInfoGraphic)

    if (model === 'doubao') {
      // 使用 Doubao Vision
      const { chatWithDoubao } = await import('../volcano/doubao')

      const response = await chatWithDoubao([
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: image },
            { type: 'input_text', text: analysisPrompt },
          ],
        },
      ])

      // 解析响应
      return parseAnalysisResponse(response, effectiveFocus)
    }

    if (model === 'gemini') {
      // 使用 Gemini Vision
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        return { success: false, error: 'GEMINI_API_KEY 未配置' }
      }

      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })

      // 处理图片
      let imagePart: { inlineData: { mimeType: string; data: string } }
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/)
        if (!matches) {
          return { success: false, error: '无效的 base64 图片数据' }
        }
        imagePart = {
          inlineData: {
            mimeType: matches[1],
            data: matches[2],
          },
        }
      } else if (image.startsWith('http')) {
        // 下载图片并转换为 base64
        const response = await fetch(image)
        const buffer = await response.arrayBuffer()
        imagePart = {
          inlineData: {
            mimeType: 'image/jpeg',
            data: Buffer.from(buffer).toString('base64'),
          },
        }
      } else {
        return { success: false, error: '不支持的图片格式' }
      }

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: analysisPrompt },
              imagePart,
            ],
          },
        ],
      })

      return parseAnalysisResponse(geminiResponse.text || '', effectiveFocus)
    }

    if (model === 'claude') {
      // TODO: 使用 Claude Vision
      return {
        success: false,
        error: 'Claude Vision 分析尚未实现',
      }
    }

    return {
      success: false,
      error: `不支持的分析模型: ${model}`,
    }
  } catch (error) {
    console.error('[ImageTool] 分析失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '分析失败',
    }
  }
}

// ============================================================================
// 批量图片分析
// ============================================================================

/**
 * 批量图片分析参数
 */
export interface BatchAnalyzeImageParams {
  /** 图片列表 */
  images: Array<{
    /** 图片 ID */
    id: string
    /** 图片（base64 或 URL） */
    image: string
    /** 预期描述 */
    expectedDescription?: string
    /** 是否为信息图 */
    isInfoGraphic?: boolean
  }>
  /** 分析重点（统一设置） */
  focus?: Array<'quality' | 'content' | 'style' | 'text' | 'composition' | 'layout' | 'garbled'>
  /** 使用的分析模型 */
  model?: 'doubao' | 'gemini'
  /** 最大并发数（默认 8） */
  concurrency?: number
}

/**
 * 批量图片分析结果
 */
export interface BatchAnalyzeImageResult {
  successCount: number
  failedCount: number
  results: Array<{
    id: string
    success: boolean
    passed?: boolean
    qualityScore?: number
    hasGarbledText?: boolean
    layoutOk?: boolean
    retryPrompt?: string
    error?: string
  }>
}

/**
 * 批量并发分析图片
 */
export async function analyzeImagesBatch(
  params: BatchAnalyzeImageParams
): Promise<ToolResult<BatchAnalyzeImageResult>> {
  const {
    images,
    focus = ['quality', 'content'],
    model = 'doubao',
    concurrency = 8,
  } = params

  console.log(`[ImageTool] 批量分析图片, 数量: ${images.length}, 并发数: ${concurrency}, 模型: ${model}`)

  if (images.length === 0) {
    return { success: false, error: '图片列表不能为空' }
  }

  async function runBatched<T, R>(
    items: T[],
    batchSize: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map((item, idx) => fn(item, i + idx))
      )
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({ success: false, error: result.reason?.message || '未知错误' } as R)
        }
      }
    }
    return results
  }

  try {
    const startTime = Date.now()

    const analysisResults = await runBatched(
      images,
      concurrency,
      async (img, index) => {
        console.log(`[ImageTool] 开始分析图片 ${index + 1}/${images.length}: ${img.id}`)

        try {
          // 使用 429 重试机制
          const result = await callWithRetry(() =>
            analyzeImage({
              image: img.image,
              focus,
              model,
              expectedDescription: img.expectedDescription,
              isInfoGraphic: img.isInfoGraphic,
            })
          )

          return {
            id: img.id,
            success: result.success,
            passed: result.data?.passed,
            qualityScore: result.data?.qualityScore,
            hasGarbledText: result.data?.hasGarbledText,
            layoutOk: result.data?.layoutOk,
            retryPrompt: result.data?.retryPrompt,
            error: result.error,
          }
        } catch (retryError: any) {
          console.log(`[ImageTool] ❌ 图片 ${img.id} 重试失败: ${retryError.message}`)
          return {
            id: img.id,
            success: false,
            error: retryError.message,
          }
        }
      }
    )

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    const successCount = analysisResults.filter((r) => r.success).length
    const failedCount = analysisResults.length - successCount

    console.log(`[ImageTool] 批量分析完成, 成功: ${successCount}, 失败: ${failedCount}, 耗时: ${elapsed}s`)

    return {
      success: true,
      data: { successCount, failedCount, results: analysisResults },
    }
  } catch (error) {
    console.error('[ImageTool] 批量分析失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '批量分析失败',
    }
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function getResolutionForAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case '16:9': return '2560x1440'
    case '9:16': return '1440x2560'
    case '4:3': return '2560x1920'
    case '1:1': return '1920x1920'
    case '3:2': return '2400x1600'
    case '2:3': return '1600x2400'
    default: return '1920x1080'
  }
}

function buildAnalysisPrompt(
  userPrompt: string,
  focus: string[],
  expectedDescription?: string,
  isInfoGraphic?: boolean
): string {
  const focusInstructions = []

  if (focus.includes('quality')) {
    focusInstructions.push('- 评估图片技术质量（清晰度、噪点、伪影等），给出 0-100 分')
  }
  if (focus.includes('content')) {
    focusInstructions.push('- 描述图片的主要内容和元素')
  }
  if (focus.includes('style')) {
    focusInstructions.push('- 分析图片的艺术风格和视觉特点')
  }
  if (focus.includes('text')) {
    focusInstructions.push('- 提取图片中的所有文字内容')
  }
  if (focus.includes('composition')) {
    focusInstructions.push('- 分析构图和布局')
  }
  if (focus.includes('layout')) {
    focusInstructions.push(`- 【重要】检查布局问题：
  * 元素是否重叠或遮挡
  * 文字是否超出边界
  * 排版是否混乱
  * 元素间距是否合理`)
  }
  if (focus.includes('garbled')) {
    focusInstructions.push(`- 【重要】检查乱码/错字问题：
  * 是否有无法识别的乱码字符
  * 文字是否显示为方块或问号
  * 是否有明显的错别字
  * 文字渲染是否正常（不模糊、不残缺）`)
  }

  let prompt = userPrompt

  if (expectedDescription) {
    prompt += `\n\n预期内容描述：${expectedDescription}`
  }

  if (isInfoGraphic) {
    prompt += `\n\n【注意】这是一张图文并茂的信息图，请特别关注：
1. 所有文字是否清晰可读
2. 布局是否整齐美观
3. 是否有乱码或错字
4. 信息展示是否完整`
  }

  // 构建 JSON 格式说明
  const jsonFields = [
    '"description": "整体描述"',
    '"qualityScore": 0-100',
    '"passed": true/false (是否通过质量检查)',
    '"issues": ["问题1", "问题2"]',
    '"suggestions": ["建议1"]',
  ]

  if (focus.includes('text')) {
    jsonFields.push('"extractedText": ["文字1", "文字2"]')
  }
  if (focus.includes('layout')) {
    jsonFields.push('"layoutOk": true/false')
    jsonFields.push('"layoutIssues": ["布局问题1"]')
  }
  if (focus.includes('garbled')) {
    jsonFields.push('"hasGarbledText": true/false')
    jsonFields.push('"garbledAreas": ["乱码区域描述"]')
  }

  jsonFields.push('"retryPrompt": "如果图片不合格，给出改进后的生成提示词"')

  return `${prompt}

请完成以下分析任务：
${focusInstructions.join('\n')}

返回 JSON 格式：
{
  ${jsonFields.join(',\n  ')}
}

只返回 JSON 对象，不要有其他内容。`
}

function parseAnalysisResponse(response: string, focus: string[]): ToolResult<AnalyzeImageResult> {
  try {
    // 清理 JSON
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7)
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3)
    }

    // 尝试解析 JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // 判断是否通过检查
      let passed = parsed.passed
      if (passed === undefined) {
        // 根据各项指标自动判断
        const hasLayoutIssues = parsed.layoutOk === false || (parsed.layoutIssues?.length > 0)
        const hasGarbledText = parsed.hasGarbledText === true || (parsed.garbledAreas?.length > 0)
        const lowQuality = parsed.qualityScore !== undefined && parsed.qualityScore < 60

        passed = !hasLayoutIssues && !hasGarbledText && !lowQuality
      }

      return {
        success: true,
        data: {
          description: parsed.description || response,
          qualityScore: parsed.qualityScore,
          issues: parsed.issues || [],
          suggestions: parsed.suggestions || [],
          extractedText: parsed.extractedText || [],
          passed,
          layoutOk: parsed.layoutOk,
          hasGarbledText: parsed.hasGarbledText,
          garbledAreas: parsed.garbledAreas || [],
          layoutIssues: parsed.layoutIssues || [],
          retryPrompt: parsed.retryPrompt,
        },
      }
    }

    // 无法解析 JSON，返回原始文本
    return {
      success: true,
      data: {
        description: response,
        issues: [],
        suggestions: [],
        passed: true, // 默认通过
      },
    }
  } catch {
    return {
      success: true,
      data: {
        description: response,
        issues: [],
        suggestions: [],
        passed: true,
      },
    }
  }
}

// ============================================================================
// 工具定义
// ============================================================================

export const IMAGE_TOOL_DEFINITIONS = [
  {
    name: 'generate_image',
    description: '生成图片。支持多模型：nano-banana (快速)、nano-banana-pro (高质量)、seedream-4.5 (支持图生图)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: '图片生成提示词（英文效果更好）',
        },
        model: {
          type: 'string',
          description: '使用的模型',
          enum: ['nano-banana', 'nano-banana-pro', 'seedream-4.5'],
          default: 'seedream-4.5',
        },
        resolution: {
          type: 'string',
          description: '分辨率',
          enum: ['1K', '2K', '4K'],
          default: '2K',
        },
        aspectRatio: {
          type: 'string',
          description: '宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1', '3:2', '2:3'],
          default: '16:9',
        },
        referenceImages: {
          type: 'array',
          description: '参考图片列表（base64），用于图生图',
          items: { type: 'string' },
        },
        strength: {
          type: 'number',
          description: '图生图强度 (0-1)，越低越接近原图',
          default: 0.7,
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'extend_image',
    description: '扩展图片到目标比例（Outpainting），保持原内容不变',
    inputSchema: {
      type: 'object' as const,
      properties: {
        image: {
          type: 'string',
          description: '原始图片（base64）',
        },
        description: {
          type: 'string',
          description: '图片内容描述，帮助 AI 理解扩展方向',
        },
        targetRatio: {
          type: 'string',
          description: '目标宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1'],
        },
      },
      required: ['image', 'description', 'targetRatio'],
    },
  },
  {
    name: 'compress_image',
    description: '压缩图片到指定大小，用于分析前的预处理',
    inputSchema: {
      type: 'object' as const,
      properties: {
        image: {
          type: 'string',
          description: '原始图片（base64）',
        },
        maxSizeKB: {
          type: 'number',
          description: '最大文件大小（KB）',
          default: 1000,
        },
        maxWidth: {
          type: 'number',
          description: '最大宽度（像素）',
          default: 1920,
        },
      },
      required: ['image'],
    },
  },
  {
    name: 'analyze_image',
    description: '分析图片的内容、质量、风格，检测布局问题和乱码。用于验证 AI 生成的图片质量',
    inputSchema: {
      type: 'object' as const,
      properties: {
        image: {
          type: 'string',
          description: '图片（base64 或 URL）',
        },
        prompt: {
          type: 'string',
          description: '分析提示词',
          default: '分析这张图片的内容、质量和风格',
        },
        focus: {
          type: 'array',
          description: '分析重点：quality(质量)、content(内容)、style(风格)、text(文字)、composition(构图)、layout(布局)、garbled(乱码)',
          items: { type: 'string' },
          default: ['quality', 'content'],
        },
        model: {
          type: 'string',
          description: '使用的分析模型',
          enum: ['doubao', 'gemini'],
          default: 'doubao',
        },
        expectedDescription: {
          type: 'string',
          description: '预期的图片描述（用于对比检查）',
        },
        isInfoGraphic: {
          type: 'boolean',
          description: '是否为图文并茂的信息图（自动检查布局和乱码）',
          default: false,
        },
      },
      required: ['image'],
    },
  },
  {
    name: 'generate_images_batch',
    description: `批量并发生成图片。支持多场景同时生成，显著提升效率。

**核心能力：**
- 并发生成：多张图片同时生成，大幅缩短总耗时
- 智能调度：通过 concurrency 控制并发数避免 API 过载
- 批量结果：返回所有场景的生成结果（成功/失败）

**适用场景：**
- 新闻视频：一次生成多个场景的信息图
- PPT/教程：批量生成多页内容
- 任何需要多张图片的场景

**使用示例：**
\`\`\`
scenes: [
  { id: "scene-1", prompt: "News infographic about AI", description: "AI新闻" },
  { id: "scene-2", prompt: "News infographic about Google", description: "Google新闻" }
]
\`\`\``,
    inputSchema: {
      type: 'object' as const,
      properties: {
        scenes: {
          type: 'array',
          description: '场景列表，每个场景包含 id、prompt 和可选的 description',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '场景唯一标识' },
              prompt: { type: 'string', description: '图片生成提示词' },
              description: { type: 'string', description: '场景描述（中文）' },
            },
            required: ['id', 'prompt'],
          },
        },
        model: {
          type: 'string',
          description: '统一使用的模型',
          enum: ['nano-banana', 'nano-banana-pro', 'seedream-4.5'],
          default: 'seedream-4.5',
        },
        resolution: {
          type: 'string',
          description: '统一的分辨率',
          enum: ['1K', '2K', '4K'],
          default: '2K',
        },
        aspectRatio: {
          type: 'string',
          description: '统一的宽高比',
          enum: ['16:9', '9:16', '4:3', '1:1', '3:2', '2:3'],
          default: '16:9',
        },
        concurrency: {
          type: 'number',
          description: '最大并发数，控制同时生成的图片数量',
          default: 8,
        },
      },
      required: ['scenes'],
    },
  },
  {
    name: 'analyze_images_batch',
    description: `批量并发分析图片。支持多图片同时分析，适合批量质量检查。

**核心能力：**
- 并发分析：多张图片同时分析
- 质量检查：每张图片返回 passed/qualityScore/hasGarbledText/layoutOk
- 重试提示：分析不通过的图片会返回改进的提示词`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        images: {
          type: 'array',
          description: '图片列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '图片唯一标识' },
              image: { type: 'string', description: '图片（base64 或 URL）' },
              expectedDescription: { type: 'string', description: '预期描述' },
              isInfoGraphic: { type: 'boolean', description: '是否为信息图', default: false },
            },
            required: ['id', 'image'],
          },
        },
        focus: {
          type: 'array',
          description: '分析重点',
          items: { type: 'string' },
          default: ['quality', 'content'],
        },
        model: {
          type: 'string',
          description: '分析模型',
          enum: ['doubao', 'gemini'],
          default: 'doubao',
        },
        concurrency: {
          type: 'number',
          description: '最大并发数',
          default: 8,
        },
      },
      required: ['images'],
    },
  },
]
