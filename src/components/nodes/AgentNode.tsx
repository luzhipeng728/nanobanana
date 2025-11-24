"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import {
  Loader2,
  Brain,
  Search,
  Lightbulb,
  Wand2,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
} from "lucide-react";
import type { AgentNodeData, AgentPrompt, AgentStreamEvent } from "@/types/agent";
import { RESOLUTION_OPTIONS } from "@/types/image-gen";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeSelect, NodeButton, NodeLabel } from "@/components/ui/NodeUI";

const AgentNode = ({ data, id, isConnectable }: NodeProps<any>) => {
  const { addImageNode, updateImageNode, getNode } = useCanvas();
  const { getNode: getReactFlowNode, getNodes: getReactFlowNodes } = useReactFlow();

  const [userRequest, setUserRequest] = useState(data.userRequest || "");
  const [selectedModel, setSelectedModel] = useState<"nano-banana" | "nano-banana-pro">("nano-banana");
  const [imageSize, setImageSize] = useState<string>("2K"); // Default resolution for Pro model
  const [status, setStatus] = useState<AgentNodeData["status"]>(data.status || "idle");
  const [currentStep, setCurrentStep] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [prompts, setPrompts] = useState<AgentPrompt[]>([]);
  const [error, setError] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0); // 当前正在生成的数量

  const abortControllerRef = useRef<AbortController | null>(null);

  const statusIcons = {
    idle: Brain,
    searching: Search,
    planning: Lightbulb,
    generating: Wand2,
    creating: ImageIcon,
    completed: CheckCircle2,
    error: XCircle,
  };

  const StatusIcon = statusIcons[status];

  // 并发生成图片（最多 10 个并发）
  const generateImagesInBatches = async (promptsList: AgentPrompt[]) => {
    const MAX_CONCURRENT = 10;
    const currentNode = getReactFlowNode(id);
    if (!currentNode) return;

    let completedCount = 0;
    const totalCount = promptsList.length;

    // 创建图片节点位置计算（2×n 网格布局：最多2行，然后往右排）
    // 16:9 图片节点实际尺寸：420px × 270px
    const NODE_WIDTH = 420;
    const NODE_HEIGHT = 270;
    const HORIZONTAL_GAP = 50;  // 列之间的间距
    const VERTICAL_GAP = 50;    // 行之间的间距

    // 检查位置是否被占用（检测重叠）
    const isPositionOccupied = (x: number, y: number) => {
      const allNodes = getReactFlowNodes();
      return allNodes.some((node) => {
        if (node.id === id) return false; // 排除当前Agent节点
        const nodeWidth = (node.style?.width as number) || NODE_WIDTH;
        const nodeHeight = (node.style?.height as number) || NODE_HEIGHT;

        // 检查矩形是否重叠
        return (
          x < node.position.x + nodeWidth &&
          x + NODE_WIDTH > node.position.x &&
          y < node.position.y + nodeHeight &&
          y + NODE_HEIGHT > node.position.y
        );
      });
    };

    // 寻找未被占用的起始列位置
    const findStartColumn = () => {
      let col = 0;
      while (col < 100) { // 最多检查100列
        const testX = currentNode.position.x + 450 + col * (NODE_WIDTH + HORIZONTAL_GAP);
        const testY = currentNode.position.y;

        // 检查这一列的两行是否都可用
        const row0Occupied = isPositionOccupied(testX, testY);
        const row1Occupied = isPositionOccupied(testX, testY + NODE_HEIGHT + VERTICAL_GAP);

        if (!row0Occupied && !row1Occupied) {
          return col;
        }
        col++;
      }
      return col; // 如果都占用，就继续往右
    };

    const startColumn = findStartColumn();

    const getNodePosition = (index: number) => {
      const column = startColumn + Math.floor(index / 2); // 从startColumn开始，每2个节点为一列
      const row = index % 2; // 当前在列中的行位置（0或1）

      return {
        x: currentNode.position.x + 450 + column * (NODE_WIDTH + HORIZONTAL_GAP),
        y: currentNode.position.y + row * (NODE_HEIGHT + VERTICAL_GAP),
      };
    };

    // 第一步：立即创建所有图片节点（loading 状态）
    console.log("Creating image tasks and nodes...");
    const nodeIdMap = new Map<string, string>(); // promptId -> nodeId
    const taskIdMap = new Map<string, string>(); // promptId -> taskId

    // 第二步：并发创建任务并立即创建节点
    console.log(`Starting concurrent task creation (max ${MAX_CONCURRENT} concurrent)...`);

    // 创建单个任务并立即创建节点的函数
    const generateSingleImage = async (prompt: AgentPrompt, index: number) => {
      const startTime = Date.now();

      try {
        // 增加正在生成的计数
        setGeneratingCount((prev) => prev + 1);

        // 更新 prompt 状态为生成中
        setPrompts((prev) =>
          prev.map((p) => (p.id === prompt.id ? { ...p, status: "generating" } : p))
        );

        const startTimeStr = new Date().toLocaleTimeString() + '.' + Date.now() % 1000;
        console.log(`🚀 [START ${startTimeStr}] Task ${index + 1}/${totalCount}: ${prompt.scene}`);

        // 使用 API 调用创建任务
        const config: any = {
          aspectRatio: "16:9",
        };

        // Add imageSize for Pro model
        if (selectedModel === "nano-banana-pro") {
          config.imageSize = imageSize;
        }

        const response = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: prompt.prompt,
            model: selectedModel,
            config,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (result.success && result.taskId) {
          // 立即创建 Image 节点并传入任务 ID
          const position = getNodePosition(index);
          const nodeId = addImageNode(undefined, prompt.prompt, position, result.taskId);
          nodeIdMap.set(prompt.id, nodeId);
          taskIdMap.set(prompt.id, result.taskId);

          // 更新 prompt 状态为已创建任务
          setPrompts((prev) =>
            prev.map((p) =>
              p.id === prompt.id
                ? { ...p, status: "generating", taskId: result.taskId }
                : p
            )
          );

          completedCount++;
          setProgress(90 + (completedCount / totalCount) * 10);
          const endTimeStr = new Date().toLocaleTimeString() + '.' + Date.now() % 1000;
          console.log(`✅ [SUCCESS ${endTimeStr}] Task ${index + 1}/${totalCount} created in ${duration}s (${completedCount}/${totalCount} done) - Task ID: ${result.taskId}`);
        } else {
          throw new Error(result.error || "创建任务失败");
        }
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`❌ [FAILED] Image ${index + 1}/${totalCount} failed after ${duration}s:`, err);
        setPrompts((prev) =>
          prev.map((p) =>
            p.id === prompt.id
              ? {
                  ...p,
                  status: "error",
                  error: err instanceof Error ? err.message : "生成失败",
                }
              : p
          )
        );
      } finally {
        // 减少正在生成的计数
        setGeneratingCount((prev) => prev - 1);
      }
    };

    // 分批并发生成（最多 10 个并发）
    const batchCount = Math.ceil(promptsList.length / MAX_CONCURRENT);
    for (let i = 0; i < promptsList.length; i += MAX_CONCURRENT) {
      const batch = promptsList.slice(i, i + MAX_CONCURRENT);
      const batchNum = Math.floor(i / MAX_CONCURRENT) + 1;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📦 [BATCH ${batchNum}/${batchCount}] Starting ${batch.length} concurrent generations at ${new Date().toLocaleTimeString()}`);
      console.log(`Images in this batch: ${batch.map((p, idx) => `#${i + idx + 1}`).join(', ')}`);
      console.log(`${'='.repeat(60)}\n`);

      const batchStartTime = Date.now();

      // 并发生成这一批 - 所有请求同时发起！
      const promises = batch.map((prompt, idx) => generateSingleImage(prompt, i + idx));
      console.log(`🚀 Launched ${promises.length} concurrent requests!`);

      await Promise.all(promises);

      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      console.log(`\n✅ [BATCH ${batchNum}/${batchCount}] All ${batch.length} tasks created in ${batchDuration}s\n`);
    }

    // 任务创建完成，Agent 的工作结束
    setStatus("idle");
    setCurrentStep("");
    setProgress(100);
    setGeneratingCount(0);
    console.log("🎉 All tasks created successfully! Images are generating in background.");
  };

  const onGenerate = useCallback(async () => {
    if (!userRequest.trim() || isRunning) return;

    setIsRunning(true);
    setError("");
    setStatus("searching");
    setProgress(0);
    setPrompts([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/agent/generate-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userRequest,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("无法读取响应流");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const eventData = line.slice(6);
            try {
              const event: AgentStreamEvent = JSON.parse(eventData);

              if (event.type === "status") {
                if (event.status) setStatus(event.status);
                if (event.step) setCurrentStep(event.step);
                if (event.progress !== undefined) setProgress(event.progress);
              } else if (event.type === "progress") {
                if (event.progress !== undefined) setProgress(event.progress);
              } else if (event.type === "prompts") {
                if (event.prompts) {
                  setPrompts(event.prompts);
                  // 开始并发生成图片
                  setTimeout(() => {
                    generateImagesInBatches(event.prompts!);
                  }, 500);
                }
              } else if (event.type === "error") {
                setError(event.error || "未知错误");
                setStatus("error");
              } else if (event.type === "complete") {
                if (event.status) setStatus(event.status);
                if (event.progress !== undefined) setProgress(event.progress);
              }
            } catch (e) {
              console.error("Failed to parse event:", e);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
      } else {
        console.error("Generation error:", err);
        setError(err instanceof Error ? err.message : "未知错误");
        setStatus("error");
      }
    } finally {
      setIsRunning(false);
    }
  }, [userRequest, selectedModel, isRunning, id, getReactFlowNode, addImageNode, updateImageNode]);

  const onStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      setStatus("idle");
      setCurrentStep("");
    }
  };

  return (
    <BaseNode
      title="Agent"
      icon={Brain}
      color="purple"
      className="w-[350px]"
      headerActions={
        <div className="flex items-center gap-1.5">
          {status !== "idle" && status !== "error" && (
            <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
          )}
          <StatusIcon className="w-3.5 h-3.5 text-purple-600" />
        </div>
      }
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-neutral-900"
      />

      {/* User Request Input */}
      <div className="space-y-1">
        <NodeLabel>Goal Description</NodeLabel>
        <NodeTextarea
          rows={4}
          value={userRequest}
          onChange={(e) => setUserRequest(e.target.value)}
          placeholder="Describe the scene you want to generate..."
          disabled={isRunning}
          className="focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      {/* Model, Resolution & Count */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <NodeLabel>Model</NodeLabel>
          <NodeSelect
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as any)}
            disabled={isRunning}
          >
            <option value="nano-banana">Fast</option>
            <option value="nano-banana-pro">Pro</option>
          </NodeSelect>
        </div>

        {/* Resolution for Pro model */}
        {selectedModel === "nano-banana-pro" && (
          <div className="space-y-1">
            <NodeLabel>Resolution</NodeLabel>
            <NodeSelect
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={isRunning}
            >
              {Object.entries(RESOLUTION_OPTIONS).map(([key, option]) => (
                <option key={key} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NodeSelect>
          </div>
        )}
      </div>

      {/* Status & Progress */}
      {status !== "idle" && (
        <div className="space-y-2 bg-neutral-50 dark:bg-neutral-900/50 p-2 rounded-lg border border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-600 dark:text-neutral-400 truncate flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
              {currentStep}
              {generatingCount > 0 && status === "creating" && (
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  ({generatingCount})
                </span>
              )}
            </span>
            <span className="text-purple-600 dark:text-purple-400 font-medium">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2 flex gap-2 items-start">
          <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400 leading-tight">{error}</p>
        </div>
      )}

      {/* Generated Prompts */}
      {prompts.length > 0 && (
        <div className="space-y-2">
          <NodeLabel>Scenes ({prompts.length})</NodeLabel>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-800">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 transition-colors hover:border-purple-200 dark:hover:border-purple-900/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">
                    {prompt.scene}
                  </span>
                  <span className="text-[10px] text-neutral-500 ml-2 flex-shrink-0">
                    {prompt.status === "pending" && "Waiting"}
                    {prompt.status === "generating" && (
                      <span className="flex items-center gap-1 text-purple-600">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Gen
                      </span>
                    )}
                    {prompt.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    {prompt.status === "error" && <XCircle className="w-3 h-3 text-red-500" />}
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 line-clamp-2 leading-relaxed">
                  {prompt.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="pt-2">
        {!isRunning ? (
          <NodeButton
            onClick={onGenerate}
            disabled={!userRequest.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Brain className="w-3.5 h-3.5" />
            Start Agent
          </NodeButton>
        ) : (
          <NodeButton
            onClick={onStop}
            variant="danger"
            className="w-full"
          >
            <XCircle className="w-3.5 h-3.5" />
            Stop Generation
          </NodeButton>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 !bg-purple-500 !border-2 !border-white dark:!border-neutral-900"
      />
    </BaseNode>
  );
};

export default memo(AgentNode);
