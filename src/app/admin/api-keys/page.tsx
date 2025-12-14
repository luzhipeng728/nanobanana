import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ApiKeysClient from "./ApiKeysClient";

export default async function ApiKeysPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, isAdmin: true },
  });

  if (!user?.isAdmin) {
    redirect("/");
  }

  return <ApiKeysClient currentUser={user.username} />;
}
