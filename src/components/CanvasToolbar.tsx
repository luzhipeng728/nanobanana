import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Save, FolderOpen, GalleryHorizontalEnd, MousePointer2, Hand,
  Trash2, LayoutGrid, Import, Share2, GalleryVerticalEnd, User as UserIcon, LogOut,
  Settings, Shield, Wallet, Scan, Sparkles, Sun, Zap, Moon, Palette,
  Plus, Pencil, Check, X, Cloud, CloudOff
} from "lucide-react";
import { useTheme, ThemeType, THEME_NAMES } from "@/contexts/ThemeContext";

// 工具栏按钮组件 - 带有精致的悬浮效果和 tooltip
interface ToolbarButtonProps {
  onClick?: () => void;
  title: string;
  variant?: "default" | "primary" | "danger" | "success" | "warning" | "purple";
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

const ToolbarButton = ({ onClick, title, variant = "default", active, children, className = "" }: ToolbarButtonProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const variantStyles = {
    default: "hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300",
    primary: "hover:bg-blue-50 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400",
    danger: "hover:bg-red-50 dark:hover:bg-red-500/20 text-red-500 dark:text-red-400",
    success: "hover:bg-emerald-50 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    warning: "hover:bg-amber-50 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400",
    purple: "hover:bg-purple-50 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400",
  };

  const activeStyles = active
    ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 dark:shadow-blue-500/40 scale-105"
    : variantStyles[variant];

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => {
          timeoutRef.current = setTimeout(() => setShowTooltip(true), 400);
        }}
        onMouseLeave={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setShowTooltip(false);
        }}
        className={`
          relative p-2.5 rounded-xl transition-all duration-300 ease-out
          ${activeStyles}
          hover:scale-110 hover:-translate-y-0.5
          active:scale-95 active:translate-y-0
          focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 focus:ring-offset-transparent
          ${className}
        `}
      >
        <span className="relative z-10">{children}</span>
        {active && (
          <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 dark:bg-neutral-800 rounded-lg shadow-xl whitespace-nowrap">
            {title}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-neutral-900 dark:bg-neutral-800 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
};

// 分隔线组件
const Divider = () => (
  <div className="w-px h-6 bg-gradient-to-b from-transparent via-neutral-300 dark:via-white/20 to-transparent mx-1" />
);

// 相对时间格式化
function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString();
}

