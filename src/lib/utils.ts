import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Cloudflare Image Resizing - 获取缩略图 URL
 * @param url 原始图片 URL
 * @param width 目标宽度（默认 400）
 * @param quality 图片质量（默认 75）
 */
export function getThumbnailUrl(url: string, width: number = 400, quality: number = 75): string {
  if (!url) return url;

  // 只处理我们自己域名的图片
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=${width},quality=${quality}${path}`;
    } catch {
      return url;
    }
  }

  return url;
}
