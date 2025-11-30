# ChatNode 智能体升级设计方案

> 日期: 2025-11-30
> 状态: 已确认，待实现

## 概述

将 ChatNode 升级为真正的多工具智能体，支持：
- 图片/文件上传
- 6 个可扩展工具
- ReAct 循环工具调用
- WebSocket 全程流式
- 上下文管理与可视化

## 核心决策

| 决策项 | 选择 |
|-------|------|
| 影响范围 | 仅 ChatNode，不影响其他节点 |
| 架构风格 | 插件式可扩展架构 |
| 通信方式 | WebSocket（解决超时问题） |
| ReAct 实现 | 自定义循环 + LangChain Tools Schema |
| 流式显示 | 折叠卡片式 |
| 文件上传 | 图片→R2，文档→前端解析 |
| 上下文管理 | 可视化（显示 token 用量） |

## 工具集

| 工具 | 功能 | 特殊说明 |
|-----|------|---------|
| web_search | 网络搜索 | 默认启用 |
| deep_research | 深度研究 | 勾选才启用 |
| generate_image | 生图 | 支持参考图 |
| edit_image | 修图 | 基于上传的图片 |
| analyze_document | 文档分析 | 支持 PDF/Word 等 |
| code_interpreter | 代码执行 | 针对图片处理 |

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      ChatNode (前端)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ 消息列表  │  │ 工具卡片  │  │ 上传区域  │  │ 上下文状态  │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│                          │                                   │
│                    WebSocket 连接                            │
│                          ↓                                   │
├─────────────────────────────────────────────────────────────┤
│                   /api/chat-agent (后端)                     │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────┐    ┌────────────────┐                   │
│  │  ReAct Loop    │ ←→ │  Tool Registry │                   │
│  │  (自定义实现)   │    │  (LangChain)   │                   │
│  └────────────────┘    └────────────────┘                   │
│           ↓                     ↓                            │
│  ┌────────────────┐    ┌────────────────┐                   │
│  │ Claude API     │    │ Tool Handlers  │                   │
│  │ (Anthropic SDK)│    │ (6 个工具实现)  │                   │
│  └────────────────┘    └────────────────┘                   │
│           ↓                                                  │
│  ┌────────────────────────────────────────┐                 │
│  │  ConversationManager (上下文管理)       │                 │
│  │  - Token 计数 / 自动压缩 / 持久化       │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## WebSocket 消息协议

### 客户端 → 服务端

```typescript
// 发送消息
{
  type: "message",
  content: string,
  attachments?: [
    { type: "image", url: string },
    { type: "document", content: string, filename: string }
  ],
  settings: {
    enableDeepResearch: boolean
  }
}

// 中断请求
{ type: "abort" }

// 清除上下文
{ type: "clear_context" }
```

### 服务端 → 客户端

```typescript
// 回复内容流
{ type: "content_chunk", content: string }

// 工具调用开始
{ type: "tool_start", toolId: string, name: string, input: object }

// 工具进度更新
{ type: "tool_progress", toolId: string, elapsed: number, status: string }

// 工具调用结束
{ type: "tool_end", toolId: string, output: object, duration: number }

// 上下文状态更新
{ type: "context_update", tokens: number, maxTokens: number }

// 完成
{ type: "done", messageId: string }

// 错误
{ type: "error", message: string, code?: string }
```

## 工具系统设计

```typescript
// 统一的工具接口
interface ChatAgentTool {
  name: string
  description: string
  schema: z.ZodObject<any>
  execute: (
    input: any,
    context: ToolContext,
    callbacks: {
      onProgress: (status: string) => void
      onChunk?: (chunk: string) => void
    }
  ) => Promise<ToolResult>
}

// 工具上下文
interface ToolContext {
  conversationId: string
  attachedImages: string[]
  attachedDocuments: string[]
  abortSignal: AbortSignal
}
```

## 文件结构

```
src/
├── lib/chat-agent/
│   ├── index.ts              # 导出
│   ├── react-loop.ts         # ReAct 循环实现
│   ├── tool-registry.ts      # 工具注册表
│   ├── types.ts              # 类型定义
│   ├── websocket-handler.ts  # WebSocket 处理
│   └── tools/
│       ├── index.ts          # 工具导出
│       ├── web-search.ts     # 网络搜索
│       ├── deep-research.ts  # 深度研究
│       ├── generate-image.ts # 生图
│       ├── edit-image.ts     # 修图
│       ├── analyze-document.ts # 文档分析
│       └── code-interpreter.ts # 代码执行
├── app/api/chat-agent/
│   └── route.ts              # WebSocket API 端点
└── components/nodes/
    └── ChatNode.tsx          # 升级后的聊天节点
```

## 前端组件结构

```
ChatNode
├── MessageList          # 消息列表
│   ├── UserMessage      # 用户消息（支持附件预览）
│   └── AssistantMessage # 助手消息（支持流式）
├── ToolCardList         # 工具调用卡片列表
│   └── ToolCard         # 单个工具卡片（折叠式）
├── InputArea            # 输入区域
│   ├── TextInput        # 文本输入
│   ├── FileUploader     # 文件上传
│   └── SettingsToggle   # Deep Research 开关
└── ContextStatus        # 上下文状态栏
    ├── TokenCounter     # Token 计数
    └── ActionButtons    # 清除/新对话按钮
```
