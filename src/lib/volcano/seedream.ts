/**
 * Seedream 4.5 图片生成 API
 * 支持文生图和图生图
 *
 * 图片参数要求:
 * - 格式: jpeg, png, webp, bmp, tiff, gif
 * - Base64格式: data:image/<格式小写>;base64,<base64编码>
 * - 大小: ≤10MB
 * - 总像素: ≤36000000px
 * - 宽高比: 1/16 ~ 16
 */

import { chatWithDoubao } from './doubao'

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const SEEDREAM_MODEL = 'doubao-seedream-4-5-251128'

interface ImageGenerationResponse {
  data?: Array<{
    url?: string
    b64_json?: string
  }>
  error?: {
    message: string
  }
}

export interface GenerateImageOptions {
  /** 提示词 */
  prompt: string
  /** 参考图片 (base64) 用于图生图 */
  referenceImage?: string
  /** 输出尺寸 ("1920x1080" 等) */
  size?: string
  /** 宽高比 ("16:9", "9:16", "1:1" 等) */
  aspectRatio?: string
  /** 图生图参考强度 0-1, 默认0.7 */
  strength?: number
}

/**
 * 确保图片格式符合API要求
 */
function normalizeImageFormat(imageData: string): string {
  const match = imageData.match(/^data:image\/([^;]+);base64,(.+)$/)
  if (!match) {
    if (imageData.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${imageData}`
    }
    return `data:image/png;base64,${imageData}`
  }

  const [, format, base64] = match
  return `data:image/${format.toLowerCase()};base64,${base64}`
}

/**
 * 根据宽高比获取合适的尺寸
 */
function getSizeFromAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case '16:9':
      return '2560x1440'
    case '9:16':
      return '1440x2560'
    case '4:3':
      return '2560x1920'
    case '1:1':
      return '1920x1920'
    default:
      return '1920x1080'
  }
}

/**
 * 使用 Seedream 4.5 生成图片
 */
export async function generateImage(options: GenerateImageOptions): Promise<string> {
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY environment variable is required')
  }

  const { prompt, referenceImage, size = '1080x1920', aspectRatio, strength = 0.7 } = options

  let imageSize = size
  if (aspectRatio) {
    imageSize = getSizeFromAspectRatio(aspectRatio)
  }

  const requestBody: Record<string, unknown> = {
    model: SEEDREAM_MODEL,
    prompt,
    size: imageSize,
    response_format: 'b64_json',
    stream: false,
    watermark: false,
    sequential_image_generation: 'disabled',
  }

  // 如果有参考图片，添加图生图参数
  if (referenceImage) {
    requestBody.image = normalizeImageFormat(referenceImage)
    requestBody.strength = strength
  }

  console.log('[Seedream] 生成图片, 模型:', SEEDREAM_MODEL)
  console.log('[Seedream] prompt:', prompt.slice(0, 80) + (prompt.length > 80 ? '...' : ''))
  console.log('[Seedream] 图生图:', referenceImage ? '是' : '否')

  const response = await fetch(`${ARK_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[Seedream] API错误:', error)
    throw new Error(`Seedream API error: ${error}`)
  }

  const data: ImageGenerationResponse = await response.json()

  if (data.error) {
    throw new Error(`Seedream error: ${data.error.message}`)
  }

  if (!data.data || data.data.length === 0) {
    throw new Error('Seedream returned no image')
  }

  const imageData = data.data[0]

  if (imageData.b64_json) {
    return `data:image/png;base64,${imageData.b64_json}`
  }

  if (imageData.url) {
    const imageResponse = await fetch(imageData.url)
    const buffer = Buffer.from(await imageResponse.arrayBuffer())
    return `data:image/png;base64,${buffer.toString('base64')}`
  }

  throw new Error('Seedream returned invalid response')
}

/**
 * 扩展图片到目标比例（AI图生图）
 */
export async function extendImageWithAI(
  originalImage: string,
  originalDescription: string,
  targetAspectRatio: string
): Promise<string> {
  const prompt = await generateExtendPrompt(originalImage, originalDescription, targetAspectRatio)

  return generateImage({
    prompt,
    referenceImage: originalImage,
    aspectRatio: targetAspectRatio,
  })
}

/**
 * 生成图片扩展的提示词
 */
async function generateExtendPrompt(
  image: string,
  description: string,
  aspectRatio: string
): Promise<string> {
  try {
    const response = await chatWithDoubao([
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: image,
          },
          {
            type: 'input_text',
            text: `你需要为"图片扩展"任务生成提示词。这是一个outpainting任务，需要将图片扩展到${aspectRatio}比例。

【核心要求】保持原图所有内容完全不变！只描述需要扩展填充的边缘区域。

图片描述：${description}

分析步骤：
1. 仔细观察原图的：主体位置、背景元素、色调、光影方向、风格
2. 判断扩展方向（上下或左右）
3. 描述扩展区域应该填充什么内容（必须与原图背景自然衔接）

提示词要求：
1. 【重要】明确指出"保持原图主体和内容完全不变"
2. 【重要】只描述边缘扩展区域的内容
3. 扩展区域必须与原图风格、色调、光影一致

只输出提示词，格式：
"保持原图主体完全不变，[扩展区域描述]，[风格一致性描述]，[色调]，高清，4K，无缝扩展，自然过渡"`,
          },
        ],
      },
    ])

    const result = response.trim()
    if (result && result.length > 10) {
      return result
    }
  } catch (error) {
    console.error('[Seedream] 生成扩展提示词失败:', error)
  }

  return `保持原图所有内容完全不变，只扩展边缘区域，扩展部分与原图背景自然衔接，${description}，保持原图风格色调，高清，4K，无缝扩展，自然过渡`
}

