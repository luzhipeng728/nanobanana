# 幻灯片讲解视频功能设计

## 概述

为幻灯片发布功能增加"生成讲解视频"选项。用户勾选后，系统会：
1. 根据每张图片的提示词，用 AI 生成讲解文案
2. 用 TTS 将文案转换为语音
3. 用 FFmpeg 将图片 + 语音合成为带转场效果的视频
4. 上传到 R2 存储，在幻灯片页面提供播放入口

## 用户界面

### 发布面板改造

在现有发布面板中增加：
- ☑️ "生成讲解视频" 勾选框
- 勾选后展开配置区：
  - 发音人选择（复用 TTS 发音人列表）
  - 转场效果选择（优雅淡入淡出 / 动感滑动 / 简约直切）
  - 讲解风格（选填文本框，留空则 AI 自动判断）

### 进度展示界面

使用 SSE 流式更新，实时展示：
- 总进度条
- 每张图片的状态（等待中 / 生成文案中 / 语音合成中 / 完成）
- 预计剩余时间
- 取消按钮

### 完成界面

- 视频预览缩略图
- 分享链接（复制功能）
- 下载视频按钮
- 打开预览按钮

### 幻灯片页面改造

在 `/slides/[id]` 页面顶部增加切换标签：
- [图片浏览] - 现有功能
- [讲解视频] - 视频播放器（仅当有讲解视频时显示）

## 技术架构

### 数据模型

扩展 `Slideshow` 模型：
```prisma
model Slideshow {
  // ... 现有字段
  videoUrl      String?   @db.Text    // 讲解视频 URL
  narrations    String?   @db.LongText // JSON: 每张图的讲解文案
  speaker       String?               // 使用的发音人
  transition    String?               // 转场效果
}
```

### API 设计

新增 SSE 端点：`POST /api/slideshow/generate-video`

请求体：
```json
{
  "slideshowId": "xxx",
  "speaker": "zh_female_vivi",
  "transition": "fade",
  "style": "轻松活泼"  // 可选
}
```

SSE 事件流：
```
event: progress
data: {"step": "narration", "index": 0, "status": "generating"}

event: progress
data: {"step": "narration", "index": 0, "status": "done", "text": "..."}

event: progress
data: {"step": "tts", "index": 0, "status": "generating"}

event: progress
data: {"step": "tts", "index": 0, "status": "done", "audioUrl": "..."}

event: progress
data: {"step": "video", "status": "composing"}

event: complete
data: {"videoUrl": "https://..."}

event: error
data: {"message": "..."}
```

### 处理流程

1. **生成讲解文案**
   - 收集所有图片的提示词
   - 调用大模型，一次性生成所有讲解（减少 API 调用）
   - 返回 JSON 数组

2. **生成语音**
   - 逐条调用 TTS API
   - 每条完成后推送进度
   - 保存音频到临时目录

3. **合成视频**
   - 检测图片主要比例，确定视频尺寸
   - 使用 FFmpeg：
     - 每张图片显示时长 = 对应音频时长 + 0.5s 缓冲
     - 应用转场效果
     - 合并所有音频为背景音轨
   - 输出 MP4 (H.264 + AAC)

4. **上传存储**
   - 上传到 R2
   - 更新 Slideshow 记录
   - 返回视频 URL

### 转场效果

| 名称 | FFmpeg 参数 | 说明 |
|------|-------------|------|
| fade | xfade=fade:duration=0.5 | 淡入淡出 |
| slide | xfade=slideleft:duration=0.5 | 左滑切换 |
| dissolve | xfade=dissolve:duration=0.5 | 溶解效果 |

### 视频尺寸

- 自动检测第一张图片的比例
- 横屏 (>1.2) → 1920x1080
- 竖屏 (<0.8) → 1080x1920
- 方形 → 1080x1080

## 文件结构

```
src/
├── app/
│   ├── api/
│   │   └── slideshow/
│   │       ├── route.ts (现有)
│   │       └── generate-video/
│   │           └── route.ts (新增 - SSE 端点)
│   └── slides/
│       └── [id]/
│           ├── page.tsx (现有)
│           ├── SlideshowViewer.tsx (改造 - 增加视频切换)
│           └── VideoPlayer.tsx (新增)
├── components/
│   └── InfiniteCanvas.tsx (改造 - 发布面板)
├── lib/
│   └── video/
│       ├── generate-narration.ts (新增 - AI 文案生成)
│       └── compose-video.ts (新增 - FFmpeg 合成)
└── prisma/
    └── schema.prisma (改造 - Slideshow 模型)
```

## 实施计划

1. 数据库模型更新
2. 发布面板 UI 改造
3. AI 文案生成服务
4. SSE 进度推送 API
5. FFmpeg 视频合成
6. 幻灯片页面视频播放器
7. 测试与优化
