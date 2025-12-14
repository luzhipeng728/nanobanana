import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "个人设置 | NanoBanana",
  description: "账户设置与消费记录",
};

export default async function SettingsPage() {
  // 验证登录状态
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) {
    redirect("/");
  }

  return <SettingsClient />;
}
