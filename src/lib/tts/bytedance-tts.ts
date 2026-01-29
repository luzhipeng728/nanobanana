/**
 * 火山引擎（字节跳动）TTS 服务封装
 * 支持流式音频生成，可复用
 */

export interface TTSConfig {
  apiKey: string;
  resourceId: string;
}

export interface TTSOptions {
  /** 要转换的文本 */
  text: string;
  /** 发音人 ID */
  speaker?: string;
  /** 音频格式 */
  format?: 'mp3' | 'wav' | 'pcm';
  /** 采样率 */
  sampleRate?: number;
  /** 语速 (0.5-2.0) */
  speed?: number;
  /** 音量 (0.5-2.0) */
  volume?: number;
  /** 音调 (0.5-2.0) */
  pitch?: number;
  /** 上下文文本（用于保持语调一致性） */
  contextText?: string;
  /** 情感/风格（如：happy, sad, neutral, excited 等） */
  emotion?: string;
  /** Resource ID（可选，用于覆盖默认值） */
  resourceId?: string;
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: Buffer;
  mimeType?: string;
  error?: string;
}

// 通用 Resource ID（适用于大多数发音人）
const DEFAULT_RESOURCE_ID = 'volc.seedtts.default';
// MegaTTS Resource ID（适用于 moon 系列发音人）
const MEGATTS_RESOURCE_ID = 'volc.megatts.default';

// 预设发音人列表
export const TTS_SPEAKERS = {
  // ========== 有声阅读 / 儿童绘本 ==========
  'zh_female_xueayi': {
    id: 'zh_female_xueayi_saturn_bigtts',
    name: '学艾伊',
    language: 'zh',
    gender: 'female',
    category: '儿童绘本' as const,
  },
  // ========== 通用场景 ==========
  'zh_female_vivi': {
    id: 'zh_female_vv_uranus_bigtts',
    name: 'Vivi',
    language: 'zh/en',
    gender: 'female',
    category: '通用场景' as const,
  },
  'zh_male_ruyayichen': {
    id: 'zh_male_ruyayichen_saturn_bigtts',
    name: '儒雅逸辰',
    language: 'zh',
    gender: 'male',
    category: '通用场景' as const,
  },
  'zh_female_xiaohe': {
    id: 'zh_female_xiaohe_uranus_bigtts',
    name: '小何',
    language: 'zh',
    gender: 'female',
    category: '通用场景' as const,
  },
  'zh_male_yunzhou': {
    id: 'zh_male_m191_uranus_bigtts',
    name: '云舟',
    language: 'zh',
    gender: 'male',
    category: '通用场景' as const,
  },
  'zh_male_xiaotian': {
    id: 'zh_male_taocheng_uranus_bigtts',
    name: '小天',
    language: 'zh',
    gender: 'male',
    category: '通用场景' as const,
  },
  // ========== 视频配音 ==========
  'zh_male_dayi': {
    id: 'zh_male_dayi_saturn_bigtts',
    name: '大壹',
    language: 'zh',
    gender: 'male',
    category: '视频配音' as const,
  },
  'zh_female_mizai': {
    id: 'zh_female_mizai_saturn_bigtts',
    name: '咪仔',
    language: 'zh',
    gender: 'female',
    category: '视频配音' as const,
  },
  'zh_female_jitangnv': {
    id: 'zh_female_jitangnv_saturn_bigtts',
    name: '鸡汤女',
    language: 'zh',
    gender: 'female',
    category: '视频配音' as const,
  },
  'zh_female_meilinvyou': {
    id: 'zh_female_meilinvyou_saturn_bigtts',
    name: '魅力女友',
    language: 'zh',
    gender: 'female',
    category: '视频配音' as const,
  },
  'zh_female_liuchang': {
    id: 'zh_female_santongyongns_saturn_bigtts',
    name: '流畅女声',
    language: 'zh',
    gender: 'female',
    category: '视频配音' as const,
  },
  // ========== 角色扮演 ==========
  'zh_female_keai': {
    id: 'saturn_zh_female_keainvsheng_tob',
    name: '可爱女生',
    language: 'zh',
    gender: 'female',
    category: '角色扮演' as const,
  },
  'zh_female_tiaopi': {
    id: 'saturn_zh_female_tiaopigongzhu_tob',
    name: '调皮公主',
    language: 'zh',
    gender: 'female',
    category: '角色扮演' as const,
  },
  'zh_male_shuanglang': {
    id: 'saturn_zh_male_shuanglangshaonian_tob',
    name: '爽朗少年',
    language: 'zh',
    gender: 'male',
    category: '角色扮演' as const,
  },
  'zh_male_tiancai': {
    id: 'saturn_zh_male_tiancaitongzhuo_tob',
    name: '天才同桌',
    language: 'zh',
    gender: 'male',
    category: '角色扮演' as const,
  },
  'zh_female_cancan': {
    id: 'saturn_zh_female_cancan_tob',
    name: '知性灿灿',
    language: 'zh',
    gender: 'female',
    category: '角色扮演' as const,
  },
  // ========== 方言口音 ==========
  'zh_female_sichuan': {
    id: 'zh_female_daimengchuanmei_moon_bigtts',
    name: '呆萌川妹',
    language: 'zh-四川',
    gender: 'female',
    category: '方言口音' as const,
    resourceId: MEGATTS_RESOURCE_ID, // moon 系列需要 megatts resource
  },
} as const;


