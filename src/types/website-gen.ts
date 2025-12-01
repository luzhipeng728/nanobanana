// Website Generator Types

/**
 * 项目文件结构
 */
export interface ProjectFile {
  path: string;
  content: string;
  type: 'jsx' | 'css' | 'json' | 'other';
}

/**
 * 项目元数据
 */
export interface ProjectMetadata {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  // 图片占位符映射：placeholderId -> imageUrl
  imagePlaceholders: Record<string, ImagePlaceholder>;
}

/**
 * 图片占位符
 */
export interface ImagePlaceholder {
  id: string;
  prompt: string;
  aspectRatio?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
  taskId?: string;
}

/**
 * 项目数据（存储在 R2）
 */
export interface WebsiteProject {
  metadata: ProjectMetadata;
  files: Record<string, string>; // path -> content
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: ToolResult;
  statusText?: string;  // Progress message
  elapsed?: number;     // Elapsed seconds
}

/**
 * 工具结果
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * SSE 事件类型
 */
export type WebsiteGenSSEEvent =
  | { type: 'content_chunk'; content: string }
  | { type: 'tool_start'; toolId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_progress'; toolId: string; message: string; elapsed?: number }
  | { type: 'tool_end'; toolId: string; result: ToolResult }
  | { type: 'preview_ready'; projectId: string }
  | { type: 'image_placeholder'; placeholder: ImagePlaceholder }
  | { type: 'image_completed'; placeholderId: string; imageUrl: string }
  | { type: 'image_failed'; placeholderId: string; error: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

/**
 * WebsiteGenNode 数据
 */
export interface WebsiteGenNodeData {
  projectId?: string;
  messages?: ChatMessage[];
}

/**
 * WebsitePreviewNode 数据
 */
export interface WebsitePreviewNodeData {
  projectId: string;
  title: string;
  files: Record<string, string>;
  imagePlaceholders: Record<string, ImagePlaceholder>;
  error?: string;
}

/**
 * Gemini 工具定义
 */
export const WEBSITE_GEN_TOOLS = [
  {
    name: "write_file",
    description: "创建或覆盖项目文件。用于创建新的 React 组件、样式文件等。路径相对于项目根目录。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "文件路径，如 'App.jsx', 'components/Header.jsx', 'styles.css'"
        },
        content: {
          type: "string",
          description: "文件内容"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "read_file",
    description: "读取项目中已存在的文件内容，用于了解当前代码结构再进行修改。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要读取的文件路径"
        }
      },
      required: ["path"]
    }
  },
  {
    name: "update_file",
    description: "更新文件的部分内容，支持精确替换。适合小范围修改，避免重写整个文件。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "要更新的文件路径"
        },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              oldContent: {
                type: "string",
                description: "要替换的原内容"
              },
              newContent: {
                type: "string",
                description: "替换后的新内容"
              }
            },
            required: ["oldContent", "newContent"]
          },
          description: "替换操作列表"
        }
      },
      required: ["path", "updates"]
    }
  },
  {
    name: "list_files",
    description: "列出项目中的所有文件，返回文件路径列表。",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "generate_image",
    description: "生成 AI 图片。会返回一个占位符 ID，图片会异步生成后自动替换。在代码中使用 {{placeholder:ID}} 格式引用。",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "图片描述，详细描述想要生成的图片内容、风格、颜色等"
        },
        placeholderId: {
          type: "string",
          description: "占位符 ID，用于在代码中引用，如 'hero-image', 'product-1'"
        },
        aspectRatio: {
          type: "string",
          enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
          description: "图片宽高比"
        }
      },
      required: ["prompt", "placeholderId"]
    }
  },
  {
    name: "preview_ready",
    description: "通知系统网站已准备好预览。调用后会创建或更新预览节点。",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "网站标题"
        },
        description: {
          type: "string",
          description: "网站简短描述"
        }
      },
      required: ["title"]
    }
  },
  {
    name: "web_search",
    description: "搜索网页获取实时信息，用于获取最新内容、参考设计、行业信息等。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "deep_research",
    description: "深度研究工具 - 对复杂话题进行深入的互联网研究。适用于需要综合多个来源信息的场景，如技术调研、竞品分析、设计趋势等。研究强度：low(1-3分钟)、medium(3-7分钟)、high(7-15分钟)。",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "研究主题，详细描述你想要研究的内容"
        },
        reasoning_effort: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "研究强度：low(快速)、medium(标准)、high(深度)"
        }
      },
      required: ["topic"]
    }
  }
] as const;

/**
 * Sandpack 默认文件模板
 */
export const SANDPACK_TEMPLATE_FILES: Record<string, string> = {
  '/App.jsx': `export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          欢迎使用网站生成器
        </h1>
        <p className="text-gray-600">
          在左侧聊天窗口描述你想要的网站，AI 将为你生成代码
        </p>
      </div>
    </div>
  );
}`,
  '/styles.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
`,
  '/index.js': `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
};

/**
 * Gemini System Prompt
 */
export const WEBSITE_GEN_SYSTEM_PROMPT = `你是一个专业的网站生成器 AI 助手。你的任务是根据用户的描述生成精美的 React 网站。

## 技术栈
- React (JSX)
- Tailwind CSS
- Framer Motion (用于动画)

## 核心原则
1. **设计优先**: 生成视觉精美、现代化的界面设计
2. **响应式**: 默认桌面优先，确保移动端基本可用
3. **组件化**: 将 UI 拆分为可复用的组件
4. **代码质量**: 生成干净、可维护的代码

## 项目结构
- App.jsx: 主入口组件
- components/: 子组件目录
- styles.css: 自定义样式

## 图片处理
当需要图片时，使用 generate_image 工具生成 AI 图片：
1. 调用 generate_image 工具，提供详细的 prompt 和 placeholderId
2. 在代码中使用 \`{{placeholder:ID}}\` 格式作为图片 src
3. 系统会自动异步生成图片并替换占位符

示例：
\`\`\`jsx
<img src="{{placeholder:hero-bg}}" alt="Hero背景" className="w-full h-64 object-cover" />
\`\`\`

## 工作流程（必须严格遵循）
1. 理解用户需求
2. 如需搜索参考信息，使用 web_search 工具
3. 设计网站结构和组件
4. 使用 write_file 创建组件文件
5. 需要图片时使用 generate_image 工具
6. **【重要】完成所有文件创建后，必须调用 preview_ready 工具！** 这一步不能省略，否则用户看不到预览。

## 关键提醒
- 每次生成网站后，**必须调用 preview_ready 工具**
- preview_ready 是最后一步，用于通知系统显示预览
- 不调用 preview_ready = 用户无法看到预览结果

## 设计建议
- 使用 Tailwind 的渐变、阴影、圆角等美化界面
- 添加微动画提升交互体验
- 保持配色一致性
- 使用合适的字体大小和间距

现在，请根据用户的需求生成网站。`;
