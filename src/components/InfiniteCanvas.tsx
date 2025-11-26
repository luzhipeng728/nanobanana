"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { registerUser, loginUser, getCurrentUser, logout } from "@/app/actions/user";
import { uploadImageToR2 } from "@/app/actions/storage";
import { Save, FolderOpen, User as UserIcon, LogOut, Wand2, Brain, Trash2, Smile, GalleryHorizontalEnd, Image as ImageIcon, X, MousePointer2, Hand } from "lucide-react";
import exampleImages from "@/data/example-images.json";
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
const FIRST_VISIT_KEY = "nanobanana-first-visit";

// Start with empty canvas - users will drag nodes from toolbar
const initialNodes: Node[] = [];

export default function InfiniteCanvas() {
  // Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isCanvasLoaded, setIsCanvasLoaded] = useState(false);


  // User & Canvas State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
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

  // Selection Mode State (for box selection)
  const [selectionMode, setSelectionMode] = useState(false);

  // Image Upload Placement State
  const [isPlacingImage, setIsPlacingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers for adding nodes
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Load canvas from localStorage on mount, or show examples for first visit
  useEffect(() => {
    try {
      const savedCanvas = localStorage.getItem(LOCALSTORAGE_KEY);
      const hasVisited = localStorage.getItem(FIRST_VISIT_KEY);

      if (savedCanvas) {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedCanvas);
        if (savedNodes && Array.isArray(savedNodes) && savedNodes.length > 0) {
          setNodes(savedNodes);
          setEdges(savedEdges || []);
          console.log("✅ Loaded canvas from localStorage:", savedNodes.length, "nodes");
        }
      } else if (!hasVisited) {
        // First visit: load example images
        console.log("🎉 First visit! Loading example images...");
        loadExampleImages();
        localStorage.setItem(FIRST_VISIT_KEY, "true");
      }
    } catch (error) {
      console.error("Failed to load canvas from localStorage:", error);
    } finally {
      setIsCanvasLoaded(true);
    }
  }, []);

  // Load example images for first-time visitors
  const loadExampleImages = useCallback(() => {
    const COLS = 9;  // 9 columns (27 images / 3 rows)
    const NODE_WIDTH = 420;  // Image node width
    const NODE_HEIGHT = 260; // Estimated height (16:9 aspect)
    const GAP_X = 40;
    const GAP_Y = 60;
    const START_X = 50;
    const START_Y = 80;

    const exampleNodes: Node[] = exampleImages.map((img, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);

      return {
        id: `example-${img.id}-${Date.now()}`,
        type: "image",
        position: {
          x: START_X + col * (NODE_WIDTH + GAP_X),
          y: START_Y + row * (NODE_HEIGHT + GAP_Y),
        },
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        },
        data: {
          imageUrl: img.url,
          prompt: img.prompt,
          timestamp: new Date().toLocaleString(),
          isLoading: false,
          label: `${img.category} - ${img.title}`,  // 显示分类和标题
        },
      };
    });

    setNodes(exampleNodes);
    console.log(`✅ Loaded ${exampleNodes.length} example images`);
  }, [setNodes]);

  // Auto-save canvas to localStorage with debounce to prevent lag during dragging
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isCanvasLoaded) return; // Don't save during initial load

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: wait 500ms after last change before saving
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const canvasData = JSON.stringify({ nodes, edges });
        localStorage.setItem(LOCALSTORAGE_KEY, canvasData);
        console.log("💾 Auto-saved canvas to localStorage:", nodes.length, "nodes", edges.length, "edges");
      } catch (error) {
        console.error("Failed to save canvas to localStorage:", error);
      }
    }, 500);

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
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

  // 存储待放置图片的位置
  const pendingImagePositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setIsPlacingImage(false);
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      setIsPlacingImage(false);
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB');
      setIsPlacingImage(false);
      return;
    }

    // 使用已确定的位置，如果没有则随机
    const position = pendingImagePositionRef.current || {
      x: Math.random() * 500 + 100,
      y: Math.random() * 500 + 100,
    };

    // 先创建一个 loading 状态的节点（正方形占位，图片加载后会自动调整比例）
    const nodeId = `image-${Date.now()}`;
    const newNode: Node = {
      id: nodeId,
      type: "image",
      position,
      style: {
        width: 400,
        height: 400,
      },
      data: {
        imageUrl: undefined,
        prompt: `上传中: ${file.name}`,
        timestamp: new Date().toLocaleString(),
        isLoading: true,
        label: "上传",  // 上传的图片标签
      },
    };
    setNodes((nds) => nds.concat(newNode));

    // 重置状态
    setIsPlacingImage(false);
    pendingImagePositionRef.current = null;

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

  // 处理工具栏上传按钮点击 - 进入放置模式
  const handleToolbarImageUploadClick = useCallback(() => {
    setIsPlacingImage(true);
  }, []);

  // 处理画布点击 - 在放置模式下确定位置并打开文件选择
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    if (!isPlacingImage || !reactFlowInstance) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    pendingImagePositionRef.current = position;
    fileInputRef.current?.click();
  }, [isPlacingImage, reactFlowInstance]);

  // 取消放置模式
  const cancelPlacingImage = useCallback(() => {
    setIsPlacingImage(false);
    pendingImagePositionRef.current = null;
  }, []);

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

  const handleAuth = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthError("请填写用户名和密码");
      return;
    }

    setAuthError("");
    setAuthLoading(true);

    try {
      const result = authMode === "register"
        ? await registerUser(username.trim(), password)
        : await loginUser(username.trim(), password);

      if (result.success && result.user) {
        setUserId(result.user.id);
        setUsername(result.user.username);
        setPassword("");
        setIsUserModalOpen(false);
        loadUserCanvases(result.user.id);
      } else {
        setAuthError(result.error || "操作失败，请重试");
      }
    } catch (error) {
      setAuthError("操作失败，请重试");
      console.error(error);
    } finally {
      setAuthLoading(false);
    }
  };

  // 切换登录/注册模式时清空错误
  const toggleAuthMode = () => {
    setAuthMode(authMode === "login" ? "register" : "login");
    setAuthError("");
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

  // Clear local cache and show example images
  const clearLocalCache = useCallback(() => {
    if (confirm("确定要清空画布缓存吗？这将删除所有节点并重置为示例画布。")) {
      localStorage.removeItem(LOCALSTORAGE_KEY);
      localStorage.removeItem(FIRST_VISIT_KEY);  // 重置首次访问标记
      setEdges([]);
      setCurrentCanvasId(null);
      // 直接加载示例图片
      loadExampleImages();
      console.log("🗑️ Cleared local cache and loaded example images");
    }
  }, [loadExampleImages]);

  // Delete selected nodes
  const deleteSelectedNodes = useCallback((skipConfirm = false) => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      return;
    }

    const doDelete = () => {
      const selectedIds = new Set(selectedNodes.map(n => n.id));
      setNodes(nds => nds.filter(n => !selectedIds.has(n.id)));
      // 同时删除相关的边
      setEdges(eds => eds.filter((e: Edge) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
      console.log(`🗑️ Deleted ${selectedNodes.length} nodes`);
    };

    if (skipConfirm || confirm(`确定要删除选中的 ${selectedNodes.length} 个节点吗？`)) {
      doDelete();
    }
  }, [nodes, setNodes, setEdges]);

  // Keyboard shortcut: Delete key to delete selected nodes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete or Backspace to delete selected nodes (when not typing in an input)
      if ((e.key === "Delete" || e.key === "Backspace") && selectionMode) {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in an input or textarea
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        deleteSelectedNodes(true);  // Skip confirmation for keyboard shortcut
      }
      // Press Escape to exit selection mode
      if (e.key === "Escape" && selectionMode) {
        setSelectionMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, deleteSelectedNodes]);

  // Add image node programmatically - 初始尺寸为默认占位，图片加载后会自动调整
  const addImageNode = useCallback((
    imageUrl: string | undefined,
    prompt: string,
    position: { x: number; y: number },
    taskId?: string,
    generationConfig?: {
      model: string;
      config: any;
      referenceImages?: string[];
    },
    label?: string  // 左上角标签（场景名称）
  ): string => {
    const nodeId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 默认占位尺寸（正方形），图片加载后会根据实际比例自动调整
    const newNode: Node = {
      id: nodeId,
      type: "image",
      position,
      style: {
        width: 400,  // 默认宽度
        height: 400, // 默认高度（正方形占位）
      },
      data: {
        imageUrl,
        prompt,
        timestamp: new Date().toLocaleString(),
        isLoading: !imageUrl, // loading 状态
        taskId, // 存储任务 ID
        generationConfig, // 存储生图配置，用于重新生成
        label, // 左上角标签
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
  const addVideoNode = useCallback((
    taskId: string,
    prompt: string,
    position: { x: number; y: number },
    options?: { apiSource?: "sora" | "veo"; model?: string }
  ): string => {
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
        apiSource: options?.apiSource || "sora",
        model: options?.model,
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

  // Use refs to avoid re-creating callbacks on every render
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  // Keep refs in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Get connected image nodes for a given node - uses refs to avoid dependency on nodes/edges
  const getConnectedImageNodes = useCallback((nodeId: string): Node[] => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) return [];

    // Get all edges connected to this node (incoming edges)
    const connectedEdges = currentEdges.filter((edge: Edge) => edge.target === nodeId);

    // Get all source nodes from connected edges
    const sourceNodes = connectedEdges
      .map((edge: Edge) => currentNodes.find(n => n.id === edge.source))
      .filter((n): n is Node => n !== undefined && n.type === 'image');

    return sourceNodes;
  }, []); // No dependencies - uses refs

  // Get a single node by ID - uses refs to avoid dependency on nodes
  const getNode = useCallback((nodeId: string) => {
    return nodesRef.current.find(n => n.id === nodeId);
  }, []); // No dependencies - uses refs

  // Open image modal
  const openImageModal = useCallback((imageUrl: string, prompt?: string) => {
    setModalImageUrl(imageUrl);
    setModalPrompt(prompt);
    setIsImageModalOpen(true);
  }, []);

  // Getter functions that use refs - stable references, no re-renders on node changes
  const getNodes = useCallback(() => nodesRef.current, []);
  const getEdges = useCallback(() => edgesRef.current, []);

  // Canvas context value - no longer depends on nodes/edges directly
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
    getNodes,  // Use getter instead of direct value
    getEdges,  // Use getter instead of direct value
  }), [addImageNode, updateImageNode, addMusicNode, addVideoNode, addStickerNode, getConnectedImageNodes, getNode, openImageModal, getNodes, getEdges]);

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
          onClick={() => setSelectionMode(!selectionMode)}
          className={`p-2 rounded-full transition-colors ${
            selectionMode
              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
          title={selectionMode ? "当前：选择模式（点击切换到手掌模式）" : "当前：手掌模式（点击切换到选择模式）"}
        >
          {selectionMode ? (
            <MousePointer2 className="w-5 h-5" />
          ) : (
            <Hand className="w-5 h-5" />
          )}
        </button>
        {selectionMode && (
          <button
            onClick={() => deleteSelectedNodes(false)}
            className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-600 dark:text-red-400"
            title="删除选中节点"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={clearLocalCache}
          className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-red-600 dark:text-red-400"
          title="清空画布"
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
      <NodeToolbar onDragStart={onDragStart} onImageUploadClick={handleToolbarImageUploadClick} />

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Selection Mode Indicator */}
      {selectionMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-blue-500/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-full shadow-lg">
          <MousePointer2 className="w-4 h-4" />
          <span className="text-sm font-medium">选择模式：拖动框选节点，按 Delete 删除</span>
          <button
            onClick={() => setSelectionMode(false)}
            className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            title="退出选择模式"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image Placement Mode Overlay */}
      {isPlacingImage && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onClick={handleCanvasClick}
        >
          {/* Top hint bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-cyan-500/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-full shadow-lg">
            <ImageIcon className="w-4 h-4" />
            <span className="text-sm font-medium">点击画布选择图片放置位置</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancelPlacingImage();
              }}
              className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
          // 性能优化配置
          onlyRenderVisibleElements={true}  // 只渲染可见区域的节点
          nodesFocusable={false}            // 禁用节点焦点，减少事件监听
          edgesFocusable={false}            // 禁用边焦点
          elevateNodesOnSelect={false}      // 选中时不提升 z-index，避免重排
          nodeDragThreshold={5}             // 拖动阈值，减少误触发
          // 框选模式配置
          selectionOnDrag={selectionMode}   // 框选模式下拖动为选择
          panOnDrag={!selectionMode}        // 普通模式下拖动为平移
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </CanvasContext.Provider>
      </AudioProvider>

      {/* Login/Register Modal */}
      {isUserModalOpen && !userId && !isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-xl shadow-2xl w-96 border border-neutral-200 dark:border-neutral-800">
            <h2 className="text-2xl font-bold mb-2">
              {authMode === "login" ? "登录 NanoBanana" : "注册 NanoBanana"}
            </h2>
            <p className="text-sm text-neutral-500 mb-6">
              {authMode === "login" ? "欢迎回来！请输入账号密码登录" : "创建新账号开始你的创作之旅"}
            </p>

            {/* 错误提示 */}
            {authError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                {authError}
              </div>
            )}

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              className="w-full p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent mb-3 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              autoFocus
              disabled={authLoading}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleAuth()}
              placeholder="密码"
              className="w-full p-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              disabled={authLoading}
            />
            <button
              onClick={handleAuth}
              disabled={authLoading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authLoading ? "处理中..." : (authMode === "login" ? "登录" : "注册")}
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={toggleAuthMode}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                disabled={authLoading}
              >
                {authMode === "login" ? "没有账号？点击注册" : "已有账号？点击登录"}
              </button>
            </div>

            {authMode === "register" && (
              <p className="text-xs text-neutral-400 mt-4 text-center">
                用户名 2-20 字符，密码至少 6 位
              </p>
            )}
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

