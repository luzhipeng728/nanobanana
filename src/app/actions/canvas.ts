"use server";

import { prisma } from "@/lib/prisma";

export async function saveCanvas(userId: string, name: string | undefined, data: string, canvasId?: string) {
  try {
    if (canvasId) {
      const updateData: { data: string; updatedAt: Date; name?: string } = {
        data,
        updatedAt: new Date(),
      };
      if (name !== undefined) {
        updateData.name = name;
      }
      const canvas = await prisma.canvas.update({
        where: { id: canvasId },
        data: updateData,
      });
      // Also update lastActiveCanvasId
      await prisma.user.update({
        where: { id: userId },
        data: { lastActiveCanvasId: canvasId },
      });
      return canvas;
    } else {
      const canvas = await prisma.canvas.create({
        data: {
          name: name || `Canvas ${new Date().toLocaleString()}`,
          data,
          userId,
        },
      });
      // Set as last active canvas
      await prisma.user.update({
        where: { id: userId },
        data: { lastActiveCanvasId: canvas.id },
      });
      return canvas;
    }
  } catch (error) {
    console.error("Error saving canvas:", error);
    throw new Error("Failed to save canvas");
  }
}

export async function getUserCanvases(userId: string) {
  try {
    return await prisma.canvas.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (error) {
    console.error("Error fetching canvases:", error);
    throw new Error("Failed to fetch canvases");
  }
}

export async function getCanvasById(canvasId: string) {
  try {
    return await prisma.canvas.findUnique({
      where: { id: canvasId },
    });
  } catch (error) {
    console.error("Error fetching canvas:", error);
    throw new Error("Failed to fetch canvas");
  }
}

export async function deleteCanvas(canvasId: string, userId: string) {
  try {
    // Verify ownership
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId },
    });
    if (!canvas || canvas.userId !== userId) {
      throw new Error("Canvas not found or unauthorized");
    }
    await prisma.canvas.delete({
      where: { id: canvasId },
    });
    return { success: true };
  } catch (error) {
    console.error("Error deleting canvas:", error);
    throw new Error("Failed to delete canvas");
  }
}

export async function renameCanvas(canvasId: string, userId: string, newName: string) {
  try {
    // Verify ownership
    const canvas = await prisma.canvas.findUnique({
      where: { id: canvasId },
    });
    if (!canvas || canvas.userId !== userId) {
      throw new Error("Canvas not found or unauthorized");
    }
    return await prisma.canvas.update({
      where: { id: canvasId },
      data: { name: newName },
    });
  } catch (error) {
    console.error("Error renaming canvas:", error);
    throw new Error("Failed to rename canvas");
  }
}

export async function setLastActiveCanvas(userId: string, canvasId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveCanvasId: canvasId },
    });
  } catch (error) {
    console.error("Error setting last active canvas:", error);
  }
}

export async function getLastActiveCanvas(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveCanvasId: true },
    });

    if (user?.lastActiveCanvasId) {
      const canvas = await prisma.canvas.findUnique({
        where: { id: user.lastActiveCanvasId },
      });
      if (canvas && canvas.userId === userId) {
        return canvas;
      }
    }

    // Fallback: return most recently updated canvas
    const latestCanvas = await prisma.canvas.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return latestCanvas;
  } catch (error) {
    console.error("Error getting last active canvas:", error);
    return null;
  }
}
