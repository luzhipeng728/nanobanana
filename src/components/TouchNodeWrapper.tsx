"use client";

import { ReactNode, useRef, useCallback } from "react";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { useTouchContextMenu, createNodeMenuOptions } from "./TouchContextMenu";

interface TouchNodeWrapperProps {
  nodeId: string;
  children: ReactNode;
  onDelete?: () => void;
  className?: string;
}

/**
 * 为节点添加触摸长按支持的包装组件
 * 仅在触摸设备上启用长按菜单
 */
export function TouchNodeWrapper({
  nodeId,
  children,
  onDelete,
  className = "",
}: TouchNodeWrapperProps) {
  const isTouchDevice = useIsTouchDevice();
  const { showMenu, connectMode, completeConnection, startConnectMode } = useTouchContextMenu();

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // 如果在连线模式，点击即完成连接
      if (connectMode.isActive) {
        e.preventDefault();
        e.stopPropagation();
        completeConnection(nodeId);
        return;
      }

      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      isLongPress.current = false;

      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;

        // 震动反馈（如果支持）
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        // 显示菜单
        const options = createNodeMenuOptions(nodeId, {
          onDelete,
          onConnect: () => startConnectMode(nodeId),
        });

        showMenu(
          { x: touch.clientX, y: touch.clientY },
          nodeId,
          options
        );
      }, 500);
    },
    [nodeId, onDelete, showMenu, connectMode, completeConnection, startConnectMode]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current || !longPressTimer.current) return;

    const touch = e.touches[0];
    const distance = Math.sqrt(
      Math.pow(touch.clientX - startPos.current.x, 2) +
        Math.pow(touch.clientY - startPos.current.y, 2)
    );

    // 移动超过 10px 取消长按
    if (distance > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // 如果是长按触发的，阻止后续事件
    if (isLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
    }

    startPos.current = null;
  }, []);

  // 非触摸设备直接渲染子元素
  if (!isTouchDevice) {
    return <>{children}</>;
  }

  return (
    <div
      className={`touch-node-wrapper ${className} ${
        connectMode.isActive ? "ring-2 ring-blue-400 ring-offset-2 rounded-2xl" : ""
      }`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
