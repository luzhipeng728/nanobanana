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
  BackgroundVariant,
} from "@xyflow/react";
import ImageGenNode from "./nodes/ImageGenNode";
import ImageNode from "./nodes/ImageNode";
import AgentNode from "./nodes/AgentNode";
import MusicGenNode from "./nodes/MusicGenNode";
import MusicNode from "./nodes/MusicNode";
import VideoGenNode from "./nodes/VideoGenNode";
import VideoNode from "./nodes/VideoNode";
import ChatNode from "./nodes/ChatNode";
import ChatAgentNode from "./nodes/ChatAgentNode";
import StickerGenNode from "./nodes/StickerGenNode";
import StickerNode from "./nodes/StickerNode";
import SpriteNode from "./nodes/SpriteNode";
import SuperAgentNode from "./nodes/SuperAgentNode";
import TTSGenNode from "./nodes/TTSGenNode";
import TTSNode from "./nodes/TTSNode";
import PPTGenNode from "./nodes/PPTGenNode";
import PPTEditorNode from "./nodes/PPTEditorNode";
import PPTNode from "./nodes/PPTNode";
import ResearchVideoGenNode from "./nodes/ResearchVideoGenNode";
import ResearchVideoEditorNode from "./nodes/ResearchVideoEditorNode";
import ResearchVideoNode from "./nodes/ResearchVideoNode";
import StoryVideoGenNode from "./nodes/StoryVideoGenNode";
import ImageModal from "./ImageModal";
import NodeToolbar, { type NodeType } from "./NodeToolbar";
import CanvasContextMenu from "./CanvasContextMenu";
import PromptPanel from "./PromptPanel";
import { CanvasContext } from "@/contexts/CanvasContext";
import { AudioProvider } from "@/contexts/AudioContext";
import { TouchContextMenuProvider } from "./TouchContextMenu";
import { useIsTouchDevice } from "@/hooks/useIsTouchDevice";
import { saveCanvas, getUserCanvases, getCanvasById } from "@/app/actions/canvas";
import { registerUser, loginUser, getCurrentUser, logout } from "@/app/actions/user";
import { uploadImageToR2 } from "@/app/actions/storage";
import { 
  Wand2, Image as ImageIcon, X, MousePointer2, Import, Loader2 
} from "lucide-react";
import exampleImages from "@/data/example-images.json";
import Gallery from "./Gallery";
import ModelCapabilityTip from "./ModelCapabilityTip";
import PageViewCounter from "./PageViewCounter";

// New Components
import { SlideshowPanel } from "./SlideshowPanel";
import { CanvasToolbar } from "./CanvasToolbar";
import { AuthModal } from "./AuthModal";
import ScrollytellingPreview from "./scrollytelling/ScrollytellingPreview";

