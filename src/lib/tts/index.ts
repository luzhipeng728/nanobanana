/**
 * TTS (Text-to-Speech) 服务统一导出
 * 当前支持：火山引擎（字节跳动）
 * 未来可扩展：OpenAI TTS, Azure TTS, Google TTS 等
 */

export {
  BytedanceTTSClient,
  ttsClient,
  textToSpeech,
  TTS_SPEAKERS,
  type TTSConfig,
  type TTSOptions,
  type TTSResult,
  type SpeakerKey,
} from './bytedance-tts';
