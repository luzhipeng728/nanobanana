/**
 * 火山引擎（字节跳动）TTS 服务封装
 * 支持流式音频生成，可复用
 */

export interface TTSConfig {
  appId: string;
  accessToken: string;
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

// 预设发音人列表（已测试可用 v1 API）
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
  // ========== 方言口音 ==========
  'zh_female_sichuan': {
    id: 'zh_female_daimengchuanmei_moon_bigtts',
    name: '呆萌川妹',
    language: 'zh-四川',
    gender: 'female',
    category: '方言口音' as const,
  },
} as const;


export type SpeakerKey = keyof typeof TTS_SPEAKERS;

// 默认配置
const DEFAULT_CONFIG: TTSConfig = {
  appId: process.env.TTS_APP_ID || '',
  accessToken: process.env.TTS_ACCESS_TOKEN || '',
};

const DEFAULT_OPTIONS: Partial<TTSOptions> = {
  speaker: TTS_SPEAKERS.zh_female_vivi.id,
  format: 'mp3',
  sampleRate: 24000,
  speed: 1.0,
  volume: 1.0,
  pitch: 1.0,
};

// 使用 v1 API（支持所有音色包括 moon 系列）
const TTS_API_URL = 'https://openspeech.bytedance.com/api/v1/tts';

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
 * 火山引擎 TTS 客户端（使用 v1 API）
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

    if (!this.config.appId || !this.config.accessToken) {
      return {
        success: false,
        error: 'TTS_APP_ID and TTS_ACCESS_TOKEN are required',
      };
    }

    if (!opts.text || !opts.text.trim()) {
      return {
        success: false,
        error: 'Text is required',
      };
    }

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer;${this.config.accessToken}`,
    };

    // v1 API 使用 speed_ratio/volume_ratio/pitch_ratio (0.5-2.0)
    const speedRatio = opts.speed ?? 1.0;
    const volumeRatio = opts.volume ?? 1.0;
    const pitchRatio = opts.pitch ?? 1.0;

    console.log(`[BytedanceTTS] Params: speed=${speedRatio}, pitch=${pitchRatio}, volume=${volumeRatio}, speaker=${opts.speaker}`);

    // 构建 v1 API 请求体
    const payload = {
      app: {
        appid: this.config.appId,
        token: this.config.accessToken,
        cluster: 'volcano_tts',
      },
      user: {
        uid: 'nanobanana-tts',
      },
      audio: {
        voice_type: opts.speaker,
        encoding: opts.format || 'mp3',
        speed_ratio: speedRatio,
        volume_ratio: volumeRatio,
        pitch_ratio: pitchRatio,
      },
      request: {
        reqid: `tts-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        text: opts.text,
        text_type: 'plain',
        operation: 'query',
        with_frontend: 1,
        frontend_type: 'unitTson',
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

        // 解析 v1 API 响应
        const data = await response.json();

        // v1 API 成功码是 3000
        if (data.code !== 3000) {
          lastError = `TTS API error: ${data.message || 'Unknown error'} (code: ${data.code})`;
          if (attempt < MAX_RETRIES && shouldRetry(0, lastError)) {
            console.log(`[BytedanceTTS] Retryable API error: ${lastError}`);
            continue;
          }
          return { success: false, error: lastError };
        }

        if (!data.data) {
          return { success: false, error: 'No audio data received' };
        }

        // 解码 base64 音频数据
        const audioBuffer = Buffer.from(data.data, 'base64');

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
}

// 导出单例实例（使用默认配置）
export const ttsClient = new BytedanceTTSClient();

// 便捷函数
export async function textToSpeech(text: string, options?: Partial<TTSOptions>): Promise<TTSResult> {
  return ttsClient.synthesize({ text, ...options });
}