const nodeTypes = {
  imageGen: ImageGenNode as any,
  image: ImageNode as any,
  agent: AgentNode as any,
  musicGen: MusicGenNode as any,
  music: MusicNode as any,
  videoGen: VideoGenNode as any,
  video: VideoNode as any,
  chat: ChatNode as any,
  chatAgent: ChatAgentNode as any,
  stickerGen: StickerGenNode as any,
  sticker: StickerNode as any,
  sprite: SpriteNode as any,
  superAgent: SuperAgentNode as any,
  ttsGen: TTSGenNode as any,
  tts: TTSNode as any,
  pptGen: PPTGenNode as any,
  pptEditor: PPTEditorNode as any,
  ppt: PPTNode as any,
  researchVideoGen: ResearchVideoGenNode as any,
  researchVideoEditor: ResearchVideoEditorNode as any,
  researchVideo: ResearchVideoNode as any,
  storyVideoGen: StoryVideoGenNode as any,
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
  const [authError, setAuthError] = useState("");
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

  // Selected Image Prompt Panel State
  const [selectedImagePrompt, setSelectedImagePrompt] = useState<{ prompt: string; label?: string } | null>(null);

  // Selection Mode State (for box selection)
  const [selectionMode, setSelectionMode] = useState(false);

  // Slideshow Mode State (for publishing slideshow)
  const [slideshowMode, setSlideshowMode] = useState(false);
  const [slideshowSelections, setSlideshowSelections] = useState<Map<string, number>>(new Map());
  const [slideshowTitle, setSlideshowTitle] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  // 讲解视频配置
  const [enableNarration, setEnableNarration] = useState(false);
  const [narrationSpeaker, setNarrationSpeaker] = useState("zh_female_vivi");
  const [narrationTransition, setNarrationTransition] = useState("fade");
  const [narrationStyle, setNarrationStyle] = useState("");
  const [narrationSpeed, setNarrationSpeed] = useState(1.0);
  // 视频生成进度
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{
    percent: number;
    steps: { index: number; step: string; status: string; text?: string }[];
    error?: string;
  } | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  // 一镜到底相关状态
  const [enableScrollytelling, setEnableScrollytelling] = useState(false);
  const [scrollytellingTheme, setScrollytellingTheme] = useState("");
  const [scrollytellingGenerating, setScrollytellingGenerating] = useState(false);
  const [showScrollytellingPreview, setShowScrollytellingPreview] = useState(false);
  const [scrollytellingImages, setScrollytellingImages] = useState<string[]>([]);
  const [scrollytellingPrompts, setScrollytellingPrompts] = useState<string[]>([]);

  // Image Upload Placement State
  const [isPlacingImage, setIsPlacingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gallery Image Placement State (从画廊添加图片)
  const [pendingGalleryImage, setPendingGalleryImage] = useState<{ url: string; prompt: string } | null>(null);

  // Touch device state - 触摸设备点击放置节点
  const isTouchDevice = useIsTouchDevice();
  const [pendingNodeType, setPendingNodeType] = useState<string | null>(null);

  // 导入幻灯片素材
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Drag and drop handlers for adding nodes
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Context menu state (右键菜单)
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const [videoUnlocked, setVideoUnlocked] = useState(false);

  // 读取 video 解锁状态
  useEffect(() => {
    const unlocked = localStorage.getItem('nanobanana-video-unlocked') === 'true';
    setVideoUnlocked(unlocked);
  }, []);

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

  // Load example images manually
  const loadExampleImages = useCallback(() => {
    if (nodes.length > 0) {
      if (!confirm("当前画布有内容，导入示例图片将覆盖现有内容。是否继续？")) {
        return;
      }
    }

    const COLS = 9;
    const NODE_WIDTH = 420;
    const NODE_HEIGHT = 260;
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
          label: `${img.category} - ${img.title}`,
        },
      };
    });

    setNodes(exampleNodes);

    setTimeout(() => {
      if (reactFlowInstance) {
        reactFlowInstance.fitView({ padding: 0.1 });
      }
    }, 100);
  }, [setNodes, nodes.length, reactFlowInstance]);

  // 导入幻灯片素材
  const importSlideshow = useCallback(async () => {
    if (!importInput.trim()) return;

    let slideshowId = importInput.trim();
    const urlMatch = slideshowId.match(/\/slides\/([a-zA-Z0-9-]+)/);
    if (urlMatch) {
      slideshowId = urlMatch[1];
    }

    setIsImporting(true);
    try {
      const res = await fetch(`/api/slideshow?id=${slideshowId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "获取幻灯片失败");
      }

      const data = await res.json();
      const images: string[] = data.images || [];
      const prompts: string[] = data.prompts || [];

      if (images.length === 0) {
        throw new Error("幻灯片没有图片");
      }

      const COLS = Math.min(images.length, 5);
      const NODE_WIDTH = 400;
      const NODE_HEIGHT = 300;
      const GAP_X = 40;
      const GAP_Y = 60;
      const existingMaxX = nodes.length > 0
        ? Math.max(...nodes.map(n => (n.position?.x || 0) + 500))
        : 50;
      const START_X = existingMaxX + 100;
      const START_Y = 80;

      const newNodes: Node[] = images.map((url, index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        const prompt = prompts[index] || "";

        return {
          id: `import-${Date.now()}-${index}`,
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
            imageUrl: url,
            prompt,
            timestamp: new Date().toLocaleString(),
            isLoading: false,
            label: prompt ? `${prompt.slice(0, 20)}...` : `${data.title} #${index + 1}`,
          },
        };
      });

      setNodes((nds) => [...nds, ...newNodes]);
      setIsImportModalOpen(false);
      setImportInput("");

      setTimeout(() => {
        if (reactFlowInstance) {
          reactFlowInstance.fitView({ padding: 0.1 });
        }
      }, 100);
    } catch (error) {
      alert(error instanceof Error ? error.message : "导入失败");
    } finally {
      setIsImporting(false);
    }
  }, [importInput, nodes, setNodes, reactFlowInstance]);

  // Auto-save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isCanvasLoaded) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      try {
        const canvasData = JSON.stringify({ nodes, edges });
        localStorage.setItem(LOCALSTORAGE_KEY, canvasData);
      } catch (error) {
        console.error("Failed to save canvas to localStorage:", error);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, isCanvasLoaded]);

  // Check Session
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

  // 存储待放置图片的位置
  const pendingImagePositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setIsPlacingImage(false);
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      setIsPlacingImage(false);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB');
      setIsPlacingImage(false);
      return;
    }

    const position = pendingImagePositionRef.current || {
      x: Math.random() * 500 + 100,
      y: Math.random() * 500 + 100,
    };

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
        label: "上传",
      },
    };
    setNodes((nds) => nds.concat(newNode));

    setIsPlacingImage(false);
    pendingImagePositionRef.current = null;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const imageUrl = await uploadImageToR2(formData);

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

    event.target.value = '';
  }, [setNodes]);

  const handleToolbarImageUploadClick = useCallback(() => {
    setIsPlacingImage(true);
  }, []);

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
        style: pendingNodeType === 'sprite'
          ? { width: 360 }
          : pendingNodeType === 'superAgent'
          ? { width: 450 }
          : pendingNodeType === 'chatAgent'
          ? { width: 550, height: 700 }
          : pendingNodeType === 'ttsGen'
          ? { width: 340 }
          : undefined,
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
          : pendingNodeType === 'chatAgent'
          ? {}
          : pendingNodeType === 'ttsGen'
          ? { text: '', speaker: 'zh_female_vivi', speed: 1.0 }
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

  const cancelPlacingImage = useCallback(() => {
    setIsPlacingImage(false);
    setPendingGalleryImage(null);
    setPendingNodeType(null);
    pendingImagePositionRef.current = null;
  }, []);

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

  // 右键菜单处理
  const handleContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    // 阻止默认右键菜单
    event.preventDefault();

    if (!reactFlowInstance) return;

    // 获取 flow 坐标
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    setContextMenuPosition({
      x: event.clientX,
      y: event.clientY,
      flowX: position.x,
      flowY: position.y,
    });
  }, [reactFlowInstance]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  // 从右键菜单添加节点
  const handleContextMenuSelectTool = useCallback((nodeType: NodeType, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position,
      style: nodeType === 'sprite'
        ? { width: 360 }
        : nodeType === 'superAgent'
        ? { width: 450 }
        : nodeType === 'chatAgent'
        ? { width: 550, height: 700 }
        : nodeType === 'chat'
        ? { width: 1000, height: 700 }
        : nodeType === 'ttsGen'
        ? { width: 340 }
        : undefined,
      data: nodeType === 'imageGen'
        ? { prompt: '' }
        : nodeType === 'agent'
        ? { userRequest: '' }
        : nodeType === 'musicGen'
        ? { prompt: '', lyrics: '', numberOfSongs: 2 }
        : nodeType === 'videoGen'
        ? { prompt: '', orientation: 'portrait' }
        : nodeType === 'chat'
        ? { messages: [], width: 1000, height: 700 }
        : nodeType === 'sprite'
        ? {}
        : nodeType === 'superAgent'
        ? {}
        : nodeType === 'chatAgent'
        ? {}
        : nodeType === 'ttsGen'
        ? { text: '', speaker: 'zh_female_vivi', speed: 1.0 }
        : {},
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  // 从右键菜单上传图片
  const handleContextMenuUploadImage = useCallback((position: { x: number; y: number }) => {
    pendingImagePositionRef.current = position;
    fileInputRef.current?.click();
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
        style: type === 'sprite'
          ? { width: 360 }
          : type === 'superAgent'
          ? { width: 450 }
          : type === 'chatAgent'
          ? { width: 550, height: 700 }
          : type === 'chat'
          ? { width: 1000, height: 700 }
          : type === 'ttsGen'
          ? { width: 340 }
          : type === 'researchVideoGen'
          ? { width: 400, height: 500 }
          : type === 'researchVideoEditor'
          ? { width: 800, height: 600 }
          : undefined,
        data: type === 'imageGen'
          ? { prompt: '' }
          : type === 'agent'
          ? { userRequest: '' }
          : type === 'musicGen'
          ? { prompt: '', lyrics: '', numberOfSongs: 2 }
          : type === 'videoGen'
          ? { prompt: '', orientation: 'portrait' }
          : type === 'chat'
          ? { messages: [], width: 1000, height: 700 }
          : type === 'sprite'
          ? {}
          : type === 'superAgent'
          ? {}
          : type === 'chatAgent'
          ? {}
          : type === 'ttsGen'
          ? { text: '', speaker: 'zh_female_vivi', speed: 1.0 }
          : type === 'researchVideoGen'
          ? { topic: '', speaker: 'zh_female_vivi', speed: 1.0, aspectRatio: '16:9' }
          : {},
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  // Auth handlers
  const handleLogin = async (password: string) => {
    const result = await loginUser(username.trim(), password);
    if (result.success && result.user) {
      setUserId(result.user.id);
      setUsername(result.user.username);
      setIsUserModalOpen(false);
      loadUserCanvases(result.user.id);
    } else {
      setAuthError(result.error || "登录失败");
    }
  };

  const handleRegister = async (password: string) => {
    const result = await registerUser(username.trim(), password);
      if (result.success && result.user) {
        setUserId(result.user.id);
        setUsername(result.user.username);
        setIsUserModalOpen(false);
        loadUserCanvases(result.user.id);
      } else {
      setAuthError(result.error || "注册失败");
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
      localStorage.setItem(LOCALSTORAGE_KEY, canvas.data);
    }
  };

  const clearLocalCache = useCallback(() => {
    if (confirm("确定要清空画布缓存吗？这将删除所有节点。")) {
      localStorage.removeItem(LOCALSTORAGE_KEY);
      setNodes([]);
      setEdges([]);
      setCurrentCanvasId(null);
    }
  }, [setNodes, setEdges]);

  const deleteSelectedNodes = useCallback((skipConfirm = false) => {
    const selectedNodes = nodes.filter(node => node.selected);
    if (selectedNodes.length === 0) {
      return;
    }

    const doDelete = () => {
      const selectedIds = new Set(selectedNodes.map(n => n.id));
      setNodes(nds => nds.filter(n => !selectedIds.has(n.id)));
      setEdges(eds => eds.filter((e: Edge) => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
    };

    if (skipConfirm || confirm(`确定要删除选中的 ${selectedNodes.length} 个节点吗？`)) {
      doDelete();
    }
  }, [nodes, setNodes, setEdges]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectionMode) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        deleteSelectedNodes(true); 
      }
      if (e.key === "Escape" && selectionMode) {
        setSelectionMode(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectionMode, deleteSelectedNodes]);

  // Helper functions for Context
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
    label?: string
  ): string => {
    const nodeId = `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node = {
      id: nodeId,
      type: "image",
      position,
      style: {
        width: 400,
        height: 400,
      },
      data: {
        imageUrl,
        prompt,
        timestamp: new Date().toLocaleString(),
        isLoading: !imageUrl,
        taskId,
        generationConfig,
        label,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

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

  const addTTSNode = useCallback((taskId: string, text: string, position: { x: number; y: number }): string => {
    const nodeId = `tts-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node = {
      id: nodeId,
      type: "tts",
      position,
      data: {
        taskId,
        text,
        isLoading: true,
      },
    };
    setNodes((nds) => nds.concat(newNode));
    return nodeId;
  }, [setNodes]);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const getConnectedImageNodes = useCallback((nodeId: string): Node[] => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(n => n.id === nodeId);
    if (!node) return [];
    const connectedEdges = currentEdges.filter((edge: Edge) => edge.target === nodeId);
    return connectedEdges
      .map((edge: Edge) => currentNodes.find(n => n.id === edge.source))
      .filter((n): n is Node => n !== undefined && (n.type === 'image' || n.type === 'chat'));
  }, []);

  const getNode = useCallback((nodeId: string) => {
    return nodesRef.current.find(n => n.id === nodeId);
  }, []);

  const openImageModal = useCallback((imageUrl: string, prompt?: string) => {
    setModalImageUrl(imageUrl);
    setModalPrompt(prompt);
    setIsImageModalOpen(true);
  }, []);

  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    if (selectedNodes.length === 1 && selectedNodes[0].type === 'image') {
      const node = selectedNodes[0];
      const prompt = node.data?.prompt as string | undefined;
      const label = node.data?.label as string | undefined;
      if (prompt && prompt.trim()) {
        setSelectedImagePrompt({ prompt, label });
        return;
      }
    }
    setSelectedImagePrompt(null);
  }, []);

  const toggleSlideshowSelection = useCallback((nodeId: string) => {
    setSlideshowSelections(prev => {
      const newMap = new Map(prev);
      if (newMap.has(nodeId)) {
        const removedOrder = newMap.get(nodeId)!;
        newMap.delete(nodeId);
        newMap.forEach((order, id) => {
          if (order > removedOrder) {
            newMap.set(id, order - 1);
          }
        });
      } else {
        const nextOrder = newMap.size + 1;
        newMap.set(nodeId, nextOrder);
      }
      return newMap;
    });
  }, []);

  const enterSlideshowMode = useCallback(() => {
    setSlideshowMode(true);
    setSlideshowSelections(new Map());
    setSlideshowTitle("");
    setPublishedUrl(null);
  }, []);

  const exitSlideshowMode = useCallback(() => {
    setSlideshowMode(false);
    setSlideshowSelections(new Map());
    setSlideshowTitle("");
    setPublishedUrl(null);
    setEnableNarration(false);
    setNarrationSpeaker("zh_female_vivi");
    setNarrationTransition("fade");
    setNarrationStyle("");
    setVideoGenerating(false);
    setVideoProgress(null);
    setGeneratedVideoUrl(null);
    // 重置一镜到底状态
    setEnableScrollytelling(false);
    setScrollytellingTheme("");
    setScrollytellingGenerating(false);
  }, []);

  // 生成一镜到底网页
  const handleGenerateScrollytelling = useCallback(() => {
    // 无图片模式：需要标题作为用户提示词
    if (slideshowSelections.size === 0) {
      if (!slideshowTitle.trim()) {
        alert("无图片模式下请输入主题描述");
        return;
      }
      // 无图片模式：直接打开预览，使用标题作为 userPrompt
      setScrollytellingImages([]);
      setScrollytellingPrompts([]);
      setShowScrollytellingPreview(true);
      setScrollytellingGenerating(true);
      return;
    }

    // 有图片模式：按顺序收集选中图片的 URL 和 prompt
    const orderedNodeIds = Array.from(slideshowSelections.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([nodeId]) => nodeId);

    const imageUrls: string[] = [];
    const imagePrompts: string[] = [];
    const currentNodes = nodesRef.current;

    for (const nodeId of orderedNodeIds) {
      const node = currentNodes.find(n => n.id === nodeId);
      if (node && node.data?.imageUrl && typeof node.data.imageUrl === 'string') {
        imageUrls.push(node.data.imageUrl as string);
        // 收集图片的 prompt 描述
        imagePrompts.push((node.data.prompt as string) || '');
      }
    }

    if (imageUrls.length === 0) {
      // 选中的节点没有有效图片，但可以走无图片模式
      if (!slideshowTitle.trim()) {
        alert("选中的节点没有有效图片，请输入主题描述以使用无图片模式");
        return;
      }
      setScrollytellingImages([]);
      setScrollytellingPrompts([]);
      setShowScrollytellingPreview(true);
      setScrollytellingGenerating(true);
      return;
    }

    // 设置图片、prompts 并打开预览
    setScrollytellingImages(imageUrls);
    setScrollytellingPrompts(imagePrompts);
    setShowScrollytellingPreview(true);
    setScrollytellingGenerating(true);
  }, [slideshowSelections, slideshowTitle]);

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
      const orderedNodeIds = Array.from(slideshowSelections.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([nodeId]) => nodeId);

      const imageUrls: string[] = [];
      const prompts: string[] = [];
      const currentNodes = nodesRef.current;

      for (const nodeId of orderedNodeIds) {
        const node = currentNodes.find(n => n.id === nodeId);
        if (node && node.data?.imageUrl && typeof node.data.imageUrl === 'string') {
          imageUrls.push(node.data.imageUrl as string);
          prompts.push((node.data.prompt as string) || '');
        }
      }

      if (imageUrls.length === 0) {
        alert("选中的节点没有有效的图片");
        return;
      }

      const response = await fetch("/api/slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: slideshowTitle.trim(),
          images: imageUrls,
          prompts: prompts,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setPublishedUrl(result.url);

        if (enableNarration) {
          setIsPublishing(false);
          setVideoGenerating(true);
          setVideoProgress({ percent: 0, steps: [] });

          try {
            const videoResponse = await fetch("/api/slideshow/generate-video", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slideshowId: result.id,
                speaker: narrationSpeaker,
                transition: narrationTransition,
                style: narrationStyle || undefined,
                speed: narrationSpeed,
              }),
            });

            if (!videoResponse.ok) {
              throw new Error("视频生成请求失败");
            }

            const reader = videoResponse.body?.getReader();
            if (!reader) throw new Error("无法读取响应流");

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === 'progress') {
                      setVideoProgress(prev => ({
                        percent: data.percent ?? prev?.percent ?? 0,
                        steps: data.steps ?? prev?.steps ?? [],
                      }));
                    } else if (data.type === 'complete') {
                      setVideoProgress(prev => ({ ...prev!, percent: 100 }));
                      setGeneratedVideoUrl(data.videoUrl);
                      setVideoGenerating(false);
                    } else if (data.type === 'error') {
                      setVideoProgress(prev => ({ ...prev!, error: data.message }));
                      setVideoGenerating(false);
                    }
                  } catch (e) {
                    console.error("Parse SSE error:", e);
                  }
                }
              }
            }
          } catch (error) {
            console.error("Video generation error:", error);
            setVideoProgress(prev => ({
              ...prev!,
              error: error instanceof Error ? error.message : "视频生成失败",
            }));
            setVideoGenerating(false);
          }
        }
      } else {
        alert(result.error || "发布失败");
      }
    } catch (error) {
      console.error("Publish slideshow error:", error);
      alert("发布失败，请重试");
    } finally {
      if (!enableNarration) {
        setIsPublishing(false);
      }
    }
  }, [slideshowSelections, slideshowTitle, enableNarration, narrationSpeaker, narrationTransition, narrationStyle, narrationSpeed]);

  const getNodes = useCallback(() => nodesRef.current, []);
  const getEdges = useCallback(() => edgesRef.current, []);

  const canvasContextValue = useMemo(() => ({
    addImageNode,
    updateImageNode,
    addMusicNode,
    addVideoNode,
    addStickerNode,
    addTTSNode,
    getConnectedImageNodes,
    getSelectedImageNodes: () => [],
    getNode,
    openImageModal,
    getNodes,
    getEdges,
    slideshowMode,
    slideshowSelections,
    toggleSlideshowSelection,
  }), [addImageNode, updateImageNode, addMusicNode, addVideoNode, addStickerNode, addTTSNode, getConnectedImageNodes, getNode, openImageModal, getNodes, getEdges, slideshowMode, slideshowSelections, toggleSlideshowSelection]);

  return (
    <div className="w-full h-screen relative bg-neutral-50 dark:bg-black">
      <CanvasToolbar
        userId={userId}
        username={username}
        savedCanvases={savedCanvases}
        selectionMode={selectionMode}
        onSave={handleSave}
        onLoadCanvas={loadCanvas}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onToggleSelectionMode={() => setSelectionMode(!selectionMode)}
        onDeleteSelected={() => deleteSelectedNodes(false)}
        onLoadExamples={loadExampleImages}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onEnterSlideshow={enterSlideshowMode}
        onClearCache={clearLocalCache}
        onLogout={handleLogout}
        onOpenAuth={() => setIsUserModalOpen(true)}
      />

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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-blue-500/90 backdrop-blur-sm text-white px-4 py-2.5 rounded-full shadow-lg animate-slide-up">
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
        <SlideshowPanel
          videoGenerating={videoGenerating}
          videoProgress={videoProgress}
          publishedUrl={publishedUrl}
          generatedVideoUrl={generatedVideoUrl}
          slideshowSelections={slideshowSelections}
          slideshowTitle={slideshowTitle}
          setSlideshowTitle={setSlideshowTitle}
          enableNarration={enableNarration}
          setEnableNarration={setEnableNarration}
          narrationSpeaker={narrationSpeaker}
          setNarrationSpeaker={setNarrationSpeaker}
          narrationSpeed={narrationSpeed}
          setNarrationSpeed={setNarrationSpeed}
          narrationTransition={narrationTransition}
          setNarrationTransition={setNarrationTransition}
          narrationStyle={narrationStyle}
          setNarrationStyle={setNarrationStyle}
          isPublishing={isPublishing}
          onPublish={publishSlideshow}
          onExit={exitSlideshowMode}
          onClearSelections={() => setSlideshowSelections(new Map())}
          // 一镜到底相关 props
          enableScrollytelling={enableScrollytelling}
          setEnableScrollytelling={setEnableScrollytelling}
          scrollytellingTheme={scrollytellingTheme}
          setScrollytellingTheme={setScrollytellingTheme}
          onGenerateScrollytelling={handleGenerateScrollytelling}
          scrollytellingGenerating={scrollytellingGenerating}
        />
      )}

      {/* Placement Mode Overlay */}
      {(isPlacingImage || pendingGalleryImage || pendingNodeType) && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onClick={handleCanvasClick}
        >
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 ${
            pendingNodeType ? 'bg-blue-500/90' : pendingGalleryImage ? 'bg-purple-500/90' : 'bg-cyan-500/90'
          } backdrop-blur-sm text-white px-4 py-2.5 rounded-full shadow-lg animate-fade-in`}>
            {pendingNodeType ? (
              <Wand2 className="w-4 h-4" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {pendingNodeType
                ? `点击画布放置 ${pendingNodeType === 'imageGen' ? 'Generator' : pendingNodeType === 'agent' ? 'Agent' : pendingNodeType === 'superAgent' ? 'Prompt Expert' : pendingNodeType === 'musicGen' ? 'Music' : pendingNodeType === 'videoGen' ? 'Video' : pendingNodeType === 'chat' ? 'Chat' : pendingNodeType === 'sprite' ? 'Sprite' : pendingNodeType === 'chatAgent' ? 'Agent Chat' : pendingNodeType === 'ttsGen' ? 'TTS' : pendingNodeType} 节点`
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
              onSelectionChange={handleSelectionChange}
              onPaneContextMenu={handleContextMenu}
              onPaneClick={closeContextMenu}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.1}
              maxZoom={4}
              className="bg-neutral-50 dark:bg-black"
              onlyRenderVisibleElements={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elevateNodesOnSelect={false}
              nodeDragThreshold={5}
              selectionOnDrag={selectionMode}
              panOnDrag={!selectionMode}
              zoomOnPinch={true}
              panOnScroll={false}
              zoomOnScroll={!isTouchDevice}
              preventScrolling={true}
            >
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          </CanvasContext.Provider>
        </AudioProvider>
      </TouchContextMenuProvider>

      <AuthModal
        isOpen={isUserModalOpen && !userId && !isLoading}
        onClose={() => setIsUserModalOpen(false)}
        userId={userId}
        username={username}
        setUsername={setUsername}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onLogout={handleLogout}
        isLoading={isLoading || false}
        authError={authError}
        setAuthError={setAuthError}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-xl shadow-2xl animate-pulse">
            <p className="text-sm text-neutral-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading Canvas...
            </p>
          </div>
        </div>
      )}

      {/* Selected Image Prompt Panel */}
      {selectedImagePrompt && (
        <PromptPanel
          prompt={selectedImagePrompt.prompt}
          label={selectedImagePrompt.label}
          onClose={() => setSelectedImagePrompt(null)}
        />
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

      {/* Right-click Context Menu */}
      <CanvasContextMenu
        position={contextMenuPosition}
        onClose={closeContextMenu}
        onSelectTool={handleContextMenuSelectTool}
        onUploadImage={handleContextMenuUploadImage}
        videoUnlocked={videoUnlocked}
      />

      {/* 导入幻灯片弹窗 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 w-[400px] shadow-2xl border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100">
                导入幻灯片素材
              </h3>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              粘贴幻灯片链接或 ID，快速导入所有图片到画布
            </p>

            <input
              type="text"
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="https://canvas.luzhipeng.com/slides/xxx 或直接输入 ID"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 mb-4"
              onKeyDown={(e) => e.key === "Enter" && importSlideshow()}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                取消
              </button>
              <button
                onClick={importSlideshow}
                disabled={isImporting || !importInput.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Import className="w-4 h-4" />
                    导入
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一镜到底网页预览 */}
      <ScrollytellingPreview
        isOpen={showScrollytellingPreview}
        onClose={() => {
          setShowScrollytellingPreview(false);
          setScrollytellingGenerating(false);
        }}
        images={scrollytellingImages}
        prompts={scrollytellingPrompts}
        title={slideshowTitle}
        initialTheme={scrollytellingTheme}
      />

      {/* 右下角访问计数 */}
      <div className="fixed bottom-4 right-4 bg-white/80 dark:bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg border border-neutral-200/50 dark:border-white/10 z-50">
        <PageViewCounter page="/" label="次访问" />
      </div>
    </div>
  );
}