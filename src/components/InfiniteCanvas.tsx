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
import SpriteNode from "./nodes/SpriteNode";
import SuperAgentNode from "./nodes/SuperAgentNode";
import ImageModal from "./ImageModal";
import NodeToolbar from "./NodeToolbar";
import { CanvasContext } from "@/contexts/CanvasContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { TouchContextMenuProvider } from "./TouchContextMenu";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { saveCanvas, getUserCanvases, getCanvasById } from "@/app/actions/canvas";
import { registerUser, loginUser, getCurrentUser, logout } from "@/app/actions/user";
import { uploadImageToR2 } from "@/app/actions/storage";
import { Save, FolderOpen, User as UserIcon, LogOut, Wand2, Brain, Trash2, Smile, GalleryHorizontalEnd, GalleryVerticalEnd, Image as ImageIcon, X, MousePointer2, Hand, LayoutGrid, Ghost, Sparkles, Share2, Loader2 } from "lucide-react";
import exampleImages from "@/data/example-images.json";
import Gallery from "./Gallery";
import ModelCapabilityTip from "./ModelCapabilityTip";

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
  sprite: SpriteNode as any,
  superAgent: SuperAgentNode as any,
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

  // Slideshow Mode State (for publishing slideshow)
  const [slideshowMode, setSlideshowMode] = useState(false);
  const [slideshowSelections, setSlideshowSelections] = useState<Map<string, number>>(new Map());
  const [slideshowTitle, setSlideshowTitle] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Image Upload Placement State
  const [isPlacingImage, setIsPlacingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gallery Image Placement State (从画廊添加图片)
  const [pendingGalleryImage, setPendingGalleryImage] = useState<{ url: string; prompt: string } | null>(null);

  // Touch device state - 触摸设备点击放置节点
  const isTouchDevice = useIsTouchDevice();
  const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);

  // Drag and drop handlers for adding nodes
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Load canvas from localStorage on mount, or show examples for first visit
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
      // 不再自动加载示例图片，用户可以通过按钮手动导入
    } catch (error) {
      console.error("Failed to load canvas from localStorage:", error);
    } finally {
      setIsCanvasLoaded(true);
    }
  }, []);

  // Load example images manually
  const loadExampleImages = useCallback(() => {
    // 如果画布不为空，提示用户
    if (nodes.length > 0) {
      if (!confirm("当前画布有内容，导入示例图片将覆盖现有内容。是否继续？")) {
        return;
      }
    }

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

    // 延迟执行 fitView 以确保节点已渲染
    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.1 });
        console.log("📐 Centered view on example images");
      }
    }, 100);
  }, [setNodes, nodes.length, reactFlowInstance]);

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

  // Sprite 动画节点 (gif-creator 风格)
  const addSpriteNode = useCallback(() => {
    const newNode: Node = {
      id: `sprite-${Date.now()}`,
      type: "sprite",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      style: {
        width: 360,
      },
      data: {},
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  // 超级智能体节点 (提示词专家)
  const addSuperAgentNode = useCallback(() => {
    const newNode: Node = {
      id: `superAgent-${Date.now()}`,
      type: "superAgent",
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      style: {
        width: 450,
      },
      data: {},
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

  // 处理画布点击 - 在放置模式下确定位置并打开文件选择或放置画廊图片或创建节点
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    if (!reactFlowInstance) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    // 如果是触摸设备节点放置模式
    if (pendingNodeType) {
      const newNode: Node = {
        id: `${pendingNodeType}-${Date.now()}`,
        type: pendingNodeType,
        position,
        style: pendingNodeType === 'sprite' ? { width: 360 } : pendingNodeType === 'superAgent' ? { width: 450 } : undefined,
        data: pendingNodeType === 'imageGen'
          ? { prompt: '' }
          : pendingNodeType === 'agent'
          ? { userRequest: '' }
          : pendingNodeType === 'musicGen'
          ? { prompt: '', lyrics: '', numberOfSongs: 2 }
          : pendingNodeType === 'videoGen'
          ? { prompt: '', orientation: 'portrait' }
          : pendingNodeType === 'chat'
          ? { messages: [], systemPrompt: 'You are a helpful AI assistant that generates image prompts. When user asks for images, wrap your prompt suggestions in ```text\n[prompt text]\n``` blocks.' }
          : {},
      };
      setNodes((nds) => nds.concat(newNode));
      setPendingNodeType(null);
      return;
    }

    // 如果是画廊图片放置模式
    if (pendingGalleryImage) {
      const nodeId = `image-${Date.now()}`;
      const newNode: Node = {
        id: nodeId,
        type: "image",
        position,
        data: {
          imageUrl: pendingGalleryImage.url,
          prompt: pendingGalleryImage.prompt,
          isLoading: false,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setPendingGalleryImage(null);
      return;
    }

    // 如果是上传图片放置模式
    if (isPlacingImage) {
      pendingImagePositionRef.current = position;
      fileInputRef.current?.click();
    }
  }, [isPlacingImage, pendingGalleryImage, pendingNodeType, reactFlowInstance, setNodes]);

  // 取消放置模式
  const cancelPlacingImage = useCallback(() => {
    setIsPlacingImage(false);
    setPendingGalleryImage(null);
    setPendingNodeType(null);
    pendingImagePositionRef.current = null;
  }, []);

  // 从画廊添加图片 - 进入放置模式
  const handleGalleryImageClick = useCallback((imageUrl: string, prompt: string) => {
    setPendingGalleryImage({ url: imageUrl, prompt });
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
        style: type === 'sprite' ? { width: 360 } : type === 'superAgent' ? { width: 450 } : undefined,
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
          : type === 'sprite'
          ? {}
          : type === 'superAgent'
          ? {}
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

  // Clear local cache
  const clearLocalCache = useCallback(() => {
    if (confirm("确定要清空画布缓存吗？这将删除所有节点。")) {
      localStorage.removeItem(LOCALSTORAGE_KEY);
      setNodes([]);
      setEdges([]);
      setCurrentCanvasId(null);
      console.log("🗑️ Cleared local cache");
    }
  }, [setNodes]);

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

  // Toggle slideshow selection for a node
  const toggleSlideshowSelection = useCallback((nodeId: string) => {
    setSlideshowSelections(prev => {
      const newMap = new Map(prev);
      if (newMap.has(nodeId)) {
        // Remove this node and re-order remaining selections
        const removedOrder = newMap.get(nodeId)!;
        newMap.delete(nodeId);
        // Re-order: decrease order for items after the removed one
        newMap.forEach((order, id) => {
          if (order > removedOrder) {
            newMap.set(id, order - 1);
          }
        });
      } else {
        // Add with next order number
        const nextOrder = newMap.size + 1;
        newMap.set(nodeId, nextOrder);
      }
      return newMap;
    });
  }, []);

  // Enter slideshow mode
  const enterSlideshowMode = useCallback(() => {
    setSlideshowMode(true);
    setSlideshowSelections(new Map());
    setSlideshowTitle("");
    setPublishedUrl(null);
  }, []);

  // Exit slideshow mode
  const exitSlideshowMode = useCallback(() => {
    setSlideshowMode(false);
    setSlideshowSelections(new Map());
    setSlideshowTitle("");
    setPublishedUrl(null);
  }, []);

  // Publish slideshow
  const publishSlideshow = useCallback(async () => {
    if (slideshowSelections.size === 0) {
      alert("请至少选择一张图片");
      return;
    }
    if (!slideshowTitle.trim()) {
      alert("请输入幻灯片标题");
      return;
    }

    setIsPublishing(true);
    try {
      // Get image URLs in order
      const orderedNodeIds = Array.from(slideshowSelections.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([nodeId]) => nodeId);

      const imageUrls: string[] = [];
      const currentNodes = nodesRef.current;

      for (const nodeId of orderedNodeIds) {
        const node = currentNodes.find(n => n.id === nodeId);
        if (node && node.data?.imageUrl && typeof node.data.imageUrl === 'string') {
          imageUrls.push(node.data.imageUrl as string);
        }
      }

      if (imageUrls.length === 0) {
        alert("选中的节点没有有效的图片");
        return;
      }

      // Call API to create slideshow
      const response = await fetch("/api/slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: slideshowTitle.trim(),
          images: imageUrls,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setPublishedUrl(result.url);
      } else {
        alert(result.error || "发布失败");
      }
    } catch (error) {
      console.error("Publish slideshow error:", error);
      alert("发布失败，请重试");
    } finally {
      setIsPublishing(false);
    }
  }, [slideshowSelections, slideshowTitle]);

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
    // Slideshow mode
    slideshowMode,
    slideshowSelections,
    toggleSlideshowSelection,
  }), [addImageNode, updateImageNode, addMusicNode, addVideoNode, addStickerNode, getConnectedImageNodes, getNode, openImageModal, getNodes, getEdges, slideshowMode, slideshowSelections, toggleSlideshowSelection]);

  return (
    <div className="w-full h-screen relative bg-neutral-50 dark:bg-black">
      {/* Toolbar - Ultra Transparent Glass */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 p-2 rounded-full bg-white/[0.02] dark:bg-white/[0.02] backdrop-blur-[2px] border border-neutral-200/50 dark:border-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.02)]">
        <button
          onClick={handleSave}
          className="p-2 rounded-full hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
          title="Save Canvas to Cloud"
        >
          <Save className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
        </button>
        <div className="relative group">
          <button className="p-2 rounded-full hover:bg-white/30 dark:hover:bg-white/10 transition-colors" title="Load Canvas from Cloud">
            <FolderOpen className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
          </button>
          {/* Dropdown for history - Glass style */}
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-48 bg-white/80 dark:bg-black/60 backdrop-blur-[20px] backdrop-saturate-[180%] rounded-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] border border-white/20 dark:border-white/10 hidden group-hover:block max-h-60 overflow-y-auto">
            {savedCanvases.length === 0 ? (
              <div className="p-3 text-xs text-neutral-500 dark:text-neutral-400 text-center">No saved canvases</div>
            ) : (
              savedCanvases.map(c => (
                <div
                  key={c.id}
                  onClick={() => loadCanvas(c.id)}
                  className="p-2 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer text-xs truncate border-b border-white/10 last:border-0 text-neutral-700 dark:text-neutral-200"
                >
                  {c.name}
                </div>
              ))
            )}
          </div>
        </div>
        <button
          onClick={() => setIsGalleryOpen(true)}
          className="p-2 rounded-full hover:bg-purple-500/20 transition-colors text-purple-600 dark:text-purple-400"
          title="创意画廊"
        >
          <GalleryHorizontalEnd className="w-5 h-5" />
        </button>
        <button
          onClick={() => setSelectionMode(!selectionMode)}
          className={`p-2 rounded-full transition-colors ${
            selectionMode
              ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
              : "hover:bg-white/30 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-200"
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
            className="p-2 rounded-full hover:bg-red-500/20 transition-colors text-red-600 dark:text-red-400"
            title="删除选中节点"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={loadExampleImages}
          className="p-2 rounded-full hover:bg-blue-500/20 transition-colors text-blue-600 dark:text-blue-400"
          title="导入示例图片 (27张)"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
        <button
          onClick={enterSlideshowMode}
          className="p-2 rounded-full hover:bg-green-500/20 transition-colors text-green-600 dark:text-green-400"
          title="发布幻灯片"
        >
          <Share2 className="w-5 h-5" />
        </button>
        <a
          href="/gallery"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-full hover:bg-purple-500/20 transition-colors text-purple-600 dark:text-purple-400"
          title="作品画廊"
        >
          <GalleryVerticalEnd className="w-5 h-5" />
        </a>
        <button
          onClick={clearLocalCache}
          className="p-2 rounded-full hover:bg-red-500/20 transition-colors text-red-600 dark:text-red-400"
          title="清空画布"
        >
          <Trash2 className="w-5 h-5" />
        </button>
        <div className="w-px bg-white/20 dark:bg-white/10 my-1" />
        {userId ? (
          <div className="relative group">
            <button className="p-2 rounded-full hover:bg-white/30 dark:hover:bg-white/10 transition-colors flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{username}</span>
            </button>
            {/* User dropdown - Glass style */}
            <div className="absolute top-full mt-2 right-0 w-48 bg-white/80 dark:bg-black/60 backdrop-blur-[20px] backdrop-saturate-[180%] rounded-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] border border-white/20 dark:border-white/10 hidden group-hover:block">
              <div className="p-3 border-b border-white/10">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Logged in as</p>
                <p className="text-sm font-medium truncate text-neutral-800 dark:text-neutral-100">{username}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full p-3 hover:bg-red-500/10 text-left text-sm flex items-center gap-2 text-red-600 dark:text-red-400 rounded-b-xl"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsUserModalOpen(true)}
            className="p-2 rounded-full hover:bg-white/30 dark:hover:bg-white/10 transition-colors"
            title="Login"
          >
            <UserIcon className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
          </button>
        )}
      </div>

      {/* Model Capability Tip */}
      <ModelCapabilityTip />

      {/* Node Toolbar */}
      <NodeToolbar
        onDragStart={onDragStart}
        onImageUploadClick={handleToolbarImageUploadClick}
        onNodeTypeSelect={(nodeType) => setPendingNodeType(nodeType)}
      />

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

      {/* Slideshow Mode Panel */}
      {slideshowMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white dark:bg-neutral-900 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-700 p-4 min-w-[400px]">
          {publishedUrl ? (
            // 发布成功状态
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-green-600">
                <Share2 className="w-5 h-5" />
                <span className="font-semibold">发布成功！</span>
              </div>
              <div className="flex items-center gap-2 w-full">
                <input
                  type="text"
                  value={`${window.location.origin}${publishedUrl}`}
                  readOnly
                  className="flex-1 px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-sm font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${publishedUrl}`);
                    alert("链接已复制！");
                  }}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  复制链接
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(publishedUrl, "_blank")}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  打开预览
                </button>
                <button
                  onClick={exitSlideshowMode}
                  className="px-4 py-2 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  完成
                </button>
              </div>
            </div>
          ) : (
            // 选择和编辑状态
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-green-600" />
                  <span className="font-semibold text-neutral-800 dark:text-neutral-100">发布幻灯片</span>
                </div>
                <button
                  onClick={exitSlideshowMode}
                  className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
                  title="取消"
                >
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>

              <div className="text-sm text-neutral-500">
                点击图片节点选择并排序，已选择 <span className="font-bold text-green-600">{slideshowSelections.size}</span> 张图片
              </div>

              <input
                type="text"
                value={slideshowTitle}
                onChange={(e) => setSlideshowTitle(e.target.value)}
                placeholder="输入幻灯片标题..."
                className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />

              <div className="flex gap-2">
                <button
                  onClick={publishSlideshow}
                  disabled={isPublishing || slideshowSelections.size === 0 || !slideshowTitle.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      发布中...
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      发布
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSlideshowSelections(new Map())}
                  className="px-4 py-2.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded-xl text-sm font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                >
                  清空选择
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Placement Mode Overlay - 图片/画廊图片/节点类型放置 */}
      {(isPlacingImage || pendingGalleryImage || pendingNodeType) && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onClick={handleCanvasClick}
        >
          {/* Top hint bar */}
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 ${
            pendingNodeType ? 'bg-blue-500/90' : pendingGalleryImage ? 'bg-purple-500/90' : 'bg-cyan-500/90'
          } backdrop-blur-sm text-white px-4 py-2.5 rounded-full shadow-lg`}>
            {pendingNodeType ? (
              <Wand2 className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {pendingNodeType
                ? `点击画布放置 ${pendingNodeType === 'imageGen' ? 'Generator' : pendingNodeType === 'agent' ? 'Agent' : pendingNodeType === 'superAgent' ? 'Prompt Expert' : pendingNodeType === 'musicGen' ? 'Music' : pendingNodeType === 'videoGen' ? 'Video' : pendingNodeType === 'chat' ? 'Chat' : pendingNodeType === 'sprite' ? 'Sprite' : pendingNodeType} 节点`
                : pendingGalleryImage
                ? '点击画布放置画廊图片'
                : '点击画布选择图片放置位置'}
            </span>
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

      <TouchContextMenuProvider>
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
              // 注意：不能开启 onlyRenderVisibleElements，否则节点离开视口时会卸载，导致轮询状态丢失
              onlyRenderVisibleElements={false}
              nodesFocusable={false}            // 禁用节点焦点，减少事件监听
              edgesFocusable={false}            // 禁用边焦点
              elevateNodesOnSelect={false}      // 选中时不提升 z-index，避免重排
              nodeDragThreshold={5}             // 拖动阈值，减少误触发
              // 框选模式配置
              selectionOnDrag={selectionMode}   // 框选模式下拖动为选择
              panOnDrag={!selectionMode}        // 普通模式下拖动为平移
              // 触摸设备优化 - 双指始终可缩放
              zoomOnPinch={true}                // 双指捏合缩放
              panOnScroll={false}               // 滚轮不用于平移（PC端滚轮应该是缩放）
              zoomOnScroll={!isTouchDevice}     // PC端滚轮缩放，触摸设备禁用
              preventScrolling={true}           // 阻止页面滚动
            >
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          </CanvasContext.Provider>
        </AudioProvider>
      </TouchContextMenuProvider>

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
        onImageClick={handleGalleryImageClick}
      />
    </div>
  );
}

