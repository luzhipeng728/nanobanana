# PPT 生成节点实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 NanoBanana 画布添加 PPT 生成功能，支持 AI 智能生成 + 画布素材混合输入，三节点流水线架构。

**Architecture:** 采用与现有视频生成节点一致的模式：Server Action 处理异步任务 + Prisma 存储任务状态 + 前端节点轮询。使用 Claude pptx Skill (beta API) 生成 PPT 文件。

**Tech Stack:** Next.js 16, React 19, Prisma/MySQL, @anthropic-ai/sdk, @xyflow/react

---

## Phase 1: 数据层和 API（核心基础）

### Task 1: 添加 PPTTask 数据模型

**Files:**
- Modify: `prisma/schema.prisma` (末尾添加)

**Step 1: 添加 PPTTask 模型**

在 `prisma/schema.prisma` 文件末尾添加：

```prisma
// PPT 演示文稿生成任务
model PPTTask {
  id           String    @id @default(uuid())
  status       String    // pending, processing, completed, failed
  topic        String    @db.Text              // PPT 主题
  description  String?   @db.Text              // 补充说明
  template     String    @default("business")  // business, tech, minimal, creative
  primaryColor String    @default("#3B82F6")   // 主色调
  materials    String?   @db.LongText          // JSON: 输入素材 [{type, url, content}]
  slides       String?   @db.LongText          // JSON: 生成的幻灯片数据
  fileId       String?   @db.Text              // Claude Files API 返回的文件 ID
  pptUrl       String?   @db.Text              // 上传到 R2 后的 PPT URL
  error        String?   @db.Text
  userId       String?
  user         User?     @relation(fields: [userId], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  completedAt  DateTime?
  deletedAt    DateTime?

  @@index([userId])
  @@index([status])
  @@index([deletedAt])
}
```

**Step 2: 在 User 模型中添加关联**

找到 User 模型，在关联字段列表末尾添加：

```prisma
pptTasks    PPTTask[]
```

**Step 3: 运行数据库迁移**

Run: `npx prisma db push`
Expected: 数据库更新成功，无错误

**Step 4: 生成 Prisma Client**

Run: `npx prisma generate`
Expected: Prisma Client 生成成功

**Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(ppt): add PPTTask database model"
```

---

### Task 2: 创建 PPT Task Server Action

**Files:**
- Create: `src/app/actions/ppt-task.ts`

**Step 1: 创建基础文件结构**

```typescript
"use server";

import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();

// 获取当前用户 ID
async function getCurrentUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("userId")?.value || null;
  } catch {
    return null;
  }
}

export type PPTTaskStatus = "pending" | "processing" | "completed" | "failed";

export interface PPTMaterial {
  type: "image" | "text";
  url?: string;
  content?: string;
}

export interface SlideData {
  id: string;
  layout: "title" | "content" | "two-column" | "image-focus" | "ending";
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
  notes?: string;
}

export interface PPTTaskResult {
  id: string;
  status: PPTTaskStatus;
  topic: string;
  template: string;
  slides?: SlideData[];
  pptUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
```

**Step 2: 添加创建任务函数**

```typescript
/**
 * 创建 PPT 生成任务
 */
export async function createPPTTask(
  topic: string,
  template: string = "business",
  primaryColor: string = "#3B82F6",
  description?: string,
  materials: PPTMaterial[] = []
): Promise<{ taskId: string }> {
  const userId = await getCurrentUserId();

  const task = await prisma.pPTTask.create({
    data: {
      status: "pending",
      topic,
      description,
      template,
      primaryColor,
      materials: materials.length > 0 ? JSON.stringify(materials) : null,
      userId,
    },
  });

  // 异步处理任务（不等待）
  processPPTTask(task.id).catch((error) => {
    console.error(`Error processing PPT task ${task.id}:`, error);
  });

  return { taskId: task.id };
}
```

**Step 3: 添加查询任务状态函数**

```typescript
/**
 * 查询 PPT 任务状态
 */
export async function getPPTTaskStatus(taskId: string): Promise<PPTTaskResult | null> {
  const task = await prisma.pPTTask.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    id: task.id,
    status: task.status as PPTTaskStatus,
    topic: task.topic,
    template: task.template,
    slides: task.slides ? JSON.parse(task.slides) : undefined,
    pptUrl: task.pptUrl || undefined,
    error: task.error || undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt || undefined,
  };
}
```

**Step 4: 添加核心处理函数（Claude pptx Skill 调用）**

```typescript
/**
 * 处理 PPT 生成任务（后台执行）
 */
