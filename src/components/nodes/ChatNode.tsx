"use client";

import { memo, useState, useRef, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { PanelRightClose, PanelRightOpen, Maximize2, Minimize2, ChevronDown, Sparkles, Bot } from "lucide-react";
import { DrawIoEmbed, DrawIoEmbedRef } from "react-drawio";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useChat, UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  formatXML,
  convertToLegalXml,
  replaceNodes,
  replaceXMLParts,
  validateMxCellStructure,
  extractDiagramXML,
  getEmptyDiagramXML,
} from "@/lib/drawio-utils";

// Drawio components
import { ChatInput, ReasoningEffort } from "@/components/drawio/chat-input";
import { ChatMessageDisplay } from "@/components/drawio/chat-message-display";
import { ButtonWithTooltip } from "@/components/drawio/button-with-tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/drawio/ui/dropdown-menu";

// 可用的模型列表
const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', icon: Bot, description: '默认，Anthropic 模型' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', icon: Sparkles, description: '支持思维链' },
];

type ChatNodeData = {
  messages?: UIMessage[];
};

// Default dimensions
const CHAT_PANEL_WIDTH = 380;
const MIN_EDITOR_WIDTH = 400;

const ChatNode = ({ data, id, isConnectable, selected }: NodeProps<any>) => {
  const { updateNodeData } = useReactFlow();

  // Draw.io state
  const drawioRef = useRef<DrawIoEmbedRef | null>(null);
  const [chartXML, setChartXML] = useState<string>("");
  const resolverRef = useRef<((value: string) => void) | null>(null);
  const [diagramHistory, setDiagramHistory] = useState<{ svg: string; xml: string }[]>([]);
  const expectHistoryExportRef = useRef<boolean>(false);
  const saveResolverRef = useRef<((xml: string) => void) | null>(null);

  // File upload state
  const [files, setFiles] = useState<File[]>([]);

  // Panel visibility
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Input state
  const [input, setInput] = useState("");

  // Model state - default to Gemini
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]);

  // Deep research state
  const [enableDeepResearch, setEnableDeepResearch] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('low');

  // Set up portal container for fullscreen mode
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // 用于保存切换全屏前的图表 XML
  const pendingRestoreXmlRef = useRef<string | null>(null);
  const isFullscreenSwitchingRef = useRef(false);

  // Fetch current diagram XML
  const fetchCurrentXML = useCallback((saveToHistory = true) => {
    return Promise.race([
      new Promise<string>((resolve) => {
        if (drawioRef.current) {
          resolverRef.current = resolve;
          if (saveToHistory) {
            expectHistoryExportRef.current = true;
          }
          drawioRef.current.exportDiagram({ format: "xmlsvg" });
        } else {
          resolve("");
        }
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Chart export timed out")), 10000)
      ),
    ]);
  }, []);

  // Load diagram into draw.io and auto-export to save data
  const loadDiagram = useCallback((xml: string) => {
    if (drawioRef.current) {
      drawioRef.current.load({ xml });
      // Auto-export after loading to update node data (for connected nodes to access)
      // Use a short delay to ensure the diagram is fully loaded
      setTimeout(() => {
        if (drawioRef.current) {
          drawioRef.current.exportDiagram({ format: "xmlsvg" });
        }
      }, 500);
    }
  }, []);

  // 当全屏状态改变后，恢复图表内容
  useEffect(() => {
    if (isFullscreenSwitchingRef.current && pendingRestoreXmlRef.current) {
      // 等待 DrawIoEmbed 加载完成后恢复图表
      const timer = setTimeout(() => {
        if (pendingRestoreXmlRef.current && drawioRef.current) {
          console.log('[ChatNode] Restoring diagram after fullscreen switch');
          loadDiagram(pendingRestoreXmlRef.current);
          pendingRestoreXmlRef.current = null;
        }
        isFullscreenSwitchingRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, loadDiagram]);

  // 切换全屏时保存当前图表
  const handleToggleFullscreen = useCallback(async () => {
    // 先保存当前图表 XML
    if (chartXML) {
      pendingRestoreXmlRef.current = chartXML;
    } else {
      // 如果 chartXML 为空，尝试导出获取
      try {
        const currentXml = await fetchCurrentXML(false);
        if (currentXml) {
          pendingRestoreXmlRef.current = currentXml;
        }
      } catch (e) {
        console.warn('[ChatNode] Failed to fetch XML before fullscreen switch:', e);
      }
    }
    isFullscreenSwitchingRef.current = true;
    setIsFullscreen(prev => !prev);
  }, [chartXML, fetchCurrentXML]);

  // Clear diagram
  const clearDiagram = useCallback(() => {
    const emptyDiagram = getEmptyDiagramXML();
    loadDiagram(emptyDiagram);
    setChartXML(emptyDiagram);
    setDiagramHistory([]);
  }, [loadDiagram]);

  // Handle diagram export
  const handleDiagramExport = useCallback((data: any) => {
    try {
      const extractedXML = extractDiagramXML(data.data);
      setChartXML(extractedXML);

      // Store XML in node data for connected nodes to access
      updateNodeData(id, { diagramXML: extractedXML, diagramSVG: data.data });

      // Save to history if this was a user-initiated export
      if (expectHistoryExportRef.current) {
        setDiagramHistory((prev) => [
          ...prev,
          { svg: data.data, xml: extractedXML },
        ]);
        expectHistoryExportRef.current = false;
      }

      if (resolverRef.current) {
        resolverRef.current(extractedXML);
        resolverRef.current = null;
      }

      // Handle save to file if requested
      if (saveResolverRef.current) {
        saveResolverRef.current(extractedXML);
        saveResolverRef.current = null;
      }
    } catch (error) {
      console.error("[ChatNode] Error extracting diagram XML:", error);
      if (resolverRef.current) {
        resolverRef.current("");
        resolverRef.current = null;
      }
    }
  }, [id, updateNodeData]);

  // Save diagram to file
  const saveDiagramToFile = useCallback((filename: string) => {
    if (!drawioRef.current) {
      console.warn("Draw.io editor not ready");
      return;
    }

    drawioRef.current.exportDiagram({ format: "xmlsvg" });
    saveResolverRef.current = (xml: string) => {
      let fileContent = xml;
      if (!xml.includes("<mxfile")) {
        fileContent = `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`;
      }

      const blob = new Blob([fileContent], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.endsWith(".drawio") ? filename : `${filename}.drawio`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    };
  }, []);

  // useChat hook from AI SDK - exactly like original project
  const { messages, sendMessage, addToolResult, status, error, setMessages } =
    useChat({
      transport: new DefaultChatTransport({
        api: "/api/drawio-chat",
      }),
      async onToolCall({ toolCall }) {
        if (toolCall.toolName === "display_diagram") {
          const { xml } = toolCall.input as { xml: string };

          const validationError = validateMxCellStructure(xml);

          if (validationError) {
            addToolResult({
              tool: "display_diagram",
              toolCallId: toolCall.toolCallId,
              output: validationError,
            });
          } else {
            addToolResult({
              tool: "display_diagram",
              toolCallId: toolCall.toolCallId,
              output: "Successfully displayed the diagram.",
            });
          }
        } else if (toolCall.toolName === "edit_diagram") {
          const { edits } = toolCall.input as {
            edits: Array<{ search: string; replace: string }>;
          };

          let currentXml = "";
          try {
            // Fetch without saving to history
            currentXml = await fetchCurrentXML(false);

            const editedXml = replaceXMLParts(currentXml, edits);
            loadDiagram(editedXml);

            addToolResult({
              tool: "edit_diagram",
              toolCallId: toolCall.toolCallId,
              output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
            });
          } catch (error) {
            console.error("Edit diagram failed:", error);

            const errorMessage =
              error instanceof Error ? error.message : String(error);

            addToolResult({
              tool: "edit_diagram",
              toolCallId: toolCall.toolCallId,
              output: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml}
\`\`\`

Please retry with an adjusted search pattern or use display_diagram if retries are exhausted.`,
            });
          }
        }
      },
      onError: (error) => {
        console.error("Chat error:", error);
      },
    });

  // Form submit handler
  const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const isProcessing = status === "streaming" || status === "submitted";
    if (input.trim() && !isProcessing) {
      try {
        let chartXml = await fetchCurrentXML();
        chartXml = formatXML(chartXml);

        const parts: any[] = [{ type: "text", text: input }];

        if (files.length > 0) {
          for (const file of files) {
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });

            parts.push({
              type: "file",
              url: dataUrl,
              mediaType: file.type,
            });
          }
        }

        sendMessage(
          { parts },
          {
            body: {
              xml: chartXml,
              modelId: selectedModel.id,
              enableDeepResearch,
              reasoningEffort: enableDeepResearch ? reasoningEffort : undefined,
            },
          }
        );

        setInput("");
        setFiles([]);
      } catch (error) {
        console.error("Error fetching chart data:", error);
      }
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setInput(e.target.value);
  };

  const handleFileChange = (newFiles: File[]) => {
    setFiles(newFiles);
  };

  const handleClearChat = () => {
    setMessages([]);
    clearDiagram();
  };

  // Calculate minimum widths based on chat visibility
  const minWidth = isChatVisible ? MIN_EDITOR_WIDTH + CHAT_PANEL_WIDTH : MIN_EDITOR_WIDTH;

  // Shared content component for both normal and fullscreen modes
  const renderContent = (fullscreen: boolean) => (
    <>
      {/* Draw.io Editor */}
      <div className={cn(
        "h-full border-r border-border/30 bg-white transition-all",
        isChatVisible ? "flex-1" : "w-full"
      )}>
        <DrawIoEmbed
          ref={drawioRef}
          onExport={handleDiagramExport}
          autosave={true}
          onAutoSave={(data) => {
            // Auto-save captures user modifications - trigger export to update node data
            if (drawioRef.current) {
              drawioRef.current.exportDiagram({ format: "xmlsvg" });
            }
          }}
          urlParameters={{
            spin: true,
            libraries: false,
            saveAndExit: false,
            noExitBtn: true,
          }}
        />
      </div>

      {/* Chat Panel - Collapsed */}
      {!isChatVisible && (
        <div className="h-full flex flex-col items-center pt-4 bg-card border-l border-border/30 w-12">
          <ButtonWithTooltip
            tooltipContent="显示聊天面板"
            variant="ghost"
            size="icon"
            onClick={() => setIsChatVisible(true)}
            className="hover:bg-accent transition-colors"
          >
            <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
          </ButtonWithTooltip>
          <div
            className="text-sm font-medium text-muted-foreground mt-8 tracking-wide"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            AI 聊天
          </div>
        </div>
      )}

      {/* Chat Panel - Expanded */}
      {isChatVisible && (
        <div className={cn(
          "h-full flex flex-col bg-card",
          fullscreen ? "w-[450px]" : "animate-slide-in-right"
        )} style={fullscreen ? undefined : { width: CHAT_PANEL_WIDTH }}>
          {/* Header */}
          <header className="px-5 py-3 border-b border-border/50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-sm font-medium">
                      <selectedModel.icon className="w-4 h-4 text-primary" />
                      <span className="text-foreground">{selectedModel.name}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {AVAILABLE_MODELS.map((model) => (
                      <DropdownMenuItem
                        key={model.id}
                        onClick={() => setSelectedModel(model)}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer",
                          selectedModel.id === model.id && "bg-accent"
                        )}
                      >
                        <model.icon className="w-4 h-4 text-primary" />
                        <div className="flex flex-col">
                          <span className="font-medium">{model.name}</span>
                          <span className="text-xs text-muted-foreground">{model.description}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-1">
                <ButtonWithTooltip
                  tooltipContent={fullscreen ? "退出全屏" : "全屏模式"}
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleFullscreen}
                  className="hover:bg-accent"
                >
                  {fullscreen ? (
                    <Minimize2 className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Maximize2 className="h-5 w-5 text-muted-foreground" />
                  )}
                </ButtonWithTooltip>
                {!fullscreen && (
                  <ButtonWithTooltip
                    tooltipContent="隐藏聊天面板"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsChatVisible(false)}
                    className="hover:bg-accent"
                  >
                    <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                  </ButtonWithTooltip>
                )}
              </div>
            </div>
          </header>

          {/* Messages */}
          <main className="flex-1 overflow-hidden">
            <ChatMessageDisplay
              messages={messages}
              error={error}
              setInput={setInput}
              setFiles={handleFileChange}
              chartXML={chartXML}
              onDisplayChart={loadDiagram}
            />
          </main>

          {/* Input */}
          <footer className="p-4 border-t border-border/50 bg-card/50 flex-shrink-0">
            <ChatInput
              input={input}
              status={status}
              onSubmit={onFormSubmit}
              onChange={handleInputChange}
              onClearChat={handleClearChat}
              files={files}
              onFileChange={handleFileChange}
              showHistory={showHistory}
              onToggleHistory={setShowHistory}
              diagramHistory={diagramHistory}
              onDisplayChart={loadDiagram}
              onSaveDiagram={saveDiagramToFile}
              enableDeepResearch={enableDeepResearch}
              onEnableDeepResearchChange={setEnableDeepResearch}
              reasoningEffort={reasoningEffort}
              onReasoningEffortChange={setReasoningEffort}
            />
          </footer>
        </div>
      )}
    </>
  );

  // Fullscreen mode - render in portal
  if (isFullscreen && portalContainer) {
    return (
      <>
        {/* Placeholder in canvas */}
        <div className="w-full h-full bg-muted/50 rounded-xl border border-dashed border-border flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Maximize2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">全屏模式中</p>
            <button
              onClick={() => setIsFullscreen(false)}
              className="text-xs text-primary hover:underline mt-1"
            >
              点击退出
            </button>
          </div>
        </div>
        {createPortal(
          <div className="fixed inset-0 z-[9999] bg-background flex">
            {renderContent(true)}
          </div>,
          portalContainer
        )}
      </>
    );
  }

  // Normal mode
  return (
    <div
      className={cn(
        "nowheel bg-card border rounded-xl shadow-soft overflow-hidden flex w-full h-full",
        selected
          ? "ring-4 ring-offset-0 ring-primary/40 border-primary/50 shadow-lg"
          : "border-border/30 hover:shadow-lg"
      )}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={minWidth}
        minHeight={400}
        lineClassName="!border-primary/40"
        handleClassName="!w-3 !h-3 !bg-primary !rounded-full"
      />

      {renderContent(false)}

      {/* 右侧输出连接点 - 用于连接到 Generator 提供 XML */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-4 h-4 !bg-gradient-to-r !from-purple-500 !to-pink-500 !border-2 !border-white dark:!border-neutral-900 !rounded-full transition-all duration-200 hover:!scale-125 hover:!shadow-lg hover:!shadow-purple-500/50"
        title="拖拽连接到生成器提供图表 XML"
      />
    </div>
  );
};

export default memo(ChatNode);
