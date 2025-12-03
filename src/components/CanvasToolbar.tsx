import React, { useState } from "react";
import { 
  Save, FolderOpen, GalleryHorizontalEnd, MousePointer2, Hand, 
  Trash2, LayoutGrid, Import, Share2, GalleryVerticalEnd, User as UserIcon, LogOut 
} from "lucide-react";

interface CanvasToolbarProps {
  userId: string | null;
  username: string;
  savedCanvases: any[];
  selectionMode: boolean;
  onSave: () => void;
  onLoadCanvas: (id: string) => void;
  onOpenGallery: () => void;
  onToggleSelectionMode: () => void;
  onDeleteSelected: () => void;
  onLoadExamples: () => void;
  onOpenImportModal: () => void;
  onEnterSlideshow: () => void;
  onClearCache: () => void;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export const CanvasToolbar = React.memo(({
  userId,
  username,
  savedCanvases,
  selectionMode,
  onSave,
  onLoadCanvas,
  onOpenGallery,
  onToggleSelectionMode,
  onDeleteSelected,
  onLoadExamples,
  onOpenImportModal,
  onEnterSlideshow,
  onClearCache,
  onLogout,
  onOpenAuth,
}: CanvasToolbarProps) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 p-2 rounded-full bg-white/80 dark:bg-neutral-900/60 backdrop-blur-xl border border-neutral-200/50 dark:border-white/10 shadow-xl shadow-black/5 transition-all hover:shadow-2xl">
      <button
        onClick={onSave}
        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors group relative"
        title="Save Canvas to Cloud"
      >
        <Save className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
        {/* Tooltip implementation could go here */}
      </button>

      <div className="relative group">
        <button className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
          <FolderOpen className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
        </button>
        {/* Dropdown for history - Glass style */}
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/20 dark:border-white/10 hidden group-hover:block max-h-60 overflow-y-auto z-20 animate-fade-in">
          {savedCanvases.length === 0 ? (
            <div className="p-3 text-xs text-neutral-500 dark:text-neutral-400 text-center">No saved canvases</div>
          ) : (
            savedCanvases.map(c => (
              <div
                key={c.id}
                onClick={() => onLoadCanvas(c.id)}
                className="p-2.5 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-xs truncate border-b border-neutral-100 dark:border-white/5 last:border-0 text-neutral-700 dark:text-neutral-200"
              >
                {c.name}
              </div>
            ))
          )}
        </div>
      </div>

      <button
        onClick={onOpenGallery}
        className="p-2 rounded-full hover:bg-purple-500/10 transition-colors text-purple-600 dark:text-purple-400"
        title="创意画廊"
      >
        <GalleryHorizontalEnd className="w-5 h-5" />
      </button>

      <button
        onClick={onToggleSelectionMode}
        className={`p-2 rounded-full transition-colors ${
          selectionMode
            ? "bg-blue-500 text-white shadow-md shadow-blue-500/30"
            : "hover:bg-black/5 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200"
        }`}
        title={selectionMode ? "当前：选择模式（点击切换到手掌模式）" : "当前：手掌模式（点击切换到选择模式）"}
      >
        {selectionMode ? (
          <MousePointer2 className="w-5 h-5" />
        ) : (
          <Hand className="w-5 h-5" />
        )}
      </button>

      {selectionMode && (
        <button
          onClick={onDeleteSelected}
          className="p-2 rounded-full hover:bg-red-500/10 transition-colors text-red-600 dark:text-red-400"
          title="删除选中节点"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      )}

      <div className="w-px bg-neutral-200 dark:bg-white/10 my-1 mx-1" />

      <button
        onClick={onLoadExamples}
        className="p-2 rounded-full hover:bg-blue-500/10 transition-colors text-blue-600 dark:text-blue-400"
        title="导入示例图片 (27张)"
      >
        <LayoutGrid className="w-5 h-5" />
      </button>

      <button
        onClick={onOpenImportModal}
        className="p-2 rounded-full hover:bg-orange-500/10 transition-colors text-orange-600 dark:text-orange-400"
        title="导入幻灯片素材"
      >
        <Import className="w-5 h-5" />
      </button>

      <button
        onClick={onEnterSlideshow}
        className="p-2 rounded-full hover:bg-green-500/10 transition-colors text-green-600 dark:text-green-400"
        title="发布幻灯片"
      >
        <Share2 className="w-5 h-5" />
      </button>

      <a
        href="/gallery"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-purple-500/30 text-white mx-1"
        title="查看作品画廊"
      >
        <GalleryVerticalEnd className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline">画廊</span>
      </a>

      <button
        onClick={onClearCache}
        className="p-2 rounded-full hover:bg-red-500/10 transition-colors text-red-600 dark:text-red-400"
        title="清空画布"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="w-px bg-neutral-200 dark:bg-white/10 my-1 mx-1" />

      {userId ? (
        <div className="relative group">
          <button className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
               {username.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200 max-w-[80px] truncate">{username}</span>
          </button>
          {/* User dropdown */}
          <div className="absolute top-full mt-2 right-0 w-48 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-xl shadow-xl border border-white/20 dark:border-white/10 hidden group-hover:block z-20 animate-fade-in">
            <div className="p-3 border-b border-neutral-100 dark:border-white/10">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Logged in as</p>
              <p className="text-sm font-medium truncate text-neutral-800 dark:text-neutral-100">{username}</p>
            </div>
            <button
              onClick={onLogout}
              className="w-full p-3 hover:bg-red-500/10 text-left text-sm flex items-center gap-2 text-red-600 dark:text-red-400 rounded-b-xl transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onOpenAuth}
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Login"
        >
          <UserIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
        </button>
      )}
    </div>
  );
});

CanvasToolbar.displayName = "CanvasToolbar";