async function processPPTTask(taskId: string): Promise<void> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    // 更新状态为 processing
    await prisma.pPTTask.update({
      where: { id: taskId },
      data: { status: "processing", updatedAt: new Date() },
    });

    // 获取任务详情
    const task = await prisma.pPTTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    const materials: PPTMaterial[] = task.materials ? JSON.parse(task.materials) : [];

    // 构建 prompt
    const userPrompt = buildPPTPrompt(task.topic, task.description, task.template, task.primaryColor, materials);

    // 调用 Claude API + pptx skill
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      betas: [
        "code-execution-2025-08-25",
        "files-api-2025-04-14",
        "skills-2025-10-02"
      ],
      container: {
        skills: [
          {
            type: "anthropic",
            skill_id: "pptx",
            version: "latest"
          }
        ]
      },
      tools: [
        {
          type: "code_execution_20250825",
          name: "code_execution"
        }
      ],
      messages: [
        { role: "user", content: userPrompt }
      ]
    } as any);

    // 解析响应，提取文件信息
    const { fileId, slides } = parseClaudeResponse(response);

    // 更新任务为完成
    await prisma.pPTTask.update({
      where: { id: taskId },
      data: {
        status: "completed",
        fileId,
        slides: slides ? JSON.stringify(slides) : null,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(`PPT task ${taskId} failed:`, error);
    await prisma.pPTTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        updatedAt: new Date(),
      },
    });
  }
}
```

**Step 5: 添加辅助函数**

```typescript
/**
 * 构建 PPT 生成 prompt
 */
