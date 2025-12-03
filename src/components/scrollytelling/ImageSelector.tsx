"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Plus, Loader2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageSelectorProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export default function ImageSelector({
  images,
  onImagesChange,
  maxImages = 20,
  disabled = false,
}: ImageSelectorProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上传图片到服务器
  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error("Upload error:", error);
      return null;
    }
  };

  // 处理文件选择
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0 || disabled) return;

    setUploading(true);
    const newImages: string[] = [];

    for (let i = 0; i < files.length && images.length + newImages.length < maxImages; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      const url = await uploadImage(file);
      if (url) {
        newImages.push(url);
      }
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
    setUploading(false);
  };

  // 拖拽文件
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      handleFileSelect(e.dataTransfer.files);
    },
    [disabled, images, onImagesChange]
  );

  // 删除图片
  const removeImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onImagesChange(newImages);
  };

  // 拖拽排序
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const newImages = [...images];
    const [draggedItem] = newImages.splice(dragIndex, 1);
    newImages.splice(index, 0, draggedItem);
    onImagesChange(newImages);
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="space-y-4">
      {/* 已选择的图片网格 */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((url, index) => (
            <div
              key={url}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={cn(
                "relative group aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 border-2 transition-all cursor-move",
                dragIndex === index
                  ? "border-blue-500 opacity-50"
                  : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-700"
              )}
            >
              <img
                src={url}
                alt={`图片 ${index + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />

              {/* 序号角标 */}
              <div className="absolute top-2 left-2 min-w-[24px] h-6 px-1.5 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center">
                <span className="text-xs font-bold text-white">{index + 1}</span>
              </div>

              {/* 拖拽手柄 */}
              <div className="absolute top-2 right-10 p-1 rounded-lg bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-4 h-4 text-white" />
              </div>

              {/* 删除按钮 */}
              <button
                onClick={() => removeImage(index)}
                className="absolute top-2 right-2 p-1 rounded-lg bg-red-500/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}

          {/* 添加更多按钮 */}
          {images.length < maxImages && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className={cn(
                "aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all",
                disabled || uploading
                  ? "border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 cursor-not-allowed"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-500"
              )}
            >
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Plus className="w-6 h-6" />
                  <span className="text-xs">添加图片</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* 空状态 - 上传区域 */}
      {images.length === 0 && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-12 text-center transition-all",
            dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
              : "border-neutral-300 dark:border-neutral-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled}
          />

          <div className="flex flex-col items-center gap-4">
            {uploading ? (
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <Upload className="w-8 h-8 text-purple-500" />
              </div>
            )}

            <div>
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-200 mb-1">
                {uploading ? "上传中..." : "上传图片"}
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                拖拽图片到这里，或{" "}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || uploading}
                  className="text-blue-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  点击选择
                </button>
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
                支持 JPG、PNG、WebP，最多 {maxImages} 张
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      {images.length > 0 && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          disabled={disabled}
        />
      )}

      {/* 图片数量提示 */}
      {images.length > 0 && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center">
          已选择 {images.length}/{maxImages} 张图片 · 拖拽可调整顺序
        </p>
      )}
    </div>
  );
}
