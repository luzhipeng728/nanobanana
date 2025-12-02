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
}

export interface TTSResult {
  success: boolean;
  audioBuffer?: Buffer;
  mimeType?: string;
  error?: string;
}

// 通用 Resource ID（适用于所有发音人）
const DEFAULT_RESOURCE_ID = 'volc.seedtts.default';

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

/**
 * 火山引擎 TTS 客户端
 */
export class BytedanceTTSClient {
  private config: TTSConfig;

  constructor(config?: Partial<TTSConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 将文本转换为语音
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

    try {
      const headers = {
        'x-api-key': this.config.apiKey,
        'X-Api-Resource-Id': this.config.resourceId,
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      };

      // 构建 additions 参数
      const additions: Record<string, unknown> = {
        disable_markdown_filter: true,
        enable_language_detector: true,
        enable_latex_tn: true,
        disable_default_bit_rate: true,
        max_length_to_filter_parenthesis: 0,
        speed_ratio: opts.speed,
        volume_ratio: opts.volume,
        pitch_ratio: opts.pitch,
        cache_config: {
          text_type: 1,
          use_cache: true,
        },
      };

      console.log(`[BytedanceTTS] Params: speed=${opts.speed}, pitch=${opts.pitch}, volume=${opts.volume}, emotion=${opts.emotion}`);

      // 添加上下文文本（用于保持语调一致性）
      if (opts.contextText) {
        additions.context_text = opts.contextText;
      }

      // 添加情感/风格参数
      if (opts.emotion) {
        additions.emotion = opts.emotion;
      }

      const payload = {
        req_params: {
          text: opts.text,
          speaker: opts.speaker,
          additions: JSON.stringify(additions),
          audio_params: {
            format: opts.format,
            sample_rate: opts.sampleRate,
          },
        },
      };

      const response = await fetch(TTS_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `TTS API error: ${response.status} - ${errorText}`,
        };
      }

      // 解析流式 JSON Lines 响应
      const responseText = await response.text();
      const lines = responseText.split('\n').filter(line => line.trim());

      const audioChunks: Buffer[] = [];

      for (const line of lines) {
        const data = JSON.parse(line);

        if (data.code !== 0 && data.message !== 'OK') {
          return {
            success: false,
            error: `TTS API error: ${data.message || 'Unknown error'}`,
          };
        }

        // 提取 base64 编码的音频数据
        if (data.data) {
          audioChunks.push(Buffer.from(data.data, 'base64'));
        }
      }

      if (audioChunks.length === 0) {
        return {
          success: false,
          error: 'No audio data received',
        };
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
      console.error('[BytedanceTTS] Error:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }
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
}

// 导出单例实例（使用默认配置）
export const ttsClient = new BytedanceTTSClient();

// 便捷函数
export async function textToSpeech(text: string, options?: Partial<TTSOptions>): Promise<TTSResult> {
  return ttsClient.synthesize({ text, ...options });
}