// 主题切换器组件
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themes: { value: ThemeType; icon: React.ReactNode; label: string; description: string }[] = [
    {
      value: "light",
      icon: <Sun className="w-4 h-4" />,
      label: "Light",
      description: "明亮清新"
    },
    {
      value: "neo-cyber",
      icon: <Zap className="w-4 h-4" />,
      label: "Neo-Cyber",
      description: "赛博霓虹"
    },
    {
      value: "glass-dark",
      icon: <Moon className="w-4 h-4" />,
      label: "Glass Dark",
      description: "暗色玻璃"
    }
  ];

  const currentTheme = themes.find(t => t.value === theme) || themes[1];

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.theme-switcher-container')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative theme-switcher-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 p-2.5 rounded-xl transition-all duration-300
          hover:bg-neutral-100 dark:hover:bg-white/10
          ${isOpen ? 'bg-neutral-100 dark:bg-white/10' : ''}
        `}
        title="切换主题"
      >
        <Palette className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 right-0 w-48 origin-top-right animate-scale-in z-50"
          style={{ animationDuration: '200ms' }}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-neutral-200/50 dark:border-white/10 overflow-hidden">
            <div className="px-3 py-2 border-b border-neutral-100 dark:border-white/5">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">选择主题风格</p>
            </div>
            <div className="p-1.5">
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTheme(t.value);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                    ${theme === t.value
                      ? 'bg-gradient-to-r from-violet-500/10 to-purple-500/10 dark:from-violet-500/20 dark:to-purple-500/20'
                      : 'hover:bg-neutral-100 dark:hover:bg-white/5'
                    }
                  `}
                >
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center
                    ${theme === t.value
                      ? 'bg-gradient-to-br from-violet-500 to-purple-500 text-white'
                      : 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300'
                    }
                  `}>
                    {t.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`text-sm font-medium ${theme === t.value ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-700 dark:text-neutral-200'}`}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {t.description}
                    </p>
                  </div>
                  {theme === t.value && (
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 用户下拉菜单组件 - 点击触发，带有精致动画
function UserDropdown({ userId, username, onLogout }: { userId: string; username: string; onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{
    isAdmin: boolean;
    balance: number;
    freeBalance: number;
    paidBalance: number;
  } | null>(null);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    setUserInfo(null);

    fetch("/api/user/profile", { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isActive || !data.success) return;
        setUserInfo({
          isAdmin: data.user.isAdmin,
          balance: data.user.balance,
          freeBalance: data.user.freeBalance ?? 0,
          paidBalance: data.user.paidBalance ?? 0,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.user-dropdown-container')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative user-dropdown-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300
          hover:bg-neutral-100 dark:hover:bg-white/10
          ${isOpen ? 'bg-neutral-100 dark:bg-white/10' : ''}
        `}
      >
        <div className="relative">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-purple-500/30">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-neutral-900" />
        </div>
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 max-w-[80px] truncate hidden sm:block">
          {username}
        </span>
      </button>

      {/* User dropdown - 精致动画 */}
      {isOpen && (
        <div
          className="absolute top-full mt-3 right-0 w-56 origin-top-right animate-scale-in"
          style={{ animationDuration: '200ms' }}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl shadow-black/20 dark:shadow-black/50 border border-neutral-200/50 dark:border-white/10 overflow-hidden">
            {/* 头部渐变装饰 */}
            <div className="h-16 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 relative">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIiBjeD0iMjAiIGN5PSIyMCIgcj0iMiIvPjwvZz48L3N2Zz4=')] opacity-50" />
              <div className="absolute -bottom-6 left-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center text-white text-xl font-bold shadow-xl border-4 border-white dark:border-neutral-900">
                  {username.slice(0, 1).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="pt-10 pb-3 px-4">
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">
                {username}
              </p>
              {userInfo && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 rounded-full">
                    <Wallet className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs text-purple-700 dark:text-purple-300 font-semibold">
                      ¥{userInfo.balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {userInfo && (
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                  免费 ¥{userInfo.freeBalance.toFixed(2)} · 用户 ¥{userInfo.paidBalance.toFixed(2)}
                </div>
              )}
            </div>

            <div className="px-2 pb-2 space-y-0.5">
              <Link
                href="/settings"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5 text-sm text-neutral-700 dark:text-neutral-200 transition-colors group"
              >
                <Settings className="w-4 h-4 text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors" />
                个人设置
              </Link>

              {userInfo?.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-500/10 text-sm text-purple-600 dark:text-purple-400 transition-colors group"
                >
                  <Shield className="w-4 h-4" />
                  管理后台
                  <Sparkles className="w-3 h-3 ml-auto opacity-50" />
                </Link>
              )}

              <div className="h-px bg-neutral-200 dark:bg-white/10 my-1.5 mx-2" />

              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600 dark:text-red-400 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 画布切换器面板
function CanvasSwitcher({
  savedCanvases,
  currentCanvasId,
  currentCanvasName,
  onLoadCanvas,
  onCreateNewCanvas,
  onDeleteCanvas,
  onRenameCanvas,
  isSavingToServer,
  serverSaveStatus,
}: {
  savedCanvases: any[];
  currentCanvasId: string | null;
  currentCanvasName: string;
  onLoadCanvas: (id: string) => void;
  onCreateNewCanvas: () => void;
  onDeleteCanvas: (id: string) => void;
  onRenameCanvas: (id: string, name: string) => void;
  isSavingToServer: boolean;
  serverSaveStatus: 'saved' | 'saving' | 'idle';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.canvas-switcher-container')) {
        setIsOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      onRenameCanvas(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="relative canvas-switcher-container">
      {/* Trigger button: shows current canvas name + save status */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 p-2.5 rounded-xl transition-all duration-300
          hover:bg-neutral-100 dark:hover:bg-white/10
          ${isOpen ? 'bg-neutral-100 dark:bg-white/10' : ''}
        `}
        title="我的画布"
      >
        <FolderOpen className="w-4 h-4 text-neutral-600 dark:text-neutral-300" />
        {/* Save status indicator */}
        <div className="relative">
          {serverSaveStatus === 'saving' ? (
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" title="保存中..." />
          ) : serverSaveStatus === 'saved' ? (
            <div className="w-2 h-2 bg-emerald-500 rounded-full" title="已保存" />
          ) : null}
        </div>
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 origin-top animate-scale-in z-50"
          style={{ animationDuration: '200ms' }}
        >
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl shadow-black/20 border border-neutral-200/50 dark:border-white/10 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">我的画布</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onCreateNewCanvas();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" />
                新建
              </button>
            </div>

            {/* Canvas list */}
            <div className="max-h-64 overflow-y-auto">
              {savedCanvases.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">暂无画布</p>
                </div>
              ) : (
                savedCanvases.map((c) => {
                  const isCurrent = c.id === currentCanvasId;
                  const isEditing = editingId === c.id;

                  return (
                    <div
                      key={c.id}
                      className={`
                        group px-3 py-2.5 border-b border-neutral-100 dark:border-white/5 last:border-0 transition-colors
                        ${isCurrent
                          ? 'bg-blue-50/50 dark:bg-blue-500/10'
                          : 'hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer'
                        }
                      `}
                      onClick={() => {
                        if (!isEditing && !isCurrent) {
                          onLoadCanvas(c.id);
                          setIsOpen(false);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Current indicator */}
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrent ? 'bg-blue-500' : 'bg-transparent'}`} />

                        {/* Name / Edit input */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename();
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="flex-1 px-2 py-0.5 text-sm bg-white dark:bg-neutral-800 border border-blue-300 dark:border-blue-500/50 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-neutral-800 dark:text-neutral-100"
                              />
                              <button
                                onClick={commitRename}
                                className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 rounded transition-colors"
                              >
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1 hover:bg-neutral-200 dark:hover:bg-white/10 rounded transition-colors"
                              >
                                <X className="w-3 h-3 text-neutral-500" />
                              </button>
                            </div>
                          ) : (
                            <p className={`text-sm truncate ${isCurrent ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-neutral-700 dark:text-neutral-200'}`}>
                              {c.name}
                            </p>
                          )}
                          {!isEditing && (
                            <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                              {formatRelativeTime(c.updatedAt)}
                            </p>
                          )}
                        </div>

                        {/* Action buttons (visible on hover or if current) */}
                        {!isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => startRename(c.id, c.name)}
                              className="p-1 hover:bg-neutral-200 dark:hover:bg-white/10 rounded transition-colors"
                              title="重命名"
                            >
                              <Pencil className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                            </button>
                            {savedCanvases.length > 1 && (
                              <button
                                onClick={() => {
                                  onDeleteCanvas(c.id);
                                  if (isCurrent) setIsOpen(false);
                                }}
                                className="p-1 hover:bg-red-100 dark:hover:bg-red-500/20 rounded transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer: sync status */}
            <div className="px-3 py-2 border-t border-neutral-100 dark:border-white/5 flex items-center gap-2">
              {serverSaveStatus === 'saving' ? (
                <>
                  <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">正在同步...</span>
                </>
              ) : serverSaveStatus === 'saved' ? (
                <>
                  <Cloud className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">已同步到云端</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 text-neutral-400" />
                  <span className="text-[10px] text-neutral-400">本地缓存</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CanvasToolbarProps {
  userId: string | null;
  username: string;
  savedCanvases: any[];
  selectionMode: boolean;
  currentCanvasId: string | null;
  currentCanvasName: string;
  isSavingToServer: boolean;
  serverSaveStatus: 'saved' | 'saving' | 'idle';
  onSave: () => void;
  onLoadCanvas: (id: string) => void;
  onCreateNewCanvas: () => void;
  onDeleteCanvas: (id: string) => void;
  onRenameCanvas: (id: string, name: string) => void;
  onOpenGallery: () => void;
  onToggleSelectionMode: () => void;
  onDeleteSelected: () => void;
  onLoadExamples: () => void;
  onOpenImportModal: () => void;
  onEnterSlideshow: () => void;
  onClearCache: () => void;
  onLogout: () => void;
  onOpenAuth: () => void;
  onFitView: () => void;
}

export const CanvasToolbar = React.memo(({
  userId,
  username,
  savedCanvases,
  selectionMode,
  currentCanvasId,
  currentCanvasName,
  isSavingToServer,
  serverSaveStatus,
  onSave,
  onLoadCanvas,
  onCreateNewCanvas,
  onDeleteCanvas,
  onRenameCanvas,
  onOpenGallery,
  onToggleSelectionMode,
  onDeleteSelected,
  onLoadExamples,
  onOpenImportModal,
  onEnterSlideshow,
  onClearCache,
  onLogout,
  onOpenAuth,
  onFitView,
}: CanvasToolbarProps) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
      {/* 主工具栏容器 - 带有精致的渐变边框和玻璃效果 */}
      <div className="relative group">
        {/* 彩虹渐变边框 - 悬浮时显示 */}
        <div className="absolute -inset-[1px] bg-gradient-to-r from-rose-500 via-purple-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]" />

        {/* 内容容器 */}
        <div className="relative flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white/90 dark:bg-neutral-900/80 backdrop-blur-2xl border border-neutral-200/50 dark:border-white/10 shadow-xl shadow-black/5 dark:shadow-black/20">

          {/* 左侧：文件操作组 */}
          <div className="flex items-center gap-0.5 px-1">
            <ToolbarButton onClick={onSave} title="保存到云端" variant="default">
              <Save className="w-4 h-4" />
            </ToolbarButton>

            {/* 画布切换器 */}
            <CanvasSwitcher
              savedCanvases={savedCanvases}
              currentCanvasId={currentCanvasId}
              currentCanvasName={currentCanvasName}
              onLoadCanvas={onLoadCanvas}
              onCreateNewCanvas={onCreateNewCanvas}
              onDeleteCanvas={onDeleteCanvas}
              onRenameCanvas={onRenameCanvas}
              isSavingToServer={isSavingToServer}
              serverSaveStatus={serverSaveStatus}
            />

            <ToolbarButton onClick={onOpenGallery} title="创意画廊" variant="purple">
              <GalleryHorizontalEnd className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <Divider />

          {/* 中间：编辑工具组 */}
          <div className="flex items-center gap-0.5 px-1">
            <ToolbarButton
              onClick={onToggleSelectionMode}
              title={selectionMode ? "切换到拖拽模式" : "切换到选择模式"}
              active={selectionMode}
            >
              {selectionMode ? <MousePointer2 className="w-4 h-4" /> : <Hand className="w-4 h-4" />}
            </ToolbarButton>

            {selectionMode && (
              <ToolbarButton onClick={onDeleteSelected} title="删除选中" variant="danger">
                <Trash2 className="w-4 h-4" />
              </ToolbarButton>
            )}

            <ToolbarButton onClick={onFitView} title="适应屏幕" variant="default">
              <Scan className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <Divider />

          {/* 右侧：导入/导出组 */}
          <div className="flex items-center gap-0.5 px-1">
            <ToolbarButton onClick={onLoadExamples} title="导入示例图片" variant="primary">
              <LayoutGrid className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarButton onClick={onOpenImportModal} title="导入幻灯片" variant="warning">
              <Import className="w-4 h-4" />
            </ToolbarButton>

            <ToolbarButton onClick={onEnterSlideshow} title="发布幻灯片" variant="success">
              <Share2 className="w-4 h-4" />
            </ToolbarButton>
          </div>

          <Divider />

          {/* 画廊链接 - 特殊样式 */}
          <a
            href="/gallery"
            target="_blank"
            rel="noopener noreferrer"
            className="group/gallery relative flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all duration-300 overflow-hidden"
          >
            {/* 渐变背景 */}
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 opacity-90" />
            {/* 光效 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/gallery:translate-x-full transition-transform duration-700" />
            {/* 内容 */}
            <GalleryVerticalEnd className="w-4 h-4 text-white relative z-10" />
            <span className="text-xs font-semibold text-white relative z-10 hidden sm:inline">画廊</span>
          </a>

          <ToolbarButton onClick={onClearCache} title="清空画布" variant="danger">
            <Trash2 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          {/* 主题切换 */}
          <ThemeSwitcher />

          <Divider />

          {/* 用户区域 */}
          {userId ? (
            <UserDropdown userId={userId} username={username} onLogout={onLogout} />
          ) : (
            <ToolbarButton onClick={onOpenAuth} title="登录 / 注册" variant="default">
              <UserIcon className="w-4 h-4" />
            </ToolbarButton>
          )}
        </div>
      </div>
    </div>
  );
});

CanvasToolbar.displayName = "CanvasToolbar";
