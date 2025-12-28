"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toolItems, videoToolItem, uploadToolItem, type NodeType } from "./NodeToolbar";
import { Image } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface ContextMenuPosition {
  x: number;
  y: number;
  flowX: number;  // ReactFlow 坐标
  flowY: number;
}

interface CanvasContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onSelectTool: (nodeType: NodeType, position: { x: number; y: number }) => void;
  onUploadImage: (position: { x: number; y: number }) => void;
  videoUnlocked?: boolean;
}

export default function CanvasContextMenu({
  position,
  onClose,
  onSelectTool,
  onUploadImage,
  videoUnlocked = false,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);
  const { theme } = useTheme();

  // Theme helpers
  const isLight = theme === 'light';
  const isNeoCyber = theme === 'neo-cyber';
  const isGlassDark = theme === 'glass-dark';

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (position) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  // 调整菜单位置，确保不超出屏幕
  useEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPosition(null);
      return;
    }

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const padding = 8; // 边缘留白

    let x = position.x;
    let y = position.y;

    // 检查右边界
    if (x + rect.width > window.innerWidth - padding) {
      x = window.innerWidth - rect.width - padding;
    }

    // 检查下边界
    if (y + rect.height > window.innerHeight - padding) {
      y = window.innerHeight - rect.height - padding;
    }

    // 确保不小于 0
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setAdjustedPosition({ x, y });
  }, [position]);

  if (!position) return null;

  // 构建显示的工具列表
  const items = videoUnlocked
    ? [...toolItems.slice(0, 4), videoToolItem, ...toolItems.slice(4)]
    : toolItems;

  // 使用调整后的位置，如果还没计算出来则用原始位置
  const finalPosition = adjustedPosition || { x: position.x, y: position.y };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: finalPosition.x,
    top: finalPosition.y,
    zIndex: 1000,
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className={cn(
        "min-w-[180px] max-w-[220px]",
        "backdrop-blur-xl",
        "rounded-xl py-2 px-1",
        "animate-in fade-in zoom-in-95 duration-150",
        isLight && "bg-white/95 border border-neutral-200/60 shadow-xl",
        isNeoCyber && "bg-[#0a0a12]/95 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,245,255,0.2)]",
        isGlassDark && "bg-[#1a1a1a]/95 border border-white/10 shadow-2xl"
      )}
    >
      {/* Neo-Cyber 顶部装饰 */}
      {isNeoCyber && (
        <div className="absolute top-0 left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
      )}

      {/* 标题 */}
      <div className={cn(
        "px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase",
        isLight ? "text-neutral-400" : isNeoCyber ? "text-cyan-400/60 font-cyber" : "text-white/40"
      )}>
        {isNeoCyber ? "ADD NODE" : "添加节点"}
      </div>

      {/* 工具列表 */}
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.type}
            onClick={() => {
              onSelectTool(item.type, { x: position.flowX, y: position.flowY });
              onClose();
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
              "text-left text-sm",
              "transition-colors duration-150",
              "group",
              isLight && "text-neutral-700 hover:bg-neutral-100",
              isNeoCyber && "text-white/90 hover:bg-cyan-500/10",
              isGlassDark && "text-white/90 hover:bg-white/10"
            )}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
              style={{
                background: `linear-gradient(135deg, ${item.accentColor}20, ${item.accentColor}10)`,
                boxShadow: isNeoCyber
                  ? `inset 0 0 0 1px ${item.accentColor}30, 0 0 8px ${item.accentColor}20`
                  : `inset 0 0 0 1px ${item.accentColor}30`,
              }}
            >
              <item.icon
                className="w-3.5 h-3.5"
                style={{ color: item.accentColor }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate">{item.title}</p>
              <p className={cn(
                "text-[10px] truncate",
                isLight ? "text-neutral-400" : "text-white/50"
              )}>
                {item.description}
              </p>
            </div>
          </button>
        ))}

        {/* 分隔线 */}
        <div className={cn(
          "my-1.5 mx-2 h-px",
          isLight ? "bg-neutral-200/60" : isNeoCyber ? "bg-cyan-500/20" : "bg-white/10"
        )} />

        {/* 上传图片 */}
        <button
          onClick={() => {
            onUploadImage({ x: position.flowX, y: position.flowY });
            onClose();
          }}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg",
            "text-left text-sm",
            "transition-colors duration-150",
            "group",
            isLight && "text-neutral-700 hover:bg-neutral-100",
            isNeoCyber && "text-white/90 hover:bg-cyan-500/10",
            isGlassDark && "text-white/90 hover:bg-white/10"
          )}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${uploadToolItem.accentColor}20, ${uploadToolItem.accentColor}10)`,
              boxShadow: isNeoCyber
                ? `inset 0 0 0 1px ${uploadToolItem.accentColor}30, 0 0 8px ${uploadToolItem.accentColor}20`
                : `inset 0 0 0 1px ${uploadToolItem.accentColor}30`,
            }}
          >
            <Image
              className="w-3.5 h-3.5"
              style={{ color: uploadToolItem.accentColor }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate">{uploadToolItem.title}</p>
            <p className={cn(
              "text-[10px] truncate",
              isLight ? "text-neutral-400" : "text-white/50"
            )}>
              {uploadToolItem.description}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
