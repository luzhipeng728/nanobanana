"use server";

import { prisma } from "@/lib/prisma";

export async function saveCanvas(userId: string, name: string, data: string, canvasId?: string) {
  try {
    if (canvasId) {
      return await prisma.canvas.update({
        where: { id: canvasId },
        data: { name, data, updatedAt: new Date() },
      });
    } else {
      return await prisma.canvas.create({
        data: {
          name,
          data,
          userId,
        },
      });
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

