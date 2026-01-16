/**
 * Volcano (火山引擎) API 统一入口
 *
 * 包含以下服务：
 * - Seedance: 视频生成 (图生视频，支持首尾帧)
 * - Doubao: 多模态对话 (图片分析、脚本生成)
 * - Seedream: 图片生成 (文生图、图生图)
 */

// Seedance 视频生成
export {
  createVideoTask,
  pollVideoTask,
  getVideoTaskStatus,
  generateVideo,
  SEEDANCE_MODELS,
  type CreateVideoTaskOptions,
} from './seedance'

// Doubao 多模态对话
export {
  chatWithDoubao,
  analyzeImage,
  generateScript,
  analyzeVideoSegments,
  type SegmentPlan,
} from './doubao'

// Seedream 图片生成
export {
  generateImage,
  extendImageWithAI,
  generateEndFrame,
  type GenerateImageOptions,
} from './seedream'
