"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  Calendar,
  Sparkles,
  User,
  Users,
  Trash2,
  Copy,
  Check,
  Plus,
} from "lucide-react";

interface GalleryImage {
  id: string;
  prompt: string;
  model: string;
  imageUrl: string;
  createdAt: string;
  userId?: string;
  username: string;
  isOwner: boolean;
}

interface GalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onImageClick?: (imageUrl: string, prompt: string) => void;
}

export default function Gallery({ isOpen, onClose, onImageClick }: GalleryProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [myOnly, setMyOnly] = useState(false);  // 只看自己的
  const [deletingId, setDeletingId] = useState<string | null>(null);  // 正在删除的图片 ID
  const [copied, setCopied] = useState(false);  // 复制提示词状态

  // 复制提示词
  const handleCopyPrompt = useCallback(async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  // 添加到画布
  const handleAddToCanvas = useCallback((image: GalleryImage) => {
    if (onImageClick) {
      onImageClick(image.imageUrl, image.prompt);
      setSelectedImage(null);
      onClose();
    }
  }, [onImageClick, onClose]);

  const fetchImages = useCallback(async (pageNum: number, onlyMine: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery?page=${pageNum}&limit=20${onlyMine ? '&my=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        setImages(data.data.images);
        setTotalPages(data.data.pagination.totalPages);
        setTotal(data.data.pagination.total);
      }
    } catch (error) {
      console.error("Failed to fetch gallery:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchImages(page, myOnly);
    }
  }, [isOpen, page, myOnly, fetchImages]);

  // 切换筛选时重置页码
  const toggleMyOnly = () => {
    setMyOnly(!myOnly);
    setPage(1);
  };

  // 软删除图片
  const handleDelete = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这张图片吗？删除后将从画廊中移除。")) {
      return;
    }

    setDeletingId(imageId);
    try {
      const res = await fetch("/api/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: imageId }),
      });
      const data = await res.json();

      if (data.success) {
        // 从列表中移除该图片
        setImages((prev) => prev.filter((img) => img.id !== imageId));
        setTotal((prev) => prev - 1);
        // 如果删除的是当前选中的图片，关闭详情
        if (selectedImage?.id === imageId) {
          setSelectedImage(null);
        }
      } else {
        alert(data.error || "删除失败");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedImage) {
          setSelectedImage(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, selectedImage]);

  const handleDownload = (imageUrl: string, prompt: string) => {
    const fileName = `nanobanana-${prompt.slice(0, 30).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.png`;
    // 使用服务端 API 下载，绕过 CORS
    const downloadUrl = `/api/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(fileName)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getModelLabel = (model: string) => {
    if (model.includes("pro")) return "Pro";
    return "Fast";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-7xl h-[90vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-gradient-to-r from-purple-50 via-pink-50 to-blue-50 dark:from-purple-950/30 dark:via-pink-950/20 dark:to-blue-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                {myOnly ? "我的作品" : "创意画廊"}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                共 {total} 张作品
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 筛选切换 */}
            <button
              onClick={toggleMyOnly}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                myOnly
                  ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {myOnly ? (
                <>
                  <User className="w-4 h-4" />
                  我的作品
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  所有作品
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                <span className="text-sm text-neutral-500">加载中...</span>
              </div>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400">
              <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg">{myOnly ? "你还没有创作任何作品" : "还没有任何作品"}</p>
              <p className="text-sm">开始创作你的第一张图片吧！</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20 hover:scale-[1.02]"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.imageUrl}
                    alt={image.prompt}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                  />

                  {/* Owner badge */}
                  {image.isOwner && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-purple-500/90 text-white text-[10px] font-medium">
                      我的
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-xs line-clamp-2 mb-2">
                        {image.prompt}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/80 text-white">
                            {getModelLabel(image.model)}
                          </span>
                          <span className="text-[10px] text-white/70 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {image.username}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/70 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(image.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 删除按钮 - 仅对自己的作品显示 */}
                    {image.isOwner && (
                      <button
                        onClick={(e) => handleDelete(image.id, e)}
                        disabled={deletingId === image.id}
                        className="p-1.5 rounded-lg bg-red-500/90 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
                        title="删除"
                      >
                        {deletingId === image.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(image.imageUrl, image.prompt);
                      }}
                      className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-neutral-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedImage(image);
                      }}
                      className="p-1.5 rounded-lg bg-white/90 hover:bg-white text-neutral-700 transition-colors"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              上一页
            </button>
            <span className="text-sm text-neutral-500">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一页
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Image Detail Modal - 左右布局 */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 md:p-8"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative w-full max-w-6xl h-[90vh] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 左侧：图片 */}
            <div className="flex-1 flex items-center justify-center bg-black p-4 md:p-8 min-h-[40vh] md:min-h-0">
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.prompt}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* 右侧：信息面板 */}
            <div className="w-full md:w-[400px] flex flex-col bg-neutral-900 border-t md:border-t-0 md:border-l border-neutral-800">
              {/* 头部信息 */}
              <div className="p-4 border-b border-neutral-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-3 py-1 rounded-full bg-purple-500/80 text-white flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {getModelLabel(selectedImage.model)}
                    </span>
                    {selectedImage.isOwner && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-500/80 text-white">
                        我的
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {selectedImage.username}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(selectedImage.createdAt)}
                  </span>
                </div>
              </div>

              {/* 提示词区域 */}
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-neutral-300">提示词</h3>
                  <button
                    onClick={() => handleCopyPrompt(selectedImage.prompt)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-400" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        复制
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700">
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words leading-relaxed">
                    {selectedImage.prompt}
                  </p>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="p-4 border-t border-neutral-800 space-y-2">
                {onImageClick && (
                  <button
                    onClick={() => handleAddToCanvas(selectedImage)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    添加到画布
                  </button>
                )}
                <button
                  onClick={() => handleDownload(selectedImage.imageUrl, selectedImage.prompt)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载图片
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