function buildPPTPrompt(
  topic: string,
  description: string | null,
  template: string,
  primaryColor: string,
  materials: PPTMaterial[]
): string {
  const templateNames: Record<string, string> = {
    business: "商务专业",
    tech: "科技现代",
    minimal: "简约清新",
    creative: "创意活泼",
  };

  let prompt = `创建一个关于「${topic}」的 PowerPoint 演示文稿。

设计要求：
- 风格：${templateNames[template] || template}
- 主色调：${primaryColor}
- 页数：5-8页，包含封面页、内容页和结束页
- 每页内容要简洁有力，使用要点列表`;

  if (description) {
    prompt += `\n\n补充说明：${description}`;
  }

  if (materials.length > 0) {
    const imageUrls = materials.filter(m => m.type === "image" && m.url).map(m => m.url);
    if (imageUrls.length > 0) {
      prompt += `\n\n请在适当的幻灯片中使用以下图片素材：\n${imageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
    }
  }

  prompt += `\n\n请生成专业的 PPT 演示文稿文件。`;

  return prompt;
}

/**
 * 解析 Claude 响应
 */
function parseClaudeResponse(response: any): { fileId?: string; slides?: SlideData[] } {
  let fileId: string | undefined;
  const slides: SlideData[] = [];

  // 遍历响应内容，查找文件信息
  for (const block of response.content || []) {
    if (block.type === "tool_result" || block.type === "code_execution_result") {
      // 查找生成的文件
      if (block.content?.files) {
        for (const file of block.content.files) {
          if (file.name?.endsWith('.pptx')) {
            fileId = file.id;
          }
        }
      }
    }
  }

  return { fileId, slides };
}
```

**Step 6: Commit**

```bash
git add src/app/actions/ppt-task.ts
git commit -m "feat(ppt): add PPT task server action with Claude pptx skill"
```

---

### Task 3: 创建 PPT 生成 API 路由

**Files:**
- Create: `src/app/api/ppt/generate/route.ts`

**Step 1: 创建生成 API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createPPTTask } from "@/app/actions/ppt-task";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, template, primaryColor, description, materials } = body;

    if (!topic) {
      return NextResponse.json(
        { success: false, error: "Topic is required" },
        { status: 400 }
      );
    }

    // 创建异步任务
    const { taskId } = await createPPTTask(
      topic,
      template || "business",
      primaryColor || "#3B82F6",
      description,
      materials || []
    );

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      taskId,
    });
  } catch (error) {
    console.error("API ppt/generate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/ppt/generate/route.ts
git commit -m "feat(ppt): add PPT generate API route"
```

---

### Task 4: 创建 PPT 任务状态 API

**Files:**
- Create: `src/app/api/ppt/task/route.ts`

**Step 1: 创建任务状态 API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getPPTTaskStatus } from "@/app/actions/ppt-task";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "Task ID is required" },
        { status: 400 }
      );
    }

    const task = await getPPTTaskStatus(taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error("API ppt/task error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/ppt/task/route.ts
git commit -m "feat(ppt): add PPT task status API route"
```

---

### Task 5: 创建 PPT 导出下载 API

**Files:**
- Create: `src/app/api/ppt/export/route.ts`

**Step 1: 创建导出 API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPPTTaskStatus } from "@/app/actions/ppt-task";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: "Task ID is required" },
        { status: 400 }
      );
    }

    // 获取任务信息
    const task = await getPPTTaskStatus(taskId);

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== "completed") {
      return NextResponse.json(
        { success: false, error: "PPT not ready yet" },
        { status: 400 }
      );
    }

    // 如果有 R2 URL，直接重定向
    if (task.pptUrl) {
      return NextResponse.redirect(task.pptUrl);
    }

    // 否则尝试从 Claude Files API 获取
    // 注意：这部分需要根据实际 Claude Files API 实现调整
    return NextResponse.json(
      { success: false, error: "PPT file not available" },
      { status: 404 }
    );
  } catch (error) {
    console.error("API ppt/export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/ppt/export/route.ts
git commit -m "feat(ppt): add PPT export download API route"
```

---

## Phase 2: PPT 生成节点（用户入口）

### Task 6: 创建 PPTGenNode 组件

**Files:**
- Create: `src/components/nodes/PPTGenNode.tsx`

**Step 1: 创建基础组件结构**

```typescript
"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow, useStore, addEdge } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Presentation, Wand2, Palette } from "lucide-react";
import { NodeTextarea, NodeLabel, NodeButton, NodeTabSelect } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { useTaskGeneration } from "@/hooks/useTaskGeneration";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "@/components/TouchContextMenu";

type PPTTemplate = "business" | "tech" | "minimal" | "creative";

type PPTGenNodeData = {
  topic: string;
  description?: string;
  template: PPTTemplate;
  primaryColor: string;
  isGenerating: boolean;
};

const TEMPLATE_OPTIONS = [
  { value: "business", label: "商务" },
  { value: "tech", label: "科技" },
  { value: "minimal", label: "简约" },
  { value: "creative", label: "创意" },
];

const COLOR_PRESETS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#EC4899", // Pink
];

const PPTGenNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { getConnectedImageNodes } = useCanvas();
  const { getNode, setNodes, setEdges } = useReactFlow();

  const [topic, setTopic] = useState(data.topic || "");
  const [description, setDescription] = useState(data.description || "");
  const [template, setTemplate] = useState<PPTTemplate>(data.template || "business");
  const [primaryColor, setPrimaryColor] = useState(data.primaryColor || "#3B82F6");
  const [connectedImagesCount, setConnectedImagesCount] = useState(0);

  // 触摸设备支持
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode, setOnConnectionComplete } = useTouchContextMenu();
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

  // 监听连接边的变化
  const connectedEdgeCount = useStore((state) =>
    state.edges.filter((e) => e.target === id).length
  );

  useEffect(() => {
    const connectedNodes = getConnectedImageNodes(id);
    setConnectedImagesCount(connectedNodes.filter(n => n.type === 'image').length);
  }, [id, getConnectedImageNodes, connectedEdgeCount]);

  // 生成 Hook
  const { isGenerating, generate } = useTaskGeneration({
    onSuccess: (result) => {
      console.log(`Created PPT task: ${result.taskId}`);
      const currentNode = getNode(id);
      if (currentNode) {
        // 创建 PPTEditorNode
        const editorNodeId = `ppt-editor-${Date.now()}`;
        const newNode = {
          id: editorNodeId,
          type: "pptEditor",
          position: { x: currentNode.position.x + 400, y: currentNode.position.y },
          style: { width: 480, height: 420 },
          data: {
            taskId: result.taskId,
            topic,
            isLoading: true,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        // 连接边
        setEdges((eds) => addEdge({
          id: `edge-${id}-${editorNodeId}`,
          source: id,
          target: editorNodeId,
        }, eds));
      }
    }
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;

    const connectedNodes = getConnectedImageNodes(id);
    const materials = connectedNodes
      .filter(n => n.type === 'image' && n.data.imageUrl)
      .map(n => ({ type: "image" as const, url: n.data.imageUrl }));

    await generate(async () => {
      const response = await fetch("/api/ppt/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          description: description || undefined,
          template,
          primaryColor,
          materials,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "生成失败");
      }

      return response.json();
    });
  };

  // 触摸事件处理（与其他节点一致）
  useEffect(() => {
    setOnConnectionComplete((sourceId: string, targetId: string) => {
      setEdges((eds) => addEdge({
        id: `edge-${sourceId}-${targetId}-${Date.now()}`,
        source: sourceId,
        target: targetId,
      }, eds));
    });
  }, [setOnConnectionComplete, setEdges]);

  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isTouchDevice) return;
    if (connectMode.isActive && connectMode.sourceNodeId !== id) {
      e.preventDefault();
      e.stopPropagation();
      completeConnection(id);
      return;
    }
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      const options = createNodeMenuOptions(id, {
        onDelete: handleDeleteNode,
        onConnect: () => startConnectMode(id),
      });
      showMenu({ x: touch.clientX, y: touch.clientY }, id, options);
    }, 500);
  }, [isTouchDevice, connectMode, id, completeConnection, handleDeleteNode, startConnectMode, showMenu]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - touchStartPos.current.x, 2) +
      Math.pow(touch.clientY - touchStartPos.current.y, 2)
    );
    if (distance > 10 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    touchStartPos.current = null;
  }, []);

  return (
    <GeneratorNodeLayout
      title="PPT 生成"
      icon={<Presentation className="w-4 h-4" />}
      selected={selected}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-blue-500"
      />

      <div className="space-y-3">
        {/* 主题输入 */}
        <div>
          <NodeLabel>主题/标题</NodeLabel>
          <NodeTextarea
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              data.topic = e.target.value;
            }}
            placeholder="输入演示文稿主题..."
            rows={2}
          />
        </div>

        {/* 补充说明 */}
        <div>
          <NodeLabel>补充说明（可选）</NodeLabel>
          <NodeTextarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              data.description = e.target.value;
            }}
            placeholder="详细描述内容要求..."
            rows={2}
          />
        </div>

        {/* 模板选择 */}
        <div>
          <NodeLabel>模板风格</NodeLabel>
          <NodeTabSelect
            options={TEMPLATE_OPTIONS}
            value={template}
            onChange={(value) => {
              setTemplate(value as PPTTemplate);
              data.template = value;
            }}
          />
        </div>

        {/* 主色调选择 */}
        <div>
          <NodeLabel className="flex items-center gap-1">
            <Palette className="w-3 h-3" />
            主色调
          </NodeLabel>
          <div className="flex gap-2 mt-1">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setPrimaryColor(color);
                  data.primaryColor = color;
                }}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  primaryColor === color
                    ? "border-white ring-2 ring-offset-1 ring-blue-500"
                    : "border-transparent hover:border-white/50"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* 已连接素材提示 */}
        {connectedImagesCount > 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            已连接素材: {connectedImagesCount} 张图片
          </div>
        )}

        {/* 生成按钮 */}
        <NodeButton
          onClick={handleGenerate}
          disabled={isGenerating || !topic.trim()}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              生成中...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              生成 PPT
            </>
          )}
        </NodeButton>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-green-500"
      />
    </GeneratorNodeLayout>
  );
};

