"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { createHash } from "crypto";

// 简单的密码哈希函数（生产环境建议使用 bcrypt）
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// 验证密码
function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// 设置登录 Cookie
async function setLoginCookies(userId: string, username: string) {
  const cookieStore = await cookies();
  cookieStore.set("userId", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  cookieStore.set("username", username, {
    httpOnly: false, // Allow client-side access for display
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/**
 * 注册新用户
 */
export async function registerUser(username: string, password: string, inviteCode: string) {
  if (!username || !password) {
    return { success: false, error: "用户名和密码不能为空" };
  }

  if (username.length < 2 || username.length > 20) {
    return { success: false, error: "用户名长度需要在 2-20 个字符之间" };
  }

  if (password.length < 6) {
    return { success: false, error: "密码长度至少 6 个字符" };
  }

  const normalizedInviteCode = inviteCode.trim().toUpperCase();

  if (!normalizedInviteCode) {
    return { success: false, error: "邀请码不能为空" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 检查邀请码
      const invite = await tx.inviteCode.findUnique({
        where: { code: normalizedInviteCode },
        select: { id: true, isActive: true, usedById: true, note: true },
      });

      if (!invite || !invite.isActive) {
        return { error: "邀请码无效" };
      }

      if (invite.usedById) {
        return { error: "邀请码已被使用" };
      }

      // 检查用户名是否已存在
      const existingUser = await tx.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return { error: "用户名已被注册" };
      }

      // 创建新用户
      const user = await tx.user.create({
        data: {
          username,
          password: hashPassword(password),
          remark: invite.note ?? null,
        },
      });

      await tx.inviteCode.update({
        where: { id: invite.id },
        data: {
          usedById: user.id,
          usedAt: new Date(),
          isActive: false,
        },
      });

      return { user };
    });

    if (result.error) {
      return { success: false, error: result.error };
    }

    const user = result.user!;

    // 设置登录状态
    await setLoginCookies(user.id, user.username);

    return {
      success: true,
      user: { id: user.id, username: user.username },
    };
  } catch (error) {
    console.error("Error registering user:", error);
    return { success: false, error: "注册失败，请稍后重试" };
  }
}

/**
 * 用户登录
 */
export async function loginUser(username: string, password: string) {
  if (!username || !password) {
    return { success: false, error: "用户名和密码不能为空" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return { success: false, error: "用户名或密码错误" };
    }

    if (!verifyPassword(password, user.password)) {
      return { success: false, error: "用户名或密码错误" };
    }

    // 设置登录状态
    await setLoginCookies(user.id, user.username);

    return {
      success: true,
      user: { id: user.id, username: user.username },
    };
  } catch (error) {
    console.error("Error logging in:", error);
    return { success: false, error: "登录失败，请稍后重试" };
  }
}

/**
 * 获取当前登录用户
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;

    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, createdAt: true },
    });

    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * 退出登录
 */
export async function logout() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("userId");
    cookieStore.delete("username");
    return { success: true };
  } catch (error) {
    console.error("Error logging out:", error);
    return { success: false };
  }
}

// 保持旧接口兼容（deprecated，将来移除）
export async function getOrCreateUser(username: string) {
  console.warn("getOrCreateUser is deprecated, use registerUser/loginUser instead");
  return null;
}
