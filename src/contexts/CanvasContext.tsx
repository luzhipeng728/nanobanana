"use client";

import { createContext, useContext } from "react";
import { Node, Edge } from "@xyflow/react";

interface CanvasContextType {
  addImageNode: (imageUrl: string | undefined, prompt: string, position: { x: number; y: number }, taskId?: string) => string;
  updateImageNode: (nodeId: string, imageUrl: string) => void;
  addMusicNode: (taskId: string, prompt: string, position: { x: number; y: number }) => string;
  addVideoNode: (taskId: string, prompt: string, position: { x: number; y: number }) => string;
  addStickerNode: (taskId: string, animationType: string, position: { x: number; y: number }) => string;
  getConnectedImageNodes: (nodeId: string) => Node[];
  getSelectedImageNodes: () => Node[];
  getNode: (nodeId: string) => Node | undefined;
  openImageModal: (imageUrl: string, prompt?: string) => void;
  nodes: Node[];
  edges: Edge[];
}

export const CanvasContext = createContext<CanvasContextType | null>(null);

export const useCanvas = () => {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvas must be used within a CanvasProvider");
  }
  return context;
};
