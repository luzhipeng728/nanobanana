"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  BackgroundVariant,
  getConnectedEdges,
  getIncomers,
  NodeTypes,
} from "@xyflow/react";
import ImageGenNode from "./nodes/ImageGenNode";
import ImageNode from "./nodes/ImageNode";
import AgentNode from "./nodes/AgentNode";
import MusicGenNode from "./nodes/MusicGenNode";
import MusicNode from "./nodes/MusicNode";
import VideoGenNode from "./nodes/VideoGenNode";
import VideoNode from "./nodes/VideoNode";
import ChatNode from "./nodes/ChatNode";
import StickerGenNode from "./nodes/StickerGenNode";
import StickerNode from "./nodes/StickerNode";
import ImageModal from "./ImageModal";
import NodeToolbar from "./NodeToolbar";
import { CanvasContext } from "@/contexts/CanvasContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { saveCanvas, getUserCanvases, getCanvasById } from "@/app/actions/canvas";
import { getOrCreateUser, getCurrentUser, logout } from "@/app/actions/user";
import { uploadImageToR2 } from "@/app/actions/storage";
import { Save, FolderOpen, User as UserIcon, LogOut, Image, Wand2, Brain, Trash2, Smile, GalleryHorizontalEnd } from "lucide-react";
import Gallery from "./Gallery";

const nodeTypes = {
  imageGen: ImageGenNode as any,
  image: ImageNode as any,
  agent: AgentNode as any,
  musicGen: MusicGenNode as any,
  music: MusicNode as any,
  videoGen: VideoGenNode as any,
  video: VideoNode as any,
  chat: ChatNode as any,
  stickerGen: StickerGenNode as any,
  sticker: StickerNode as any,
};

const LOCALSTORAGE_KEY = "nanobanana-canvas-v1";

// Start with empty canvas - users will drag nodes from toolbar
const initialNodes: Node[] = [];

