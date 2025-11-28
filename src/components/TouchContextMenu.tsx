"use client";

import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import { Trash2, Link, X, Copy } from "lucide-react";

// 菜单选项类型
export interface ContextMenuOption {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

// 菜单状态
interface MenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  nodeId: string | null;
  options: ContextMenuOption[];
}

// 连线模式状态
interface ConnectModeState {
  isActive: boolean;
  sourceNodeId: string | null;
}

// Context 类型
interface TouchContextMenuContextType {
  // 菜单控制
  showMenu: (position: { x: number; y: number }, nodeId: string, options: ContextMenuOption[]) => void;
  hideMenu: () => void;
  menuState: MenuState;

  // 连线模式
  connectMode: ConnectModeState;
  startConnectMode: (sourceNodeId: string) => void;
  cancelConnectMode: () => void;
  completeConnection: (targetNodeId: string) => void;
  onConnectionComplete?: (sourceId: string, targetId: string) => void;
  setOnConnectionComplete: (callback: (sourceId: string, targetId: string) => void) => void;
}

const TouchContextMenuContext = createContext<TouchContextMenuContextType | null>(null);

export function useTouchContextMenu() {
  const context = useContext(TouchContextMenuContext);
  if (!context) {
    throw new Error("useTouchContextMenu must be used within TouchContextMenuProvider");
  }
  return context;
}

interface ProviderProps {
  children: ReactNode;
}

export function TouchContextMenuProvider({ children }: ProviderProps) {
  // 菜单状态
  const [menuState, setMenuState] = useState<MenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    nodeId: null,
    options: [],
  });

  // 连线模式状态
  const [connectMode, setConnectMode] = useState<ConnectModeState>({
    isActive: false,
    sourceNodeId: null,
  });

  // 连线完成回调
  const [onConnectionComplete, setOnConnectionCompleteState] = useState<
    ((sourceId: string, targetId: string) => void) | undefined
  >(undefined);

  const showMenu = useCallback(
    (position: { x: number; y: number }, nodeId: string, options: ContextMenuOption[]) => {
      setMenuState({
        isOpen: true,
        position,
        nodeId,
        options,
      });
    },
    []
  );

  const hideMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const startConnectMode = useCallback((sourceNodeId: string) => {
    setConnectMode({
      isActive: true,
      sourceNodeId,
    });
    hideMenu();
  }, [hideMenu]);

  const cancelConnectMode = useCallback(() => {
    setConnectMode({
      isActive: false,
      sourceNodeId: null,
    });
  }, []);

  const completeConnection = useCallback(
    (targetNodeId: string) => {
      if (connectMode.sourceNodeId && onConnectionComplete) {
        onConnectionComplete(connectMode.sourceNodeId, targetNodeId);
      }
      cancelConnectMode();
    },
    [connectMode.sourceNodeId, onConnectionComplete, cancelConnectMode]
  );

  const setOnConnectionComplete = useCallback(
    (callback: (sourceId: string, targetId: string) => void) => {
      setOnConnectionCompleteState(() => callback);
    },
    []
  );

  return (
    <TouchContextMenuContext.Provider
      value={{
        showMenu,
        hideMenu,
        menuState,
        connectMode,
        startConnectMode,
        cancelConnectMode,
        completeConnection,
        onConnectionComplete,
        setOnConnectionComplete,
      }}
    >
      {children}

      {/* 菜单 UI */}
      <TouchContextMenuUI />

      {/* 连线模式提示 */}
      <ConnectModeOverlay />
    </TouchContextMenuContext.Provider>
  );
}

// 菜单 UI 组件
function TouchContextMenuUI() {
  const { menuState, hideMenu } = useTouchContextMenu();

  if (!menuState.isOpen) return null;

  // 计算菜单位置，确保不超出屏幕
  const menuWidth = 180;
  const menuHeight = menuState.options.length * 48 + 16;

  let x = menuState.position.x;
  let y = menuState.position.y;

  // 右边界检查
  if (x + menuWidth > window.innerWidth - 16) {
    x = window.innerWidth - menuWidth - 16;
  }
  // 下边界检查
  if (y + menuHeight > window.innerHeight - 16) {
    y = menuState.position.y - menuHeight - 10;
  }

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 z-[9999]"
        onClick={hideMenu}
        onTouchStart={hideMenu}
      />

      {/* 菜单 */}
      <div
        className="fixed z-[10000] bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden animate-scale-in"
        style={{
          left: x,
          top: y,
          minWidth: menuWidth,
        }}
      >
        <div className="py-2">
          {menuState.options.map((option) => (
            <button
              key={option.id}
              onClick={() => {
                option.onClick();
                hideMenu();
              }}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                option.danger
                  ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              }`}
            >
              <span className="w-5 h-5">{option.icon}</span>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// 连线模式提示覆盖层
function ConnectModeOverlay() {
  const { connectMode, cancelConnectMode } = useTouchContextMenu();

  if (!connectMode.isActive) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg animate-slide-up">
      <Link className="w-4 h-4" />
      <span className="text-sm font-medium">请点击目标节点完成连线</span>
      <button
        onClick={cancelConnectMode}
        className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// 导出默认菜单选项生成器
export function createNodeMenuOptions(
  nodeId: string,
  callbacks: {
    onDelete?: () => void;
    onConnect?: () => void;
    onCopy?: () => void;
  }
): ContextMenuOption[] {
  const options: ContextMenuOption[] = [];

  if (callbacks.onConnect) {
    options.push({
      id: "connect",
      label: "连接到...",
      icon: <Link className="w-5 h-5" />,
      onClick: callbacks.onConnect,
    });
  }

  if (callbacks.onCopy) {
    options.push({
      id: "copy",
      label: "复制",
      icon: <Copy className="w-5 h-5" />,
      onClick: callbacks.onCopy,
    });
  }

  if (callbacks.onDelete) {
    options.push({
      id: "delete",
      label: "删除",
      icon: <Trash2 className="w-5 h-5" />,
      onClick: callbacks.onDelete,
      danger: true,
    });
  }

  return options;
}
