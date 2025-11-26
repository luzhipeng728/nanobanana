"use client";

import { createContext, useContext } from "react";
import { Node, Edge } from "@xyflow/react";

interface CanvasContextType {
  addImageNode: (
    imageUrl: string | undefined,
    prompt: string,
    position: { x: number; y: number },
    taskId?: string,
    generationConfig?: {
      model: string;
      config: any;
      referenceImages?: string[];
    }
  ) => string;
  updateImageNode: (nodeId: string, imageUrl: string) => void;
  addMusicNode: (taskId: string, prompt: string, position: { x: number; y: number }) => string;
  addVideoNode: (taskId: string, prompt: string, position: { x: number; y: number }, options?: { apiSource?: "sora" | "veo"; model?: string }) => string;
  addStickerNode: (taskId: string, animationType: string, position: { x: number; y: number }) => string;
  getConnectedImageNodes: (nodeId: string) => Node[];
  getSelectedImageNodes: () => Node[];
  getNode: (nodeId: string) => Node | undefined;
  openImageModal: (imageUrl: string, prompt?: string) => void;
  // Use getter functions instead of direct values to prevent unnecessary re-renders
  getNodes: () => Node[];
  getEdges: () => Edge[];
}

export const CanvasContext = createContext<CanvasContextType | null>(null);

export const useCanvas = () => {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvas must be used within a CanvasProvider");
  }
  return context;
};
