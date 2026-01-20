"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatPrice, CONSUMPTION_TYPE_LABELS } from "@/lib/pricing";
import type { ConsumptionType } from "@/lib/pricing";

interface UserProfile {
  id: string;
  username: string;
  isAdmin: boolean;
  balance: number;
  createdAt: string;
  permissions: Array<{
    modelId: string;
    modelLabel: string;
    grantedAt: string;
  }>;
  stats: {
    totalTasks: number;
    totalConsumption: number;
    consumptionCount: number;
  };
}

interface ConsumptionRecord {
  id: string;
  type: string;
  typeLabel: string;
  modelId: string;
  modelLabel: string;
  taskId: string | null;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export default function SettingsClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "consumption">("overview");

  // 获取用户信息
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/user/profile");
        const data = await res.json();
        if (data.success) {
          setProfile(data.user);
        }
      } catch (error) {
        console.error("获取用户信息失败:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // 获取消费记录
  const fetchRecords = async (page = 1) => {
    setRecordsLoading(true);
    try {
      const res = await fetch(`/api/user/consumption?page=${page}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.records);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("获取消费记录失败:", error);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "consumption" && records.length === 0) {
      fetchRecords();
    }
  }, [activeTab, records.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--muted-foreground)]">加载中...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--muted-foreground)] mb-4">获取用户信息失败</p>
          <Link href="/" className="text-[var(--primary)] hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* 头部 */}
      <header className="bg-white border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold text-[var(--primary)]">
              豆包画布
            </Link>
            <span className="text-sm text-[var(--muted-foreground)]">个人设置</span>
          </div>
          <div className="flex items-center gap-4">
            {profile.isAdmin && (
              <Link
                href="/admin"
                className="px-3 py-1.5 text-sm text-[var(--primary)] hover:bg-[var(--accent)] rounded-lg transition-colors"
              >
                管理后台
              </Link>
            )}
            <Link
              href="/"
              className="px-3 py-1.5 text-sm bg-[var(--secondary)] hover:bg-[var(--muted)] rounded-lg transition-colors"
            >
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 用户卡片 */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-2xl font-bold text-[var(--foreground)]">
                  {profile.username}
                </h1>
                {profile.isAdmin && (
                  <span className="px-2 py-0.5 text-xs bg-[var(--primary)] text-white rounded">
                    管理员
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                注册于 {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-[var(--muted-foreground)]">账户余额</div>
              <div className="text-3xl font-bold text-[var(--primary)]">
                {formatPrice(profile.balance)}
              </div>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">总任务数</div>
            <div className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {profile.stats.totalTasks}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">累计消费</div>
            <div className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {formatPrice(profile.stats.totalConsumption)}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">高级权限</div>
            <div className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {profile.permissions.length} 个
            </div>
          </div>
        </div>

        {/* 标签页 */}
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="flex border-b border-[var(--border)]">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              账户概览
            </button>
            <button
              onClick={() => setActiveTab("consumption")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "consumption"
                  ? "text-[var(--primary)] border-b-2 border-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              消费记录
            </button>
          </div>

          <div className="p-6">
            {activeTab === "overview" ? (
              <div className="space-y-6">
                {/* 模型权限 */}
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
                    已授权的高级模型
                  </h3>
                  {profile.permissions.length > 0 ? (
                    <div className="space-y-2">
                      {profile.permissions.map((perm) => (
                        <div
                          key={perm.modelId}
                          className="flex items-center justify-between p-3 bg-[var(--secondary)] rounded-lg"
                        >
                          <div>
                            <span className="font-medium text-[var(--foreground)]">
                              {perm.modelId}
                            </span>
                            <span className="ml-2 text-sm text-[var(--muted-foreground)]">
                              {perm.modelLabel}
                            </span>
                          </div>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            授权于 {new Date(perm.grantedAt).toLocaleDateString("zh-CN")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      暂无高级模型权限，您可以使用基础模型
                    </p>
                  )}
                </div>

                {/* 充值入口（预留） */}
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-3">
                    账户充值
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-3">
                    充值功能即将上线，敬请期待
                  </p>
                  <button
                    disabled
                    className="px-4 py-2 bg-[var(--muted)] text-[var(--muted-foreground)] rounded-lg cursor-not-allowed"
                  >
                    充值（即将上线）
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {recordsLoading ? (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    加载中...
                  </div>
                ) : records.length === 0 ? (
                  <div className="text-center py-8 text-[var(--muted-foreground)]">
                    暂无消费记录
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {records.map((record) => (
                        <div
                          key={record.id}
                          className="flex items-center justify-between p-3 bg-[var(--secondary)] rounded-lg"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-[var(--foreground)]">
                                {record.typeLabel}
                              </span>
                              <span className="text-xs text-[var(--muted-foreground)]">
                                {record.modelId}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)] mt-1">
                              {new Date(record.createdAt).toLocaleString("zh-CN")}
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`font-medium ${
                                record.amount > 0 ? "text-red-500" : "text-green-500"
                              }`}
                            >
                              {record.amount > 0 ? "-" : "+"}
                              {formatPrice(Math.abs(record.amount))}
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              余额: {formatPrice(record.balanceAfter)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 分页 */}
                    {pagination && pagination.totalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          onClick={() => fetchRecords(pagination.page - 1)}
                          disabled={pagination.page <= 1}
                          className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          上一页
                        </button>
                        <span className="text-sm text-[var(--muted-foreground)]">
                          {pagination.page} / {pagination.totalPages}
                        </span>
                        <button
                          onClick={() => fetchRecords(pagination.page + 1)}
                          disabled={!pagination.hasMore}
                          className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          下一页
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
