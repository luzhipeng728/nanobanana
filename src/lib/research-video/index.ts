/**
 * 研究视频生成系统
 *
 * 完整工作流程：
 * 1. 用户输入主题
 * 2. AI 生成 3-4 个研究维度
 * 3. 并行执行深度研究
 * 4. 整合研究结果，生成分段解说脚本
 * 5. TTS 生成音频（音量标准化）
 * 6. 智能配图生成
 * 7. 运镜编辑器（支持重新生成）
 * 8. 最终视频合成
 */

// 类型导出
export * from "./types";

// 研究维度生成器
export {
  generateResearchDimensions,
  generateResearchDimensionsStream,
} from "./dimension-generator";

// 并行研究执行器
export {
  executeParallelResearch,
  executeParallelResearchStream,
} from "./parallel-research";

// 脚本分段器（v3 支持内容筛选）
export {
  generateSegmentedScript,
  generateSegmentedScriptStream,
  smartSegmentText,
  filterResearchContent,
} from "./script-segmenter";

// TTS 生成器
export {
  generateSegmentTTS,
  generateBatchTTS,
  generateBatchTTSStream,
  regenerateSegmentTTS,
  normalizeAudioVolume,
} from "./tts-generator";

// 配图生成器
export {
  generateImagePrompt,
  generateBatchImagePrompts,
  generateSegmentImage,
  generateBatchImages,
  generateBatchImagesStream,
  regenerateSegmentImage,
} from "./image-prompt-generator";

// 视频合成器
export {
  composeResearchVideo,
  composeResearchVideoStream,
  checkFFmpeg,
} from "./video-composer";