export default memo(PPTGenNode);
```

**Step 2: Commit**

```bash
git add src/components/nodes/PPTGenNode.tsx
git commit -m "feat(ppt): add PPTGenNode component"
```

---

### Task 7: 创建 PPTEditorNode 组件

**Files:**
- Create: `src/components/nodes/PPTEditorNode.tsx`

**Step 1: 创建编辑器节点组件**

```typescript
"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow, addEdge } from "@xyflow/react";
import { Loader2, ChevronLeft, ChevronRight, Edit3, RefreshCw, Check, Plus, Trash2, GripVertical } from "lucide-react";
import { NodeLabel, NodeButton } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { cn } from "@/lib/utils";

interface SlideData {
  id: string;
  layout: string;
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
}

type PPTEditorNodeData = {
  taskId: string;
  topic: string;
  isLoading: boolean;
  slides?: SlideData[];
  error?: string;
};

const PPTEditorNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { setNodes, setEdges, getNode } = useReactFlow();

  const [slides, setSlides] = useState<SlideData[]>(data.slides || []);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(data.isLoading);
  const [error, setError] = useState(data.error);

  // 轮询任务状态
  useEffect(() => {
    if (!data.taskId || !isLoading) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ppt/task?id=${data.taskId}`);
        const result = await response.json();

        if (result.success && result.task) {
          if (result.task.status === "completed") {
            setSlides(result.task.slides || []);
            setIsLoading(false);
            data.isLoading = false;
            data.slides = result.task.slides;
            clearInterval(pollInterval);
          } else if (result.task.status === "failed") {
            setError(result.task.error || "生成失败");
            setIsLoading(false);
            data.isLoading = false;
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [data.taskId, isLoading]);

  const currentSlide = slides[currentSlideIndex];

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const handleConfirm = useCallback(() => {
    const currentNode = getNode(id);
    if (!currentNode) return;

    // 创建 PPTNode
    const pptNodeId = `ppt-${Date.now()}`;
    const newNode = {
      id: pptNodeId,
      type: "ppt",
      position: { x: currentNode.position.x + 520, y: currentNode.position.y },
      style: { width: 420, height: 360 },
      data: {
        taskId: data.taskId,
        topic: data.topic,
        slides,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => addEdge({
      id: `edge-${id}-${pptNodeId}`,
      source: id,
      target: pptNodeId,
    }, eds));
  }, [id, data.taskId, data.topic, slides, getNode, setNodes, setEdges]);

  return (
    <GeneratorNodeLayout
      title="PPT 编辑器"
      icon={<Edit3 className="w-4 h-4" />}
      selected={selected}
      className="!w-[480px]"
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-blue-500"
      />

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-sm text-neutral-500">正在生成 PPT...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <NodeButton onClick={() => setIsLoading(true)} variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              重试
            </NodeButton>
          </div>
        ) : slides.length > 0 ? (
          <>
            {/* 幻灯片预览 */}
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[200px]">
              {currentSlide && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{currentSlide.title}</h3>
                  {currentSlide.subtitle && (
                    <p className="text-sm text-neutral-500">{currentSlide.subtitle}</p>
                  )}
                  {currentSlide.content && (
                    <ul className="text-sm space-y-1 mt-3">
                      {currentSlide.content.map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-blue-500">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* 翻页控制 */}
            <div className="flex items-center justify-between">
              <button
                onClick={goToPrevSlide}
                disabled={currentSlideIndex === 0}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-neutral-500">
                {currentSlideIndex + 1} / {slides.length}
              </span>
              <button
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* 缩略图导航 */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  onClick={() => setCurrentSlideIndex(index)}
                  className={cn(
                    "flex-shrink-0 w-16 h-12 rounded border-2 text-xs flex items-center justify-center transition-all",
                    index === currentSlideIndex
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-neutral-200 dark:border-neutral-700 hover:border-blue-300"
                  )}
                >
                  {index + 1}
                </button>
              ))}
              <button className="flex-shrink-0 w-16 h-12 rounded border-2 border-dashed border-neutral-300 dark:border-neutral-600 hover:border-blue-400 flex items-center justify-center">
                <Plus className="w-4 h-4 text-neutral-400" />
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <NodeButton variant="secondary" className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" />
                重新生成
              </NodeButton>
              <NodeButton onClick={handleConfirm} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                确认完成
              </NodeButton>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-12 text-neutral-500">
            暂无内容
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!w-3 !h-3 !bg-green-500"
      />
    </GeneratorNodeLayout>
  );
};

export default memo(PPTEditorNode);
```

**Step 2: Commit**

```bash
git add src/components/nodes/PPTEditorNode.tsx
git commit -m "feat(ppt): add PPTEditorNode component"
```

---

### Task 8: 创建 PPTNode 组件

**Files:**
- Create: `src/components/nodes/PPTNode.tsx`

**Step 1: 创建输出节点组件**

```typescript
"use client";

import { memo, useState, useCallback } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Maximize2, Download, Presentation } from "lucide-react";
import { NodeButton } from "@/components/ui/NodeUI";
import { GeneratorNodeLayout } from "./GeneratorNodeLayout";
import { cn } from "@/lib/utils";

interface SlideData {
  id: string;
  layout: string;
  title: string;
  subtitle?: string;
  content?: string[];
  imageUrl?: string;
}

type PPTNodeData = {
  taskId: string;
  topic: string;
  slides: SlideData[];
  pptUrl?: string;
};

const PPTNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { setNodes, setEdges } = useReactFlow();

  const [slides] = useState<SlideData[]>(data.slides || []);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const currentSlide = slides[currentSlideIndex];

  const goToPrevSlide = () => {
    setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
  };

  const goToNextSlide = () => {
    setCurrentSlideIndex((prev) => Math.min(slides.length - 1, prev + 1));
  };

  const handleFullscreen = () => {
    setIsFullscreen(true);
    // TODO: 实现全屏播放模式
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/ppt/export?id=${data.taskId}`);
      if (!response.ok) throw new Error("下载失败");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.topic || "presentation"}.pptx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("下载失败，请重试");
    }
  };

  const handleDeleteNode = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  // 键盘事件处理（全屏模式）
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isFullscreen) return;
    if (e.key === "ArrowLeft") goToPrevSlide();
    if (e.key === "ArrowRight") goToNextSlide();
    if (e.key === "Escape") setIsFullscreen(false);
  }, [isFullscreen]);

  return (
    <>
      <GeneratorNodeLayout
        title="PPT 演示"
        icon={<Presentation className="w-4 h-4" />}
        selected={selected}
      >
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-blue-500"
        />

        <div className="space-y-3">
          {slides.length > 0 ? (
            <>
              {/* 幻灯片预览 */}
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[180px]">
                {currentSlide && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base">{currentSlide.title}</h3>
                    {currentSlide.subtitle && (
                      <p className="text-xs text-neutral-500">{currentSlide.subtitle}</p>
                    )}
                    {currentSlide.content && (
                      <ul className="text-xs space-y-1 mt-2">
                        {currentSlide.content.slice(0, 4).map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-blue-500">•</span>
                            {item}
                          </li>
                        ))}
                        {currentSlide.content.length > 4 && (
                          <li className="text-neutral-400">...</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* 翻页控制 */}
              <div className="flex items-center justify-between">
                <button
                  onClick={goToPrevSlide}
                  disabled={currentSlideIndex === 0}
                  className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-neutral-500">
                  {currentSlideIndex + 1} / {slides.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleFullscreen}
                    className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    title="全屏播放"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToNextSlide}
                    disabled={currentSlideIndex === slides.length - 1}
                    className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 下载按钮 */}
              <NodeButton onClick={handleDownload} className="w-full">
                <Download className="w-4 h-4 mr-2" />
                下载 PPT (.pptx)
              </NodeButton>
            </>
          ) : (
            <div className="flex items-center justify-center py-12 text-neutral-500">
              暂无内容
            </div>
          )}
        </div>
      </GeneratorNodeLayout>

      {/* 全屏播放模式 */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="max-w-4xl w-full p-8" onClick={(e) => e.stopPropagation()}>
            {currentSlide && (
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-12 shadow-2xl">
                <h1 className="text-4xl font-bold mb-4">{currentSlide.title}</h1>
                {currentSlide.subtitle && (
                  <p className="text-xl text-neutral-500 mb-8">{currentSlide.subtitle}</p>
                )}
                {currentSlide.content && (
                  <ul className="text-xl space-y-4">
                    {currentSlide.content.map((item, i) => (
                      <li key={i} className="flex items-start gap-4">
                        <span className="text-blue-500">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-center mt-8 gap-4">
              <button
                onClick={goToPrevSlide}
                disabled={currentSlideIndex === 0}
                className="px-6 py-3 bg-white/10 rounded-lg text-white disabled:opacity-30"
              >
                上一页
              </button>
              <span className="px-6 py-3 text-white">
                {currentSlideIndex + 1} / {slides.length}
              </span>
              <button
                onClick={goToNextSlide}
                disabled={currentSlideIndex === slides.length - 1}
                className="px-6 py-3 bg-white/10 rounded-lg text-white disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(PPTNode);
```

**Step 2: Commit**

```bash
git add src/components/nodes/PPTNode.tsx
git commit -m "feat(ppt): add PPTNode component"
```

---

## Phase 3: 集成到画布

### Task 9: 注册 PPT 节点类型

**Files:**
- Modify: `src/components/InfiniteCanvas.tsx`

**Step 1: 导入新节点组件**

在文件顶部的 import 语句区域添加：

```typescript
import PPTGenNode from "./nodes/PPTGenNode";
import PPTEditorNode from "./nodes/PPTEditorNode";
import PPTNode from "./nodes/PPTNode";
```

**Step 2: 注册节点类型**

找到 `const nodeTypes = {` 定义，在末尾添加：

```typescript
const nodeTypes = {
  // ... existing types
  tts: TTSNode as any,
  pptGen: PPTGenNode as any,      // 新增
  pptEditor: PPTEditorNode as any, // 新增
  ppt: PPTNode as any,             // 新增
};
```

**Step 3: Commit**

```bash
git add src/components/InfiniteCanvas.tsx
git commit -m "feat(ppt): register PPT node types in canvas"
```

---

### Task 10: 在工具栏添加 PPT 生成入口

**Files:**
- Modify: `src/components/NodeToolbar.tsx`

**Step 1: 找到节点类型配置**

查找现有的节点类型配置数组，添加 PPT 生成节点：

```typescript
{
  type: "pptGen",
  label: "PPT 生成",
  icon: Presentation, // 从 lucide-react 导入
  description: "AI 智能生成演示文稿",
}
```

**Step 2: 确保导入 Presentation 图标**

```typescript
import { Presentation } from "lucide-react";
```

**Step 3: Commit**

```bash
git add src/components/NodeToolbar.tsx
git commit -m "feat(ppt): add PPT generation to node toolbar"
```

---

## Phase 4: 测试和完善

### Task 11: 端到端测试

**Step 1: 启动开发服务器**

Run: `npm run dev`
Expected: 服务器启动成功

**Step 2: 测试 PPT 生成流程**

1. 打开画布
2. 从工具栏拖拽 "PPT 生成" 节点
3. 输入主题，选择模板和颜色
4. 点击 "生成 PPT"
5. 验证 PPTEditorNode 是否正确创建
6. 等待生成完成，验证幻灯片预览
7. 点击 "确认完成"，验证 PPTNode 创建
8. 测试下载功能

**Step 3: 修复发现的问题**

根据测试结果修复任何问题。

**Step 4: Final Commit**

```bash
git add .
git commit -m "feat(ppt): complete PPT generation feature implementation"
```

---

## 文件清单

| 文件 | 操作 | 说明 |
|-----|------|------|
| `prisma/schema.prisma` | 修改 | 添加 PPTTask 模型 |
| `src/app/actions/ppt-task.ts` | 创建 | PPT 任务 Server Action |
| `src/app/api/ppt/generate/route.ts` | 创建 | 生成 API |
| `src/app/api/ppt/task/route.ts` | 创建 | 任务状态 API |
| `src/app/api/ppt/export/route.ts` | 创建 | 导出下载 API |
| `src/components/nodes/PPTGenNode.tsx` | 创建 | PPT 生成节点 |
| `src/components/nodes/PPTEditorNode.tsx` | 创建 | PPT 编辑器节点 |
| `src/components/nodes/PPTNode.tsx` | 创建 | PPT 输出节点 |
| `src/components/InfiniteCanvas.tsx` | 修改 | 注册节点类型 |
| `src/components/NodeToolbar.tsx` | 修改 | 添加工具栏入口 |

---

## 注意事项

1. **API Key**：确保 `.env.local` 中配置了 `ANTHROPIC_API_KEY`
2. **Beta API**：Claude Skills API 仍为 beta 版本，API 可能变化
3. **错误处理**：生产环境需要更完善的错误处理和重试机制
4. **文件存储**：考虑将生成的 PPT 文件上传到 R2 以便长期访问
