"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function getOrCreateUser(username: string) {
  if (!username) return null;

  try {
    let user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { username },
      });
    }

    // Set cookie to persist login state
    const cookieStore = await cookies();
    cookieStore.set("userId", user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    cookieStore.set("username", user.username, {
      httpOnly: false, // Allow client-side access for display
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return user;
  } catch (error) {
    console.error("Error handling user:", error);
    throw new Error("Failed to handle user");
  }
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;

    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

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