export type SpeakerKey = keyof typeof TTS_SPEAKERS;

// 默认配置
const DEFAULT_CONFIG: TTSConfig = {
  apiKey: process.env.BYTEDANCE_TTS_API_KEY || '',
  resourceId: process.env.BYTEDANCE_TTS_RESOURCE_ID || DEFAULT_RESOURCE_ID,
};

const DEFAULT_OPTIONS: Partial<TTSOptions> = {
  speaker: TTS_SPEAKERS.zh_female_vivi.id,
  format: 'mp3',
  sampleRate: 24000,
  speed: 1.0,
  volume: 1.0,
  pitch: 1.0,
};

const TTS_API_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

// 重试配置
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2000; // 2 秒
const MAX_RETRY_DELAY = 30000; // 最大 30 秒

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 判断是否应该重试
 */
function shouldRetry(status: number, errorMessage: string): boolean {
  // HTTP 429 (Too Many Requests) 或 503 (Service Unavailable)
  if (status === 429 || status === 503) return true;

  // 错误消息包含限流相关关键词
  const retryableKeywords = [
    'quota exceeded',
    'concurrency',
    'rate limit',
    'too many requests',
    'overloaded',
    'temporarily unavailable',
  ];
  const lowerMessage = errorMessage.toLowerCase();
  return retryableKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * 火山引擎 TTS 客户端
 */
export class BytedanceTTSClient {
  private config: TTSConfig;

  constructor(config?: Partial<TTSConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 将文本转换为语音（带重试机制）
   */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.config.apiKey) {
      return {
        success: false,
        error: 'TTS API Key is not configured',
      };
    }

    if (!opts.text || !opts.text.trim()) {
      return {
        success: false,
        error: 'Text is required',
      };
    }

    // 使用请求级别的 resourceId，如果没有则使用配置的默认值
    const resourceId = opts.resourceId || this.config.resourceId;

    // 构建请求头和参数（在重试循环外，避免重复计算）
    const headers = {
      'x-api-key': this.config.apiKey,
      'X-Api-Resource-Id': resourceId,
      'Content-Type': 'application/json',
      'Connection': 'keep-alive',
    };

    // 构建 additions 参数（仅包含非音频参数）
    const additions: Record<string, unknown> = {
      disable_markdown_filter: true,
      enable_language_detector: true,
      enable_latex_tn: true,
      disable_default_bit_rate: true,
      max_length_to_filter_parenthesis: 0,
      cache_config: {
        text_type: 1,
        use_cache: true,
      },
    };

    // 添加上下文文本（用于保持语调一致性）
    if (opts.contextText) {
      additions.context_text = opts.contextText;
    }

    // 转换参数值：speed/volume/pitch 范围 0.5-2.0 → speech_rate/loudness_rate 范围 -50 到 100
    // 公式：(value - 1) * 100，例如 1.5 → 50，0.5 → -50，1.0 → 0
    // 使用默认值 1.0 处理 undefined 的情况
    const speechRate = Math.round(((opts.speed ?? 1.0) - 1) * 100);
    const loudnessRate = Math.round(((opts.volume ?? 1.0) - 1) * 100);
    const pitchRate = Math.round(((opts.pitch ?? 1.0) - 1) * 100);

    // 构建 audio_params（使用正确的 v3 API 参数名）
    const audioParams: Record<string, unknown> = {
      format: opts.format,
      sample_rate: opts.sampleRate,
      speech_rate: speechRate,      // 语速：-50 到 100
      loudness_rate: loudnessRate,  // 音量：-50 到 100
      pitch_rate: pitchRate,        // 音调：-50 到 100
    };

    // 添加情感/风格参数
    if (opts.emotion) {
      audioParams.emotion = opts.emotion;
    }

    console.log(`[BytedanceTTS] Params: speed=${opts.speed}→speech_rate=${speechRate}, pitch=${opts.pitch}→pitch_rate=${pitchRate}, volume=${opts.volume}→loudness_rate=${loudnessRate}, emotion=${opts.emotion}`);

    const payload = {
      req_params: {
        text: opts.text,
        speaker: opts.speaker,
        additions: JSON.stringify(additions),
        audio_params: audioParams,
      },
    };

    // 带重试的 API 调用
    let lastError = '';
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 重试时等待（指数退避）
        if (attempt > 0) {
          const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
          console.log(`[BytedanceTTS] Retry ${attempt}/${MAX_RETRIES}, waiting ${delay}ms...`);
          await sleep(delay);
        }

        const response = await fetch(TTS_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `TTS API error: ${response.status} - ${errorText}`;

          // 检查是否应该重试
          if (attempt < MAX_RETRIES && shouldRetry(response.status, errorText)) {
            console.log(`[BytedanceTTS] Retryable error (${response.status}): ${errorText.substring(0, 100)}`);
            continue;
          }

          return { success: false, error: lastError };
        }

        // 解析流式 JSON Lines 响应
        const responseText = await response.text();
        const lines = responseText.split('\n').filter(line => line.trim());

        const audioChunks: Buffer[] = [];
        let apiError = '';

        for (const line of lines) {
          const data = JSON.parse(line);

          if (data.code !== 0 && data.message !== 'OK') {
            apiError = data.message || 'Unknown error';
            break;
          }

          // 提取 base64 编码的音频数据
          if (data.data) {
            audioChunks.push(Buffer.from(data.data, 'base64'));
          }
        }

        // 如果 API 返回错误，检查是否应该重试
        if (apiError) {
          lastError = `TTS API error: ${apiError}`;
          if (attempt < MAX_RETRIES && shouldRetry(0, apiError)) {
            console.log(`[BytedanceTTS] Retryable API error: ${apiError}`);
            continue;
          }
          return { success: false, error: lastError };
        }

        if (audioChunks.length === 0) {
          return { success: false, error: 'No audio data received' };
        }

        // 合并音频块
        const audioBuffer = Buffer.concat(audioChunks);

        return {
          success: true,
          audioBuffer,
          mimeType: opts.format === 'mp3' ? 'audio/mpeg' : opts.format === 'wav' ? 'audio/wav' : 'audio/pcm',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = errorMessage;

        // 网络错误可以重试
        if (attempt < MAX_RETRIES) {
          console.log(`[BytedanceTTS] Network error, will retry: ${errorMessage}`);
          continue;
        }

        console.error('[BytedanceTTS] Error after all retries:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }

    // 所有重试都失败
    console.error(`[BytedanceTTS] All ${MAX_RETRIES} retries failed`);
    return { success: false, error: lastError || 'Max retries exceeded' };
  }

  /**
   * 获取发音人列表
   */
  static getSpeakers() {
    return TTS_SPEAKERS;
  }

  /**
   * 获取发音人 ID
   */
  static getSpeakerId(key: SpeakerKey): string {
    return TTS_SPEAKERS[key]?.id || TTS_SPEAKERS.zh_female_vivi.id;
  }

  /**
   * 获取发音人对应的 Resource ID
   */
  static getSpeakerResourceId(key: SpeakerKey): string {
    const speaker = TTS_SPEAKERS[key] as { resourceId?: string } | undefined;
    return speaker?.resourceId || DEFAULT_RESOURCE_ID;
  }
}

// 导出单例实例（使用默认配置）
export const ttsClient = new BytedanceTTSClient();

// 便捷函数
export async function textToSpeech(text: string, options?: Partial<TTSOptions>): Promise<TTSResult> {
  return ttsClient.synthesize({ text, ...options });
}
