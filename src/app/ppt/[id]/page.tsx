import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileSpreadsheet, Calendar, Layers } from "lucide-react";

interface PPTPageProps {
  params: Promise<{ id: string }>;
}

export default async function PPTPage({ params }: PPTPageProps) {
  const { id } = await params;

  const ppt = await prisma.pPTTask.findUnique({
    where: { id },
    select: {
      id: true,
      topic: true,
      description: true,
      template: true,
      primaryColor: true,
      slides: true,
      pptUrl: true,
      createdAt: true,
      status: true,
    },
  });

  if (!ppt || ppt.status !== "completed" || !ppt.pptUrl) {
    notFound();
  }

  // 解析幻灯片数量
  let slideCount = 0;
  if (ppt.slides) {
    try {
      const slidesData = JSON.parse(ppt.slides);
      slideCount = Array.isArray(slidesData) ? slidesData.length : 0;
    } catch {
      // ignore
    }
  }

  // 生成 Office Online 预览链接
  const previewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(ppt.pptUrl)}`;

  // 格式化日期
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/gallery"
                className="group flex items-center gap-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span className="text-sm font-medium">返回画廊</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {/* 在新标签页打开预览 */}
              <a
                href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(ppt.pptUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                新窗口打开
              </a>

              {/* 下载按钮 */}
              <a
                href={ppt.pptUrl}
                download={`${ppt.topic}.pptx`}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                下载 PPT
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* PPT Info */}
        <div className="mb-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: ppt.primaryColor + "20" }}
            >
              <FileSpreadsheet className="w-6 h-6" style={{ color: ppt.primaryColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                {ppt.topic}
              </h1>
              {ppt.description && (
                <p className="text-neutral-600 dark:text-neutral-400 mb-3">
                  {ppt.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  {slideCount} 页幻灯片
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {formatDate(ppt.createdAt)}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: ppt.primaryColor + "20",
                    color: ppt.primaryColor,
                  }}
                >
                  {ppt.template}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview iframe */}
        <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg overflow-hidden border border-neutral-200 dark:border-neutral-800">
          <div className="aspect-[16/9] w-full">
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              allowFullScreen
              title={ppt.topic}
            />
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-900">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            <strong>提示：</strong>如果预览加载缓慢，可以点击"新窗口打开"在 Office Online 中查看完整演示效果，或直接下载 PPT 文件在本地打开。
          </p>
        </div>
      </main>
    </div>
  );
}

// 生成元数据
export async function generateMetadata({ params }: PPTPageProps) {
  const { id } = await params;

  const ppt = await prisma.pPTTask.findUnique({
    where: { id },
    select: { topic: true, description: true },
  });

  if (!ppt) {
    return { title: "PPT 未找到" };
  }

  return {
    title: `${ppt.topic} - NanoBanana PPT`,
    description: ppt.description || ppt.topic,
  };
}
