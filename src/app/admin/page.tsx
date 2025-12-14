import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "管理后台 | NanoBanana",
  description: "用户管理与权限控制",
};

export default async function AdminPage() {
  // 服务端验证管理员权限
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, username: true },
  });

  if (!user?.isAdmin) {
    redirect("/");
  }

  return <AdminClient currentUser={user.username} />;
}
