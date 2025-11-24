# AI Agent Node - 智能图像生成代理

## 功能概述

AI Agent 节点是一个基于 LangChain.js 的智能体，能够根据用户需求自动规划和生成多个连贯的图像场景 prompt，并自动并发生成图片。

## 核心特性

### 1. 智能理解和规划
- 分析用户需求，自动决定生成场景数量
- 支持用户指定生成数量（0 = 自动决定）
- 基于 Nano Banana Pro 的专业 prompt 工程规范

### 2. 工具增强
- **搜索工具**：使用 Tavily Search API 获取实时信息
- **多轮推理**：智能体可以多步思考，必要时进行搜索

### 3. 流式输出
实时展示智能体工作进度：
- 🔍 **Searching** - 分析需求和搜索相关信息
- 💡 **Planning** - 规划场景和生成策略
- ✨ **Generating** - 生成专业图像 prompts
- 🖼️ **Creating** - 并发生成图片
- ✅ **Completed** - 全部完成

### 4. 并发图片生成
- 最多 10 个并发请求
- 自动批量处理大量 prompt
- 实时进度反馈

### 5. 动态画布布局
- 自动创建图片节点
- 智能排列（网格布局）
- 实时状态指示（等待中、生成中、完成、失败）

## 使用方法

### 1. 添加 Agent 节点
点击画布顶部工具栏的 **紫色大脑图标** 添加 AI Agent 节点。

### 2. 输入需求
在"需求描述"文本框中输入你想生成的图片场景，例如：
```
创建一组关于未来城市的科幻场景，包括白天和夜晚的视角
```

### 3. 设置生成数量（可选）
- 设置为 `0`：让 AI 自动决定生成多少个场景（推荐）
- 设置为 `3-6`：指定生成场景数量

### 4. 启动智能体
点击"启动智能体"按钮，Agent 将：
1. 分析你的需求
2. 必要时搜索相关信息
3. 规划场景
4. 生成专业的英文 prompt
5. 并发生成所有图片

### 5. 查看结果
- 节点内显示所有生成的场景和状态
- 画布上自动创建图片节点
- 每个图片节点显示生成的图像

## Nano Banana Pro Prompt 规范

Agent 遵循以下专业 prompt 结构：

```
[主体Subject] + [构图Composition] + [场景Location] +
[风格Style] + [文字内容Text Integration] + [技术参数Constraints]
```

### 支持的核心能力
1. **文字渲染** - 在图像中生成清晰可读的多语言文字
2. **信息图生成** - 专业的流程图、架构图
3. **多语言本地化** - 图像文字翻译
4. **多图融合** - 人物换背景、虚拟换装
5. **风格迁移** - 油画、动漫、素描等
6. **实时数据可视化** - 天气图、股票图
7. **产品摄影** - 电商级产品主图
8. **UI/UX设计** - App界面、网页设计
9. **漫画分镜** - 多格漫画、故事板
10. **建筑可视化** - 室内效果图、建筑渲染

## 环境配置

### 必需配置
```env
# OpenAI 兼容 API（用于智能体 LLM）
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# Gemini API（用于图片生成）
GEMINI_API_KEY=your_key
```

### 可选配置
```env
# Tavily Search（增强智能体搜索能力）
TAVILY_API_KEY=your_key
```

如果没有配置 `TAVILY_API_KEY`，Agent 仍可工作，但无法使用搜索工具。

## API 端点

### POST /api/agent/generate-prompts

**请求体：**
```json
{
  "userRequest": "创建一组关于未来城市的科幻场景",
  "promptCount": 0
}
```

**响应：** Server-Sent Events (SSE) 流式响应

**事件类型：**
```typescript
type AgentStreamEvent =
  | { type: "status", status: AgentStatus, step?: string, progress?: number }
  | { type: "progress", progress: number }
  | { type: "prompts", prompts: AgentPrompt[] }
  | { type: "error", error: string }
  | { type: "complete", status: "completed", progress: 100 }
```

## 技术架构

### 后端
- **LangChain.js** - 智能体框架
- **@langchain/openai** - OpenAI 兼容的 LLM
- **@langchain/community** - Tavily 搜索工具
- **Next.js API Route** - 流式 SSE 端点

### 前端
- **React + TypeScript**
- **@xyflow/react** - 画布和节点系统
- **Lucide React** - 图标库
- **Tailwind CSS** - 样式

### 并发控制
- 使用 `Promise.all` + 批量处理
- 每批最多 10 个并发请求
- 自动队列管理

## 示例场景

### 1. 产品摄影系列
```
创建一组高端耳机的产品摄影，包括不同角度和场景
```

### 2. UI设计系列
```
设计一套健身App的主要界面，包括首页、训练页、数据统计页
```

### 3. 漫画分镜
```
创建一个关于机器人拯救世界的4格漫画故事
```

### 4. 建筑可视化
```
根据现代简约风格，生成客厅、卧室、厨房的室内效果图
```

## 故障排除

### Agent 无法启动
- 检查 `OPENAI_API_KEY` 是否配置正确
- 检查 API 余额是否充足
- 查看浏览器控制台错误信息

### 搜索功能不可用
- 配置 `TAVILY_API_KEY`
- 或者使用不需要搜索的需求

### 图片生成失败
- 检查 `GEMINI_API_KEY` 是否配置
- 检查 R2 存储配置是否正确
- 查看节点内的错误提示

### 流式输出中断
- 检查网络连接
- 增大 API 超时时间
- 查看服务器日志

## 性能优化建议

1. **合理设置生成数量** - 3-6 个场景为最佳，避免一次生成过多
2. **利用搜索功能** - 需要实时信息时配置 Tavily
3. **监控 API 调用** - 每次运行会调用多次 LLM API
4. **预热缓存** - 首次运行可能较慢，后续会更快

## 资源链接

- [LangChain.js 文档](https://js.langchain.com/)
- [Tavily Search API](https://tavily.com/)
- [Gemini API 文档](https://ai.google.dev/)
- [React Flow 文档](https://reactflow.dev/)

## 更新日志

### v1.0.0 (2025-11-24)
- ✅ 初始版本发布
- ✅ 支持智能体规划和生成
- ✅ 流式输出进度反馈
- ✅ 并发图片生成（最多 10 个）
- ✅ 动态画布布局
- ✅ Tavily 搜索集成
