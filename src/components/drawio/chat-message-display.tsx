"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ScrollArea } from "@/components/drawio/ui/scroll-area";
import ExamplePanel from "./chat-example-panel";
import { UIMessage } from "@ai-sdk/react";
import { convertToLegalXml, replaceNodes, validateMxCellStructure } from "@/lib/drawio-utils";
import { Copy, Check, X, ChevronDown, ChevronUp, Cpu, Minus, Plus, Brain, Sparkles } from "lucide-react";
import { CodeBlock } from "./code-block";

interface EditPair {
    search: string;
    replace: string;
}

function EditDiffDisplay({ edits }: { edits: EditPair[] }) {
    return (
        <div className="space-y-3">
            {edits.map((edit, index) => (
                <div key={index} className="rounded-lg border border-border/50 overflow-hidden bg-background/50">
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            Change {index + 1}
                        </span>
                    </div>
                    <div className="divide-y divide-border/30">
                        {/* Search (old) */}
                        <div className="px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Minus className="w-3 h-3 text-red-500" />
                                <span className="text-[10px] font-medium text-red-600 uppercase tracking-wide">Remove</span>
                            </div>
                            <pre className="text-[11px] font-mono text-red-700 bg-red-50 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {edit.search}
                            </pre>
                        </div>
                        {/* Replace (new) */}
                        <div className="px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Plus className="w-3 h-3 text-green-500" />
                                <span className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Add</span>
                            </div>
                            <pre className="text-[11px] font-mono text-green-700 bg-green-50 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {edit.replace}
                            </pre>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// Thinking/Reasoning Card Component - Compact version
function ThinkingCard({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!thinking) return null;

    return (
        <div className="my-2 rounded-lg border border-purple-200/50 bg-purple-50/30 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-purple-50/50 transition-colors"
            >
                <div className="flex items-center gap-1.5">
                    {isStreaming ? (
                        <Sparkles className="w-3 h-3 text-purple-500 animate-pulse" />
                    ) : (
                        <Brain className="w-3 h-3 text-purple-500" />
                    )}
                    <span className="text-xs font-medium text-purple-600">
                        {isStreaming ? "思考中..." : "思维过程"}
                    </span>
                    {isStreaming && (
                        <div className="h-3 w-3 border-[1.5px] border-purple-400 border-t-transparent rounded-full animate-spin" />
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-purple-400" />
                ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                )}
            </button>
            {isExpanded && (
                <div className="px-3 py-2 border-t border-purple-100/50 max-h-40 overflow-y-auto">
                    <pre className="text-[10px] text-purple-700/70 whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {thinking}
                    </pre>
                </div>
            )}
        </div>
    );
}

const getMessageTextContent = (message: UIMessage): string => {
    if (!message.parts) return "";
    return message.parts
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n");
};

interface ChatMessageDisplayProps {
    messages: UIMessage[];
    error?: Error | null;
    setInput: (input: string) => void;
    setFiles: (files: File[]) => void;
    chartXML: string;
    onDisplayChart: (xml: string) => void;
}

export function ChatMessageDisplay({
    messages,
    error,
    setInput,
    setFiles,
    chartXML,
    onDisplayChart,
}: ChatMessageDisplayProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const previousXML = useRef<string>("");
    const processedToolCalls = useRef<Set<string>>(new Set());
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
        {}
    );
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [copyFailedMessageId, setCopyFailedMessageId] = useState<string | null>(null);

    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (err) {
            console.error("Failed to copy message:", err);
            setCopyFailedMessageId(messageId);
            setTimeout(() => setCopyFailedMessageId(null), 2000);
        }
    };

    const handleDisplayChart = useCallback(
        (xml: string) => {
            const currentXml = xml || "";
            const convertedXml = convertToLegalXml(currentXml);
            if (convertedXml !== previousXML.current) {
                const replacedXML = replaceNodes(chartXML, convertedXml);

                const validationError = validateMxCellStructure(replacedXML);
                if (!validationError) {
                    previousXML.current = convertedXml;
                    onDisplayChart(replacedXML);
                } else {
                    console.error("[ChatMessageDisplay] XML validation failed:", validationError);
                }
            }
        },
        [chartXML, onDisplayChart]
    );

    // Create a stable dependency key for messages that changes during streaming
    const messagesKey = JSON.stringify(
        messages.map(m => ({
            id: m.id,
            parts: m.parts?.map((p: any) => ({
                type: p.type,
                toolCallId: p.toolCallId,
                state: p.state,
                // Track XML content length for streaming updates
                inputXmlLength: p.input?.xml?.length ?? 0,
                inputEditsLength: p.input?.edits?.length ?? 0,
            }))
        }))
    );

    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messagesKey]);

    // Process tool calls and update diagram
    // Note: messagesKey captures all relevant state changes, no need for messages in deps
    useEffect(() => {
        if (!messages || messages.length === 0) return;

        messages.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part: any) => {
                    if (part.type?.startsWith("tool-")) {
                        const { toolCallId, state } = part;

                        if (state === "output-available") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }));
                        }

                        if (
                            part.type === "tool-display_diagram" &&
                            part.input?.xml
                        ) {
                            if (
                                state === "input-streaming" ||
                                state === "input-available"
                            ) {
                                handleDisplayChart(part.input.xml);
                            } else if (
                                state === "output-available" &&
                                !processedToolCalls.current.has(toolCallId)
                            ) {
                                handleDisplayChart(part.input.xml);
                                processedToolCalls.current.add(toolCallId);
                            }
                        }
                    }
                });
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messagesKey, handleDisplayChart]);

    const renderToolPart = (part: any) => {
        const callId = part.toolCallId;
        const { state, input, output } = part;
        const isExpanded = expandedTools[callId] ?? true;
        const toolName = part.type?.replace("tool-", "");

        const toggleExpanded = () => {
            setExpandedTools((prev) => ({
                ...prev,
                [callId]: !isExpanded,
            }));
        };

        const getToolDisplayName = (name: string) => {
            switch (name) {
                case "display_diagram":
                    return "生成图表";
                case "edit_diagram":
                    return "编辑图表";
                default:
                    return name;
            }
        };

        return (
            <div
                key={callId}
                className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Cpu className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground/80">
                            {getToolDisplayName(toolName)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state === "input-streaming" && (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                        {state === "output-available" && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                完成
                            </span>
                        )}
                        {state === "output-error" && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                错误
                            </span>
                        )}
                        {input && Object.keys(input).length > 0 && (
                            <button
                                onClick={toggleExpanded}
                                className="p-1 rounded hover:bg-muted transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
                {input && isExpanded && (
                    <div className="px-4 py-3 border-t border-border/40 bg-muted/20 max-h-64 overflow-y-auto">
                        {typeof input === "object" && input.xml ? (
                            <CodeBlock code={input.xml} language="xml" />
                        ) : typeof input === "object" && input.edits && Array.isArray(input.edits) ? (
                            <EditDiffDisplay edits={input.edits} />
                        ) : typeof input === "object" && Object.keys(input).length > 0 ? (
                            <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
                        ) : null}
                    </div>
                )}
                {output && state === "output-error" && (
                    <div className="px-4 py-3 border-t border-border/40 text-sm text-red-600">
                        {output}
                    </div>
                )}
            </div>
        );
    };

    return (
        <ScrollArea className="h-full px-4 scrollbar-thin">
            {messages.length === 0 ? (
                <ExamplePanel setInput={setInput} setFiles={setFiles} />
            ) : (
                <div className="py-4 space-y-4">
                    {messages.map((message, messageIndex) => {
                        const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                        return (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-message-in`}
                                style={{ animationDelay: `${messageIndex * 50}ms` }}
                            >
                                {message.role === "user" && userMessageText && (
                                    <button
                                        onClick={() => copyMessageToClipboard(message.id, userMessageText)}
                                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors self-center mr-2"
                                        title={copiedMessageId === message.id ? "Copied!" : copyFailedMessageId === message.id ? "Failed to copy" : "Copy message"}
                                    >
                                        {copiedMessageId === message.id ? (
                                            <Check className="h-3.5 w-3.5 text-green-500" />
                                        ) : copyFailedMessageId === message.id ? (
                                            <X className="h-3.5 w-3.5 text-red-500" />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                        )}
                                    </button>
                                )}
                                <div className="max-w-[85%]">
                                    {/* Reasoning/Thinking content - 思维链在最前面 */}
                                    {message.parts?.map((part: any, index: number) => {
                                        if (part.type === "reasoning") {
                                            return (
                                                <ThinkingCard
                                                    key={`reasoning-${index}`}
                                                    thinking={part.text || part.reasoning || ""}
                                                    isStreaming={false}
                                                />
                                            );
                                        }
                                        return null;
                                    })}
                                    {/* Text content in bubble - 文本在思维链之后 */}
                                    {message.parts?.some((part: any) => part.type === "text" || part.type === "file") && (
                                        <div
                                            className={`px-4 py-3 text-sm leading-relaxed ${
                                                message.role === "user"
                                                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                                                    : "bg-muted/60 text-foreground rounded-2xl rounded-bl-md"
                                            }`}
                                        >
                                            {message.parts?.map((part: any, index: number) => {
                                                switch (part.type) {
                                                    case "text":
                                                        return (
                                                            <div key={index} className="whitespace-pre-wrap break-words">
                                                                {part.text}
                                                            </div>
                                                        );
                                                    case "file":
                                                        return (
                                                            <div key={index} className="mt-2">
                                                                <Image
                                                                    src={part.url}
                                                                    width={200}
                                                                    height={200}
                                                                    alt={`Uploaded diagram or image for AI analysis`}
                                                                    className="rounded-lg border border-white/20"
                                                                    style={{
                                                                        objectFit: "contain",
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    default:
                                                        return null;
                                                }
                                            })}
                                        </div>
                                    )}
                                    {/* Tool calls outside bubble - 工具在最后 */}
                                    {message.parts?.map((part: any) => {
                                        if (part.type?.startsWith("tool-")) {
                                            return renderToolPart(part);
                                        }
                                        return null;
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {error && (
                <div className="mx-4 mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                    <span className="font-medium">Error:</span> {error.message}
                </div>
            )}
            <div ref={messagesEndRef} />
        </ScrollArea>
    );
}
