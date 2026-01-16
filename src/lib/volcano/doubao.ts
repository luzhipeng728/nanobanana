/**
 * 豆包 (Doubao) 多模态对话 API
 * 用于图片分析、脚本生成等
 */

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const DOUBAO_MODEL = 'doubao-seed-1-8-251228'

interface InputContent {
  type: 'input_image' | 'input_text'
  image_url?: string
  text?: string
}

interface InputMessage {
  role: 'user' | 'assistant' | 'system'
  content: InputContent[]
}

interface ResponseData {
  output?: {
    content?: string
  }
  choices?: Array<{
    message: {
      content: string
    }
  }>
}

/**
 * 与豆包进行多模态对话
 */
export async function chatWithDoubao(input: InputMessage[]): Promise<string> {
  if (!process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY environment variable is required')
  }

  const response = await fetch(`${ARK_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DOUBAO_MODEL,
      input,
      thinking: { type: 'disabled' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Doubao API error: ${error}`)
  }

  const data: ResponseData = await response.json()

  if (data.output?.content) {
    return data.output.content
  }
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content
  }

  return ''
}

/**
 * 分析图片并生成描述
 */
export async function analyzeImage(imageBase64: string, prompt?: string): Promise<string> {
  const content = await chatWithDoubao([
    {
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: imageBase64,
        },
        {
          type: 'input_text',
          text: prompt || '请详细描述这张图片的内容，包括主体、背景、颜色、风格等。',
        },
      ],
    },
  ])

  return content.trim()
}

/**
 * 为图片生成视频配音脚本
 */
export async function generateScript(imageBase64: string, description: string): Promise<string> {
  const content = await chatWithDoubao([
    {
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: imageBase64,
        },
        {
          type: 'input_text',
          text: `你是一位专业的视频配音脚本作家。根据这张图片和描述，为视频写一段简洁的配音台词（2-3句话，约30-50个中文字）。

描述：${description}

要求：
- 语气自然、口语化
- 突出图片中展示的关键特点
- 适合视频旁白
- 只输出台词文本，不要解释`,
        },
      ],
    },
  ])

  return content.trim()
}

export interface SegmentPlan {
  duration: number
  endFramePrompt: string | null
}

/**
 * 分析视频分段规划
 */
export async function analyzeVideoSegments(
  imageBase64: string,
  description: string,
  script: string,
  audioDuration: number
): Promise<SegmentPlan[]> {
  const content = await chatWithDoubao([
    {
      role: 'user',
      content: [
        {
          type: 'input_image',
          image_url: imageBase64,
        },
        {
          type: 'input_text',
          text: `你是一个视频制作AI。根据这张图片和${audioDuration}秒的音频时长，规划视频分段。

图片描述：${description}
台词：${script}
音频时长：${audioDuration}秒

【重要】先仔细分析图片里有什么（人物？机器人？产品？场景？），然后根据实际内容描述每个片段结束时画面应该变成什么样。

只用JSON格式回复：
{
  "segments": [
    { "duration": 10, "endFramePrompt": "根据图片实际内容描述变化后的画面" }
  ]
}

规则：
- 总时长 >= ${audioDuration}秒
- 每个片段：2-12秒
- endFramePrompt必须描述具体的画面变化`,
        },
      ],
    },
  ])

  let segments: SegmentPlan[] = []

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      segments = parsed.segments || []
    }
  } catch {
    // 解析失败，使用智能分割
  }

  // 验证并修正分段
  segments = validateAndFixSegments(segments, audioDuration, description)

  console.log(`[Doubao] 分段结果: ${segments.length} 个片段，音频 ${audioDuration}秒`)
  return segments
}

/**
 * 验证并修正视频分段
 */
function validateAndFixSegments(
  segments: SegmentPlan[],
  audioDuration: number,
  description: string
): SegmentPlan[] {
  const MIN_DURATION = 2
  const MAX_DURATION = 12

  // 如果音频 <= 12秒，强制使用单个片段
  if (audioDuration <= MAX_DURATION) {
    return generateSmartSegments(audioDuration, description)
  }

  if (!segments || segments.length === 0) {
    return generateSmartSegments(audioDuration, description)
  }

  const totalDuration = segments.reduce((sum, s) => sum + (s.duration || 0), 0)

  if (totalDuration < audioDuration - 1) {
    return generateSmartSegments(audioDuration, description)
  }

  const hasInvalidSegment = segments.some(
    (s) => !s.duration || s.duration < MIN_DURATION || s.duration > MAX_DURATION + 2
  )

  if (hasInvalidSegment) {
    return generateSmartSegments(audioDuration, description)
  }

  return segments
}

/**
 * 智能生成视频分段
 */
function generateSmartSegments(audioDuration: number, description: string): SegmentPlan[] {
  const MIN_DURATION = 2
  const MAX_DURATION = 12
  const TARGET_DURATION = 8

  if (audioDuration <= MAX_DURATION) {
    const duration = Math.max(MIN_DURATION, Math.round(audioDuration))
    return [
      {
        duration,
        endFramePrompt: `${duration}秒后的画面变化：根据"${description.slice(0, 60)}"的内容，画面中的主体发生自然的动作或状态变化`,
      },
    ]
  }

  const segments: SegmentPlan[] = []
  let remaining = audioDuration

  while (remaining > 0) {
    let segDuration: number

    if (remaining <= MAX_DURATION) {
      segDuration = Math.max(MIN_DURATION, remaining)
    } else if (remaining <= MAX_DURATION + MIN_DURATION) {
      segDuration = remaining / 2
    } else {
      segDuration = TARGET_DURATION
    }

    segDuration = Math.round(segDuration * 10) / 10
    remaining -= segDuration

    const segmentIndex = segments.length + 1
    segments.push({
      duration: segDuration,
      endFramePrompt: `第${segmentIndex}段结束时的画面：根据"${description.slice(0, 50)}"，画面中的主体呈现新的状态或动作`,
    })
  }

  return segments
}
