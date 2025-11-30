"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

interface PageViewCounterProps {
  page: string;
  className?: string;
  showIcon?: boolean;
  label?: string;
}

export default function PageViewCounter({
  page,
  className = "",
  showIcon = true,
  label = "访问",
}: PageViewCounterProps) {
  const [count, setCount] = useState<number | null>(null);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    // 记录访问并获取计数
    const recordView = async () => {
      if (recorded) return;

      try {
        const res = await fetch("/api/page-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page }),
        });

        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
          setRecorded(true);
        }
      } catch (error) {
        console.error("Failed to record page view:", error);
      }
    };

    recordView();
  }, [page, recorded]);

  if (count === null) {
    return null; // 加载中不显示
  }

  // 格式化数字：超过1000显示为 1.2k
  const formatCount = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <div
      className={`flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 ${className}`}
    >
      {showIcon && <Eye className="w-3.5 h-3.5" />}
      <span>
        {formatCount(count)} {label}
      </span>
    </div>
  );
}