/**
 * 为视频片段生成尾帧图片
 */
export async function generateEndFrame(
  startFrame: string,
  description: string,
  endFramePrompt: string,
  aspectRatio: string,
  duration: number = 5
): Promise<string> {
  const detailedEndFramePrompt = await analyzeAndGenerateEndFramePrompt(
    startFrame,
    description,
    endFramePrompt,
    duration
  )

  console.log(
    '[Seedream] 生成尾帧, 时长:',
    duration,
    '秒, 提示词:',
    detailedEndFramePrompt.slice(0, 80) + '...'
  )

  return generateImage({
    prompt: detailedEndFramePrompt,
    referenceImage: startFrame,
    aspectRatio,
    strength: 0.25, // 低强度，让尾帧有更明显变化
  })
}

/**
 * 使用AI分析首帧并生成尾帧描述
 */
async function analyzeAndGenerateEndFramePrompt(
  startFrame: string,
  description: string,
  endFrameHint: string,
  duration: number
): Promise<string> {
  try {
    const response = await chatWithDoubao([
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: startFrame,
          },
          {
            type: 'input_text',
            text: `【任务】分析这张图片，预测 ${duration} 秒后画面应该变成什么样子。

原图描述：${description}
参考方向：${endFrameHint}

【分析步骤】
1. 仔细观察图片中有什么：人物？机器人？产品？场景？
2. 根据图片内容和 ${duration} 秒的时长，推断画面合理的变化
3. 变化要符合图片的实际内容，不要套用模板

直接输出 ${duration} 秒后的画面描述，要具体、要符合图片实际内容！
格式："[具体描述变化后的画面是什么样子]，高清，4K"`,
          },
        ],
      },
    ])

    const result = response.trim()
    if (result && result.length > 10) {
      if (!result.includes('4K') && !result.includes('高清')) {
        return result + '，高清，4K，电影级画质'
      }
      return result
    }
  } catch (error) {
    console.error('[Seedream] AI分析首帧失败:', error)
  }

  return `${duration}秒后的画面变化：${endFrameHint}。场景描述：${description}。画面中的主体呈现自然的动作或状态变化，高清，4K`
}