export default function InfiniteCanvas() {
  // Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);


  // User & Canvas State
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [savedCanvases, setSavedCanvases] = useState<any[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Image Modal State
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState("");
  const [modalPrompt, setModalPrompt] = useState<string | undefined>(undefined);

  // Gallery State
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Load canvas from localStorage on mount
  useEffect(() => {
    try {
      const savedCanvas = localStorage.getItem(LOCALSTORAGE_KEY);
      if (savedCanvas) {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedCanvas);
        if (savedNodes && Array.isArray(savedNodes) && savedNodes.length > 0) {
          setNodes(savedNodes);
          setEdges(savedEdges || []);
          console.log("✅ Loaded canvas from localStorage:", savedNodes.length, "nodes");
        }
      }
    } catch (error) {
      console.error("Failed to load canvas from localStorage:", error);
    } finally {
      setIsCanvasLoaded(true);
    }
  }, []);

  // Auto-save canvas to localStorage whenever nodes or edges change
  useEffect(() => {
    if (!isCanvasLoaded) return; // Don't save during initial load

    try {
      const canvasData = JSON.stringify({ nodes, edges });
      localStorage.setItem(LOCALSTORAGE_KEY, canvasData);
      console.log("💾 Auto-saved canvas to localStorage:", nodes.length, "nodes", edges.length, "edges");
    } catch (error) {
      console.error("Failed to save canvas to localStorage:", error);
    }
  }, [nodes, edges, isCanvasLoaded]);

  // Check for existing session on mount
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    setIsLoading(true);
    const user = await getCurrentUser();
    if (user) {
      setUserId(user.id);
      setUsername(user.username);
      loadUserCanvases(user.id);
      setIsUserModalOpen(false);
    } else {
      setIsUserModalOpen(true);
    }
    setIsLoading(false);
  };

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );


  const addGeneratorNode = useCallback(() => {
    const newNode: Node = {
      id: `gen-${Date.now()}`,
      type: "imageGen",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      data: { prompt: "" },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const addAgentNode = useCallback(() => {
    const newNode: Node = {
      id: `agent-${Date.now()}`,
      type: "agent",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      data: {
        userRequest: "",
        status: "idle",
        prompts: [],
        progress: 0,
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const addStickerGenNode = useCallback(() => {
    const newNode: Node = {
      id: `stickerGen-${Date.now()}`,
      type: "stickerGen",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      style: {
        width: 340,
      },
      data: {
        animationPrompt: "",
        model: "nano-banana",
        imageSize: "512x512",
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size must be less than 10MB');
      return;
    }

    // 先创建一个 loading 状态的节点
    const nodeId = `image-${Date.now()}`;
    const newNode: Node = {
      id: nodeId,
      type: "image",
      position: {
        x: Math.random() * 500 + 100,
        y: Math.random() * 500 + 100,
      },
      style: {
        width: 420,
        height: 270,
      },
      data: {
        imageUrl: undefined,
        prompt: `上传中: ${file.name}`,
        timestamp: new Date().toLocaleString(),
        isLoading: true,
      },
    };
    setNodes((nds) => nds.concat(newNode));

    try {
      // Upload to R2
      const formData = new FormData();
      formData.append('file', file);

      const imageUrl = await uploadImageToR2(formData);

      // 上传成功，更新节点显示图片
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  imageUrl,
                  prompt: file.name,
                  isLoading: false,
                },
              }
            : node
        )
      );
    } catch (error) {
      console.error('Failed to upload image:', error);
      // 上传失败，更新节点显示错误
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  prompt: `上传失败: ${file.name}`,
                  isLoading: false,
                  error: '上传失败，请重试',
                },
              }
            : node
        )
      );
    }

    // Reset input
    event.target.value = '';
  }, [setNodes]);

  // Drag and drop handlers for adding nodes
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: type === 'imageGen'
          ? { prompt: '' }
          : type === 'agent'
          ? { userRequest: '' }
          : type === 'musicGen'
          ? { prompt: '', lyrics: '', numberOfSongs: 2 }
          : type === 'videoGen'
          ? { prompt: '', orientation: 'portrait' }
          : type === 'chat'
          ? { messages: [], systemPrompt: 'You are a helpful AI assistant that generates image prompts. When user asks for images, wrap your prompt suggestions in ```text\n[prompt text]\n``` blocks.' }
          : type === 'stickerGen'
          ? { animationPrompt: '', model: 'nano-banana', imageSize: '512x512' }
          : {},
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const handleLogin = async () => {
    if (!username.trim()) {
      alert("Please enter a username");
      return;
    }
    try {
      const user = await getOrCreateUser(username.trim());
      if (user) {
        setUserId(user.id);
        setUsername(user.username);
        setIsUserModalOpen(false);
        loadUserCanvases(user.id);
      }
    } catch (error) {
      alert("Failed to login. Please try again.");
      console.error(error);
    }
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      setUserId(null);
      setUsername("");
      setSavedCanvases([]);
      setIsUserModalOpen(true);
    }
  };

  const loadUserCanvases = async (uid: string) => {
    const canvases = await getUserCanvases(uid);
    setSavedCanvases(canvases);
  };

  const handleSave = async () => {
    if (!userId) {
      setIsUserModalOpen(true);
      return;
    }

    const canvasData = JSON.stringify({ nodes, edges });
    const name = `Canvas ${new Date().toLocaleString()}`;
    
    const saved = await saveCanvas(userId, name, canvasData, currentCanvasId || undefined);
    if (saved) {
      setCurrentCanvasId(saved.id);
      alert("Canvas saved successfully!");
      loadUserCanvases(userId);
    }
  };

  const loadCanvas = async (canvasId: string) => {
    const canvas = await getCanvasById(canvasId);
    if (canvas) {
      const { nodes: loadedNodes, edges: loadedEdges } = JSON.parse(canvas.data);
      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setCurrentCanvasId(canvas.id);
      // Also update localStorage
      localStorage.setItem(LOCALSTORAGE_KEY, canvas.data);
    }
  };

  // Clear local cache
  const clearLocalCache = () => {
    if (confirm("确定要清空画布缓存吗？这将删除所有节点，但不会影响已保存的画布。")) {
      localStorage.removeItem(LOCALSTORAGE_KEY);
      setNodes(initialNodes);
      setEdges([]);
      setCurrentCanvasId(null);
      console.log("🗑️ Cleared local cache");
    }
  };

  // Add image node programmatically with 16:9 aspect ratio sizing
  const addImageNode = useCallback((imageUrl: string | undefined, prompt: string, position: { x: number; y: number }, taskId?: string): string => {
    const nodeId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 16:9 aspect ratio: width = 400px, height = 225px (image area)
    // Add padding/borders: total ~420px width × ~270px height
    const newNode: Node = {
      id: nodeId,
      type: "image",
      position,
      style: {
        width: 420,  // 16:9 宽度
        height: 270, // 16:9 高度（包含header和padding）
      },
      data: {
        imageUrl,
        prompt,
        timestamp: new Date().toLocaleString(),
        isLoading: !imageUrl, // loading 状态
        taskId, // 存储任务 ID
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

  // Update image node with generated image
  const updateImageNode = useCallback((nodeId: string, imageUrl: string) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                imageUrl,
                isLoading: false,
              },
            }
          : node
      )
    );
  }, [setNodes]);

  // Add music node programmatically
  const addMusicNode = useCallback((taskId: string, prompt: string, position: { x: number; y: number }): string => {
    const nodeId = `music-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newNode: Node = {
      id: nodeId,
      type: "music",
      position,
      data: {
        taskId,
        prompt,
        isLoading: true,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

  // Add video node programmatically
  const addVideoNode = useCallback((taskId: string, prompt: string, position: { x: number; y: number }): string => {
    const nodeId = `video-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newNode: Node = {
      id: nodeId,
      type: "video",
      position,
      style: {
        width: 420,
        height: 320,
      },
      data: {
        taskId,
        prompt,
        isLoading: true,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

  // Add sticker node programmatically
  const addStickerNode = useCallback((taskId: string, animationType: string, position: { x: number; y: number }): string => {
    const nodeId = `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newNode: Node = {
      id: nodeId,
      type: "sticker",
      position,
      style: {
        width: 380,
        height: 500,
      },
      data: {
        taskId,
        animationType,
        isLoading: true,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

  // Get connected image nodes for a given node
  const getConnectedImageNodes = useCallback((nodeId: string): Node[] => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return [];

    // Get all edges connected to this node (incoming edges)
    const connectedEdges = edges.filter((edge: Edge) => edge.target === nodeId);

    // Get all source nodes from connected edges
    const sourceNodes = connectedEdges
      .map((edge: Edge) => nodes.find(n => n.id === edge.source))
      .filter((n): n is Node => n !== undefined && n.type === 'image');

    return sourceNodes;
  }, [nodes, edges]);

  // Get a single node by ID
  const getNode = useCallback((nodeId: string) => {
    return nodes.find(n => n.id === nodeId);
  }, [nodes]);

  // Open image modal
  const openImageModal = useCallback((imageUrl: string, prompt?: string) => {
    setModalImageUrl(imageUrl);
    setModalPrompt(prompt);
    setIsImageModalOpen(true);
  }, []);

  // Canvas context value
  const canvasContextValue = useMemo(() => ({
    addImageNode,
    updateImageNode,
    addMusicNode,
    addVideoNode,
    addStickerNode,
    getConnectedImageNodes,
    getSelectedImageNodes: () => [], // Remove selected functionality
    getNode,
    openImageModal,
    nodes,
    edges,
  }), [addImageNode, updateImageNode, addMusicNode, addVideoNode, addStickerNode, getConnectedImageNodes, getNode, openImageModal, nodes, edges]);

  return (
    <div className="w-full h-screen relative bg-neutral-50 dark:bg-black">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm p-2 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-800">
        <button
          onClick={addGeneratorNode}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Add Generator"
        >
          <Wand2 className="w-5 h-5" />
        </button>
        <button
          onClick={addAgentNode}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Add AI Agent"
        >
          <Brain className="w-5 h-5 text-purple-600" />
        </button>
        <button
          onClick={addStickerGenNode}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="表情包生成器"
        >
          <Smile className="w-5 h-5 text-pink-500" />
        </button>
        <label className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer" title="Upload Image">
          <Image className="w-5 h-5" />
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </label>
        <div className="w-px bg-neutral-300 dark:bg-neutral-700 my-1" />
        <button
          onClick={handleSave}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Save Canvas to Cloud"
        >
          <Save className="w-5 h-5" />
        </button>
        <div className="relative group">
          <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" title="Load Canvas from Cloud">
            <FolderOpen className="w-5 h-5" />
          </button>
          {/* Dropdown for history */}
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 hidden group-hover:block max-h-60 overflow-y-auto">
            {savedCanvases.length === 0 ? (
              <div className="p-3 text-xs text-neutral-500 text-center">No saved canvases</div>
            ) : (
              savedCanvases.map(c => (
                <div
                  key={c.id}
                  onClick={() => loadCanvas(c.id)}
                  className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer text-xs truncate border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                >
                  {c.name}
                </div>
              ))
            )}
          </div>
        </div>
        <button
          onClick={() => setIsGalleryOpen(true)}
          className="p-2 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-purple-600 dark:text-purple-400"
          title="创意画廊"
        >
          <GalleryHorizontalEnd className="w-5 h-5" />
        </button>
        <button
          onClick={clearLocalCache}
          className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-600 dark:text-red-400"
          title="Clear Local Cache"
        >
          <Trash2 className="w-5 h-5" />
        </button>
        <div className="w-px bg-neutral-300 dark:bg-neutral-700 my-1" />
        {userId ? (
          <div className="relative group">
            <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              <span className="text-xs font-medium">{username}</span>
            </button>
            {/* User dropdown */}
            <div className="absolute top-full mt-2 right-0 w-48 bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-800 hidden group-hover:block">
              <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
                <p className="text-xs text-neutral-500">Logged in as</p>
                <p className="text-sm font-medium truncate">{username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full p-3 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left text-sm flex items-center gap-2 text-red-600 dark:text-red-400"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsUserModalOpen(true)}
            className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Login"
          >
            <UserIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Node Toolbar */}
      <NodeToolbar onDragStart={onDragStart} />

      <AudioProvider>
        <CanvasContext.Provider value={canvasContextValue}>
          <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={4}
          className="bg-neutral-50 dark:bg-black"
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </CanvasContext.Provider>
      </AudioProvider>

      {/* Login/Register Modal */}
      {isUserModalOpen && !userId && !isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-xl shadow-2xl w-96 border border-neutral-200 dark:border-neutral-800">
            <h2 className="text-2xl font-bold mb-2">Welcome to NanoBanana</h2>
            <p className="text-sm text-neutral-500 mb-6">
              Login with your username or create a new account
            </p>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Enter your username"
              className="w-full p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              autoFocus
            />
            <button
              onClick={handleLogin}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              Login or Register
            </button>
            <p className="text-xs text-neutral-400 mt-4 text-center">
              New users will be automatically registered
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-2xl">
            <p className="text-sm text-neutral-500">Loading...</p>
          </div>
        </div>
      )}

      {/* Global Image Modal */}
      <ImageModal
        isOpen={isImageModalOpen}
        imageUrl={modalImageUrl}
        prompt={modalPrompt}
        onClose={() => setIsImageModalOpen(false)}
      />

      {/* Gallery Modal */}
      <Gallery
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />
    </div>
  );
}

