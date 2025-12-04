"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/components/drawio/ui/button";
import { Textarea } from "@/components/drawio/ui/textarea";
import { ResetWarningModal } from "@/components/drawio/reset-warning-modal";
import { SaveDialog } from "@/components/drawio/save-dialog";
import {
    Loader2,
    Send,
    Trash2,
    Image as ImageIcon,
    History,
    Download,
    Microscope,
} from "lucide-react";
import { ButtonWithTooltip } from "@/components/drawio/button-with-tooltip";
import { FilePreviewList } from "@/components/drawio/file-preview-list";
import { HistoryDialog } from "@/components/drawio/history-dialog";
import { cn } from "@/lib/utils";

// 深度研究强度类型（保留类型以兼容）
export type ReasoningEffort = 'low' | 'medium' | 'high';

interface ChatInputProps {
    input: string;
    status: "submitted" | "streaming" | "ready" | "error";
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onClearChat: () => void;
    files?: File[];
    onFileChange?: (files: File[]) => void;
    showHistory?: boolean;
    onToggleHistory?: (show: boolean) => void;
    diagramHistory?: { svg: string; xml: string }[];
    onDisplayChart?: (xml: string) => void;
    onSaveDiagram?: (filename: string) => void;
    // 深度研究相关
    enableDeepResearch?: boolean;
    onEnableDeepResearchChange?: (enabled: boolean) => void;
    reasoningEffort?: ReasoningEffort;
    onReasoningEffortChange?: (effort: ReasoningEffort) => void;
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    onClearChat,
    files = [],
    onFileChange = () => {},
    showHistory = false,
    onToggleHistory = () => {},
    diagramHistory = [],
    onDisplayChart = () => {},
    onSaveDiagram = () => {},
    enableDeepResearch = false,
    onEnableDeepResearchChange = () => {},
    reasoningEffort = 'low',
    onReasoningEffortChange = () => {},
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    const isDisabled = status === "streaming" || status === "submitted";

    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [input, adjustTextareaHeight]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            const form = e.currentTarget.closest("form");
            if (form && input.trim() && !isDisabled) {
                form.requestSubmit();
            }
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (isDisabled) return;

        const items = e.clipboardData.items;
        const imageItems = Array.from(items).filter((item) =>
            item.type.startsWith("image/")
        );

        if (imageItems.length > 0) {
            const imageFiles = await Promise.all(
                imageItems.map(async (item) => {
                    const file = item.getAsFile();
                    if (!file) return null;
                    return new File(
                        [file],
                        `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                        {
                            type: file.type,
                        }
                    );
                })
            );

            const validFiles = imageFiles.filter(
                (file): file is File => file !== null
            );
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles]);
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        onFileChange([...files, ...newFiles]);
    };

    const handleRemoveFile = (fileToRemove: File) => {
        onFileChange(files.filter((file) => file !== fileToRemove));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (isDisabled) return;

        const droppedFiles = e.dataTransfer.files;

        const imageFiles = Array.from(droppedFiles).filter((file) =>
            file.type.startsWith("image/")
        );

        if (imageFiles.length > 0) {
            onFileChange([...files, ...imageFiles]);
        }
    };

    const handleClear = () => {
        onClearChat();
        setShowClearDialog(false);
    };

    return (
        <form
            onSubmit={onSubmit}
            className={`w-full transition-all duration-200 ${
                isDragging
                    ? "ring-2 ring-primary ring-offset-2 rounded-2xl"
                    : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* File previews */}
            {files.length > 0 && (
                <div className="mb-3">
                    <FilePreviewList files={files} onRemoveFile={handleRemoveFile} />
                </div>
            )}

            {/* Input container */}
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="描述你想要的图表，或粘贴图片..."
                    disabled={isDisabled}
                    aria-label="聊天输入"
                    className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />

                {/* Action bar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                    {/* Left actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowClearDialog(true)}
                            tooltipContent="Clear conversation"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ResetWarningModal
                            open={showClearDialog}
                            onOpenChange={setShowClearDialog}
                            onClear={handleClear}
                        />

                        <HistoryDialog
                            showHistory={showHistory}
                            onToggleHistory={onToggleHistory}
                            diagramHistory={diagramHistory}
                            onDisplayChart={onDisplayChart}
                        />

                        {/* 深度研究开关 - 简化版，只有开关 */}
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onEnableDeepResearchChange(!enableDeepResearch)}
                            tooltipContent={enableDeepResearch ? "关闭深度研究" : "开启深度研究（先搜索再生成图表）"}
                            className={cn(
                                "h-8 px-2 gap-1 ml-1 text-muted-foreground",
                                enableDeepResearch && "bg-purple-100 text-purple-700 hover:bg-purple-200 hover:text-purple-800"
                            )}
                        >
                            <Microscope className="h-4 w-4" />
                            <span className="text-xs">研究</span>
                        </ButtonWithTooltip>
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggleHistory(true)}
                            disabled={isDisabled || diagramHistory.length === 0}
                            tooltipContent="Diagram history"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <History className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSaveDialog(true)}
                            disabled={isDisabled}
                            tooltipContent="Save diagram"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <Download className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <SaveDialog
                            open={showSaveDialog}
                            onOpenChange={setShowSaveDialog}
                            onSave={onSaveDiagram}
                            defaultFilename={`diagram-${new Date().toISOString().slice(0, 10)}`}
                        />

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={triggerFileInput}
                            disabled={isDisabled}
                            tooltipContent="Upload image"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*"
                            multiple
                            disabled={isDisabled}
                        />

                        <div className="w-px h-5 bg-border mx-1" />

                        <Button
                            type="submit"
                            disabled={isDisabled || !input.trim()}
                            size="sm"
                            className="h-8 px-4 rounded-xl font-medium shadow-sm"
                            aria-label={isDisabled ? "Sending..." : "Send message"}
                        >
                            {isDisabled ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-1.5" />
                                    Send
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

        </form>
    );
}
