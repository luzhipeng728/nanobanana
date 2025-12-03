"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Calendar, Loader2, ChevronRight, Search } from "lucide-react";
import PageViewCounter from "@/components/PageViewCounter";
import { cn } from "@/lib/utils";

// Cloudflare Image Resizing URL
function getCoverUrl(url: string): string {
  if (url.includes('doubao.luzhipeng.com')) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return `https://doubao.luzhipeng.com/cdn-cgi/image/format=auto,width=600,quality=85${path}`;
    } catch {
      return url;
    }
  }
  return url;
}

interface SlideItem {
  id: string;
  title: string;
  cover: string | null;
  imageCount: number;
  createdAt: string;
  needsCover?: boolean;
  videoUrl?: string | null;
}

interface GalleryClientProps {
  initialSlides: SlideItem[];
}

export default function GalleryClient({ initialSlides }: GalleryClientProps) {
  const [slides, setSlides] = useState<SlideItem[]>(initialSlides);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // 加载更多
  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/slides?page=${nextPage}&limit=20`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        setSlides((prev) => [...prev, ...data.items]);
        setPage(nextPage);
        setHasMore(nextPage < data.totalPages);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Failed to load more slides:", error);
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#000000] font-sans selection:bg-blue-500/30">
      {/* Apple Style Header - Frosted Glass */}
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-neutral-200/50 dark:border-white/10 transition-all duration-300">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-[52px]">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="group flex items-center gap-1 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                <span className="text-[13px] font-medium">Back</span>
              </Link>
              <h1 className="text-[13px] font-semibold text-neutral-900 dark:text-white opacity-80">
                Gallery
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="hidden sm:flex items-center px-3 py-1 bg-neutral-100/50 dark:bg-neutral-800/50 rounded-full border border-neutral-200/50 dark:border-white/10">
                 <Search className="w-3.5 h-3.5 text-neutral-400" />
                 <input 
                    type="text" 
                    placeholder="Search" 
                    className="bg-transparent border-none outline-none text-[12px] px-2 w-32 text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400"
                    disabled
                 />
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="pt-16 pb-12 px-6 text-center bg-white dark:bg-black border-b border-neutral-100 dark:border-neutral-900">
         <h2 className="text-4xl md:text-5xl font-semibold tracking-tight text-neutral-900 dark:text-white mb-4">
           Discover Creativity.
         </h2>
         <p className="text-lg text-neutral-500 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
           Explore stunning slideshows created by our community.<br className="hidden sm:block"/>
           From business presentations to creative storytelling.
         </p>
      </div>

      {/* Gallery Grid */}
      <main className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
        {slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-900 rounded-full flex items-center justify-center mb-6">
              <Search className="w-8 h-8 text-neutral-400" />
            </div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mb-3">
              No slides yet
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 mb-8 max-w-sm mx-auto">
              Be the first to publish a masterpiece to the gallery.
            </p>
            <Link
              href="/"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-all hover:shadow-lg hover:shadow-blue-500/30"
            >
              Create Slideshow
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
              {slides.map((slide) => (
                <Link
                  key={slide.id}
                  href={`/slides/${slide.id}`}
                  className="group flex flex-col gap-4 cursor-pointer"
                >
                  {/* Card Container */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[20px] bg-neutral-100 dark:bg-neutral-900 shadow-sm transition-all duration-500 group-hover:shadow-2xl group-hover:shadow-black/10 dark:group-hover:shadow-white/5">
                    {/* Image */}
                    {slide.cover ? (
                      <img
                        src={getCoverUrl(slide.cover)}
                        alt={slide.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      // Placeholder
                      <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
                        {slide.needsCover ? (
                          <div className="flex flex-col items-center gap-3">
                             <Loader2 className="w-6 h-6 text-neutral-400 animate-spin" />
                             <span className="text-xs font-medium text-neutral-400">Generating preview...</span>
                          </div>
                        ) : (
                          <div className="max-w-[80%]">
                             <h3 className="text-lg font-bold text-neutral-300 dark:text-neutral-700 leading-tight line-clamp-3">
                               {slide.title}
                             </h3>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Overlay Gradient - Subtle fade at bottom */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-500 group-hover:opacity-100 scale-90 group-hover:scale-100">
                       <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-md text-white border border-white/20 shadow-lg">
                          {slide.videoUrl ? (
                            <PlayCircle className="w-7 h-7 fill-white text-white" />
                          ) : (
                            <ChevronRight className="w-7 h-7 ml-0.5" />
                          )}
                       </div>
                    </div>

                    {/* Badges - Minimal */}
                    <div className="absolute top-3 right-3 flex gap-2">
                       {slide.videoUrl && (
                         <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 backdrop-blur-md rounded-md border border-white/10">
                           Video
                         </span>
                       )}
                    </div>
                  </div>

                  {/* Meta Info - Below Card (Apple Style) */}
                  <div className="space-y-1 px-1">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {slide.title}
                      </h3>
                    </div>
                    <div className="flex items-center text-[13px] text-neutral-500 dark:text-neutral-500 font-medium">
                      <span>{formatDate(slide.createdAt)}</span>
                      <span className="mx-1.5">·</span>
                      <span>{slide.imageCount} slides</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-16 pb-12">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="group inline-flex items-center gap-2 px-6 py-3 text-[13px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Show more
                      <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer Visitor Counter */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="px-3 py-1.5 bg-white/80 dark:bg-black/80 backdrop-blur-md rounded-full border border-neutral-200/50 dark:border-white/10 shadow-lg hover:shadow-xl transition-shadow">
          <PageViewCounter page="/gallery" label="views" />
        </div>
      </div>
    </div>
  );
}
