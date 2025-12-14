"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PREMIUM_MODELS, IMAGE_MODELS } from "@/lib/image-generation/types";
import { IMAGE_MODEL_PRICING, formatPrice, CONSUMPTION_TYPE_LABELS } from "@/lib/pricing";
import type { ConsumptionType } from "@/lib/pricing";
import { X, Wallet, Calendar, Image, ChevronLeft, ChevronRight } from "lucide-react";

interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  balance: number;
  createdAt: string;
  permissions: string[];
  taskCount: number;
  consumptionCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ConsumptionRecord {
  id: string;
  type: string;
  modelId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
  imageUrl: string | null;
  prompt: string | null;
}

interface UserDetail {
  user: User;
  consumption: {
    records: ConsumptionRecord[];
    total: number;
    totalAmount: number;
  };
}

// 图片预览弹窗
function ImagePreviewModal({
  imageUrl,
  prompt,
  onClose,
}: {
  imageUrl: string;
  prompt: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={imageUrl}
          alt="Generated image"
          className="max-w-full max-h-[80vh] object-contain"
        />
        {prompt && (
          <div className="p-4 bg-white border-t">
            <p className="text-sm text-[var(--muted-foreground)]">Prompt:</p>
            <p className="text-sm text-[var(--foreground)] mt-1">{prompt}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 用户详情弹窗组件
function UserDetailModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [previewImage, setPreviewImage] = useState<{ url: string; prompt: string | null } | null>(null);

  const fetchDetail = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}?page=${pageNum}&limit=10`);
      const data = await res.json();
      if (data.success) {
        setDetail(data);
        setTotalPages(Math.ceil(data.consumption.total / 10) || 1);
      }
    } catch (error) {
      console.error("获取用户详情失败:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDetail(page);
  }, [fetchDetail, page]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]">用户详情</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--secondary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {loading && !detail ? (
          <div className="p-8 text-center text-[var(--muted-foreground)]">加载中...</div>
        ) : detail ? (
          <div className="overflow-y-auto max-h-[calc(90vh-60px)]">
            {/* 用户基本信息 */}
            <div className="p-6 border-b border-[var(--border)]">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                  {detail.user.username.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-[var(--foreground)]">
                      {detail.user.username}
                    </h3>
                    {detail.user.isAdmin && (
                      <span className="px-2 py-0.5 text-xs bg-[var(--primary)] text-white rounded">
                        管理员
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    ID: {detail.user.id}
                  </p>
                </div>
              </div>

              {/* 统计卡片 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[var(--secondary)] rounded-lg p-3">
                  <div className="flex items-center gap-2 text-[var(--muted-foreground)] text-xs mb-1">
                    <Wallet className="w-3 h-3" />
                    当前余额
                  </div>
                  <div className="text-lg font-bold text-[var(--primary)]">
                    {formatPrice(detail.user.balance)}
                  </div>
                </div>
                <div className="bg-[var(--secondary)] rounded-lg p-3">
                  <div className="flex items-center gap-2 text-[var(--muted-foreground)] text-xs mb-1">
                    <Image className="w-3 h-3" />
                    累计消费
                  </div>
                  <div className="text-lg font-bold text-[var(--foreground)]">
                    {formatPrice(detail.consumption.totalAmount)}
                  </div>
                </div>
                <div className="bg-[var(--secondary)] rounded-lg p-3">
                  <div className="flex items-center gap-2 text-[var(--muted-foreground)] text-xs mb-1">
                    <Calendar className="w-3 h-3" />
                    注册时间
                  </div>
                  <div className="text-sm font-medium text-[var(--foreground)]">
                    {new Date(detail.user.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
              </div>

              {/* 权限列表 */}
              <div className="mt-4">
                <div className="text-sm font-medium text-[var(--foreground)] mb-2">高级模型权限</div>
                <div className="flex flex-wrap gap-2">
                  {PREMIUM_MODELS.map((modelId) => {
                    const hasPermission = detail.user.permissions.includes(modelId);
                    return (
                      <span
                        key={modelId}
                        className={`px-2 py-1 text-xs rounded ${
                          hasPermission
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {IMAGE_MODELS[modelId as keyof typeof IMAGE_MODELS]?.label || modelId}
                        {hasPermission ? " ✓" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 消费记录 */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-[var(--foreground)]">
                  消费记录 ({detail.consumption.total} 条)
                </h4>
              </div>

              {detail.consumption.records.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)]">
                  暂无消费记录
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {detail.consumption.records.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-3 p-3 bg-[var(--secondary)] rounded-lg"
                      >
                        {/* 图片缩略图 */}
                        {record.imageUrl ? (
                          <div
                            className="w-12 h-12 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 border border-[var(--border)]"
                            onClick={() => setPreviewImage({ url: record.imageUrl!, prompt: record.prompt })}
                          >
                            <img
                              src={record.imageUrl}
                              alt="Generated"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-[var(--muted)] flex items-center justify-center flex-shrink-0">
                            <Image className="w-5 h-5 text-[var(--muted-foreground)]" />
                          </div>
                        )}

                        {/* 消费信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--foreground)]">
                              {CONSUMPTION_TYPE_LABELS[record.type as ConsumptionType] || record.type}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {record.modelId}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)] mt-1">
                            {new Date(record.createdAt).toLocaleString("zh-CN")}
                          </div>
                          {record.prompt && (
                            <div className="text-xs text-[var(--muted-foreground)] mt-1 truncate">
                              {record.prompt.substring(0, 60)}...
                            </div>
                          )}
                        </div>

                        {/* 金额 */}
                        <div className="text-right flex-shrink-0">
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
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-sm text-[var(--muted-foreground)]">
                        {page} / {totalPages}
                      </span>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-red-500">获取用户详情失败</div>
        )}
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage.url}
          prompt={previewImage.prompt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

export default function AdminClient({ currentUser }: { currentUser: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // 获取用户列表
  const fetchUsers = useCallback(async (page = 1, searchTerm = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(searchTerm && { search: searchTerm }),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("获取用户列表失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 添加权限
  const addPermission = async (userId: string, modelId: string) => {
    setActionLoading(`add-${userId}-${modelId}`);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, modelId }),
      });
      const data = await res.json();
      if (data.success) {
        // 刷新用户列表
        fetchUsers(pagination.page, search);
      } else {
        alert(data.error || "添加权限失败");
      }
    } catch (error) {
      console.error("添加权限失败:", error);
      alert("添加权限失败");
    } finally {
      setActionLoading(null);
    }
  };

  // 删除权限
  const removePermission = async (userId: string, modelId: string) => {
    if (!confirm(`确定要移除该用户的 ${modelId} 权限吗？`)) return;

    setActionLoading(`remove-${userId}-${modelId}`);
    try {
      const params = new URLSearchParams({ userId, modelId });
      const res = await fetch(`/api/admin/permissions?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers(pagination.page, search);
      } else {
        alert(data.error || "删除权限失败");
      }
    } catch (error) {
      console.error("删除权限失败:", error);
      alert("删除权限失败");
    } finally {
      setActionLoading(null);
    }
  };

  // 搜索
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, search);
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* 头部 */}
      <header className="bg-white border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-bold text-[var(--primary)]">
              NanoBanana
            </Link>
            <span className="text-sm text-[var(--muted-foreground)]">管理后台</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--foreground)]">
              管理员: {currentUser}
            </span>
            <Link
              href="/"
              className="px-3 py-1.5 text-sm bg-[var(--secondary)] hover:bg-[var(--muted)] rounded-lg transition-colors"
            >
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">总用户数</div>
            <div className="text-3xl font-bold text-[var(--foreground)] mt-1">
              {pagination.total}
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">高级模型</div>
            <div className="text-3xl font-bold text-[var(--primary)] mt-1">
              {PREMIUM_MODELS.length}
            </div>
          </div>
          <div className="bg-white rounded-xl p-6 border border-[var(--border)]">
            <div className="text-sm text-[var(--muted-foreground)]">模型价格</div>
            <div className="text-sm text-[var(--foreground)] mt-2 space-y-1">
              {Object.entries(IMAGE_MODEL_PRICING).map(([id, pricing]) => (
                <div key={id} className="flex justify-between">
                  <span>{IMAGE_MODELS[id as keyof typeof IMAGE_MODELS]?.label || id}</span>
                  <span className="text-[var(--primary)]">{formatPrice(pricing.price)}/{pricing.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 搜索栏 */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索用户名..."
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              搜索
            </button>
          </div>
        </form>

        {/* 用户表格 */}
        <div className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    用户名
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    余额
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    任务数
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    高级模型权限
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    注册时间
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                      加载中...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted-foreground)]">
                      暂无用户
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-[var(--secondary)]/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--foreground)]">
                            {user.username}
                          </span>
                          {user.isAdmin && (
                            <span className="px-1.5 py-0.5 text-xs bg-[var(--primary)] text-white rounded">
                              管理员
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {formatPrice(user.balance)}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {user.taskCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {PREMIUM_MODELS.map((modelId) => {
                            const hasPermission = user.permissions.includes(modelId);
                            const isLoading =
                              actionLoading === `add-${user.id}-${modelId}` ||
                              actionLoading === `remove-${user.id}-${modelId}`;
                            return (
                              <span
                                key={modelId}
                                className={`px-2 py-1 text-xs rounded cursor-pointer transition-all ${
                                  hasPermission
                                    ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                                    : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
                                } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
                                onClick={() =>
                                  !isLoading &&
                                  (hasPermission
                                    ? removePermission(user.id, modelId)
                                    : addPermission(user.id, modelId))
                                }
                                title={hasPermission ? "点击移除权限" : "点击添加权限"}
                              >
                                {IMAGE_MODELS[modelId as keyof typeof IMAGE_MODELS]?.label || modelId}
                                {hasPermission ? " ✓" : " +"}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                        {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-sm text-[var(--primary)] hover:underline"
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-between">
              <div className="text-sm text-[var(--muted-foreground)]">
                共 {pagination.total} 条记录
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchUsers(pagination.page - 1, search)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => fetchUsers(pagination.page + 1, search)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 text-sm border border-[var(--border)] rounded hover:bg-[var(--secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 用户详情弹窗 */}
      {selectedUserId && (
        <UserDetailModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </div>
  );
}
