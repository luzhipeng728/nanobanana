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
import { useTheme } from "@/contexts/ThemeContext";
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
  // Theme
  const { theme } = useTheme();

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
  const [enableLoopVideo, setEnableLoopVideo] = useState(false);
  const [loopVideoModel, setLoopVideoModel] = useState<'lite' | 'pro'>('lite');
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

  const handleRegister = async (password: string, inviteCode: string) => {
    const result = await registerUser(
      username.trim(),
      password,
      inviteCode.trim().toUpperCase()
    );
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

  const handleFitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.1 });
    }
  }, [reactFlowInstance]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectionMode) {
        e.preventDefault();
        deleteSelectedNodes(true); 
      }
      
      if (e.key === "Escape") {
        if (selectionMode) setSelectionMode(false);
      }

      // Shortcuts
      if (e.code === "Space") {
        e.preventDefault();
        setSelectionMode(prev => !prev);
      }
      if (e.key === "v" || e.key === "V") {
        setSelectionMode(true);
      }
      if (e.key === "h" || e.key === "H") {
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
                enableLoopVideo,
                loopVideoModel,
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
  }, [slideshowSelections, slideshowTitle, enableNarration, narrationSpeaker, narrationTransition, narrationStyle, narrationSpeed, enableLoopVideo, loopVideoModel]);

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

  // Theme-based background colors
  const canvasBgClass = theme === 'light'
    ? 'bg-[#fdfbf7]'
    : theme === 'glass-dark'
    ? 'bg-[#080808]'
    : 'bg-[#050508]';

  const dotColor = theme === 'light'
    ? 'rgba(0, 0, 0, 0.08)'
    : theme === 'glass-dark'
    ? 'rgba(255, 255, 255, 0.04)'
    : 'rgba(0, 245, 255, 0.15)';

  return (
    <div className={`w-full h-screen relative ${canvasBgClass}`}>
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
        onFitView={handleFitView}
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

      {/* Selection Mode Indicator - Neo-Cyber 风格 */}
      {selectionMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-slide-up">
          <div className="relative group">
            {/* 霓虹光晕背景 */}
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />

            {/* 主容器 */}
            <div className="relative flex items-center gap-4 px-5 py-3 bg-[#0a0a12]/95 border border-cyan-500/30 rounded-xl shadow-[0_0_30px_rgba(0,245,255,0.3)]">
              {/* 顶部装饰线 */}
              <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

              {/* 左侧图标 */}
              <div className="flex items-center justify-center w-8 h-8 bg-cyan-500/20 rounded-lg border border-cyan-500/30 shadow-[0_0_10px_rgba(0,245,255,0.3)]">
                <MousePointer2 className="w-4 h-4 text-cyan-400" />
              </div>

              {/* 文本 */}
              <div className="flex flex-col">
                <span className="font-cyber text-xs font-bold tracking-wider uppercase text-cyan-400">SELECT MODE</span>
                <span className="text-[10px] text-white/50">拖动框选 · Delete 删除</span>
              </div>

              {/* 分隔线 */}
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent" />

              {/* 关闭按钮 */}
              <button
                onClick={() => setSelectionMode(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                title="退出选择模式"
              >
                <X className="w-4 h-4 text-white/70 hover:text-red-400" />
              </button>
            </div>
          </div>
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
          // 循环微动视频
          enableLoopVideo={enableLoopVideo}
          setEnableLoopVideo={setEnableLoopVideo}
          loopVideoModel={loopVideoModel}
          setLoopVideoModel={setLoopVideoModel}
        />
      )}

      {/* Placement Mode Overlay - Neo-Cyber 风格 */}
      {(isPlacingImage || pendingGalleryImage || pendingNodeType) && (
        <div
          className="absolute inset-0 z-20 cursor-crosshair"
          onClick={handleCanvasClick}
        >
          {/* 扫描线遮罩 */}
          <div className="absolute inset-0 cyber-scanline opacity-10 pointer-events-none" />

          {/* 顶部提示条 */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 animate-fade-in">
            <div className="relative">
              {/* 霓虹光晕效果 */}
              <div className={`absolute -inset-1 rounded-xl blur-lg opacity-50 ${
                pendingNodeType ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                pendingGalleryImage ? 'bg-gradient-to-r from-pink-500 to-orange-500' :
                'bg-gradient-to-r from-cyan-500 to-purple-500'
              }`} />

              {/* 主容器 */}
              <div className="relative flex items-center gap-4 px-5 py-3 bg-[#0a0a12]/95 border border-cyan-500/30 rounded-xl shadow-[0_0_30px_rgba(0,245,255,0.3)]">
                {/* 顶部装饰线 */}
                <div className={`absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent ${
                  pendingNodeType ? 'via-purple-500/50' :
                  pendingGalleryImage ? 'via-pink-500/50' :
                  'via-cyan-500/50'
                } to-transparent`} />

                {/* 左侧图标 */}
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg border ${
                  pendingNodeType ? 'bg-purple-500/20 border-purple-500/30 shadow-[0_0_15px_rgba(191,0,255,0.3)]' :
                  pendingGalleryImage ? 'bg-pink-500/20 border-pink-500/30 shadow-[0_0_15px_rgba(255,0,170,0.3)]' :
                  'bg-cyan-500/20 border-cyan-500/30 shadow-[0_0_15px_rgba(0,245,255,0.3)]'
                }`}>
                  {pendingNodeType ? (
                    <Wand2 className="w-5 h-5 text-purple-400" />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-cyan-400" />
                  )}
                </div>

                {/* 文本 */}
                <div className="flex flex-col">
                  <span className={`font-cyber text-xs font-bold tracking-wider uppercase ${
                    pendingNodeType ? 'text-purple-400' :
                    pendingGalleryImage ? 'text-pink-400' :
                    'text-cyan-400'
                  }`}>
                    {pendingNodeType
                      ? `PLACE ${pendingNodeType === 'imageGen' ? 'IMAGE GEN' : pendingNodeType === 'agent' ? 'AGENT' : pendingNodeType === 'superAgent' ? 'PROMPT EXPERT' : pendingNodeType === 'musicGen' ? 'MUSIC GEN' : pendingNodeType === 'videoGen' ? 'VIDEO GEN' : pendingNodeType === 'chat' ? 'CHAT' : pendingNodeType === 'sprite' ? 'SPRITE' : pendingNodeType === 'chatAgent' ? 'AGENT CHAT' : pendingNodeType === 'ttsGen' ? 'TTS' : pendingNodeType.toUpperCase()}`
                      : pendingGalleryImage
                      ? 'PLACE GALLERY IMAGE'
                      : 'PLACE UPLOAD IMAGE'}
                  </span>
                  <span className="text-[10px] text-white/50">点击画布任意位置放置</span>
                </div>

                {/* 分隔线 */}
                <div className="w-px h-8 bg-gradient-to-b from-transparent via-white/20 to-transparent" />

                {/* 取消按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelPlacingImage();
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 transition-all text-white/70 hover:text-red-400 text-xs font-medium"
                  title="取消"
                >
                  <X className="w-4 h-4" />
                  <span>CANCEL</span>
                </button>
              </div>
            </div>
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
              className={`!${canvasBgClass}`}
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
              <Controls className={
                theme === 'light'
                  ? "!bg-white/90 !border-neutral-200 !shadow-lg [&>button]:!bg-white [&>button]:!border-neutral-200 [&>button]:!text-neutral-600 [&>button:hover]:!bg-neutral-100"
                  : theme === 'glass-dark'
                  ? "!bg-[#1a1a1a]/80 !border-white/10 !shadow-xl [&>button]:!bg-[#1a1a1a] [&>button]:!border-white/10 [&>button]:!text-white/70 [&>button:hover]:!bg-white/10"
                  : "!bg-[#0a0a12] !border-cyan-500/20 !shadow-[0_0_20px_rgba(0,245,255,0.1)] [&>button]:!bg-[#0a0a12] [&>button]:!border-cyan-500/20 [&>button]:!text-cyan-400 [&>button:hover]:!bg-cyan-500/10"
              } />
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={dotColor} />
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

      {/* Loading State - Neo-Cyber 风格 */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#050508]/95 backdrop-blur-xl">
          {/* 背景网格 */}
          <div className="absolute inset-0 cyber-grid opacity-30" />
          {/* 扫描线 */}
          <div className="absolute inset-0 cyber-scanline opacity-20" />

          <div className="relative">
            {/* 外圈光晕 */}
            <div className="absolute -inset-12 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 rounded-full blur-3xl animate-neon-pulse" />

            {/* 主卡片 */}
            <div className="relative bg-[#0a0a12]/90 border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(0,245,255,0.2)] overflow-hidden">
              {/* 顶部渐变装饰条 */}
              <div className="h-[2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500" />

              {/* 角落装饰 */}
              <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-cyan-500/50" />
              <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-cyan-500/50" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-cyan-500/50" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-cyan-500/50" />

              <div className="px-10 py-8 flex flex-col items-center gap-5">
                {/* 旋转加载动画 */}
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-purple-500 cyber-loading-ring" />
                  <div className="absolute inset-2 rounded-full border border-white/5" />
                  <Loader2 className="absolute inset-0 m-auto w-6 h-6 text-cyan-500 animate-spin" />
                </div>

                {/* 文本 */}
                <div className="text-center">
                  <p className="font-cyber text-sm font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400">
                    LOADING CANVAS
                  </p>
                  <p className="font-mono text-[10px] text-cyan-400/60 mt-2">INITIALIZING SYSTEM...</p>
                </div>
              </div>
            </div>
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

      {/* 导入幻灯片弹窗 - Neo-Cyber 风格 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050508]/90 backdrop-blur-xl animate-fade-in">
          {/* 背景效果 */}
          <div className="absolute inset-0 cyber-grid opacity-20" />
          <div className="absolute inset-0 cyber-scanline opacity-10" />

          <div className="relative w-[420px] animate-scale-in">
            {/* 外部霓虹光晕 */}
            <div className="absolute -inset-4 bg-gradient-to-r from-orange-500/20 via-amber-500/20 to-yellow-500/20 rounded-2xl blur-2xl" />

            {/* 主弹窗 */}
            <div className="relative bg-[#0a0a12]/95 rounded-2xl shadow-[0_0_40px_rgba(255,107,0,0.2)] overflow-hidden border border-orange-500/30">
              {/* 顶部渐变装饰 */}
              <div className="h-20 bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-yellow-500/10 relative">
                <div className="absolute inset-0 cyber-grid opacity-30" />
                {/* 顶部边框 */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500" />
                {/* 角落装饰 */}
                <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-orange-500/50" />
                <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-orange-500/50" />

                {/* 图标 */}
                <div className="absolute -bottom-6 left-6">
                  <div className="w-14 h-14 rounded-xl bg-[#0a0a12] border-2 border-orange-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(255,107,0,0.4)]">
                    <Import className="w-6 h-6 text-orange-400" />
                  </div>
                </div>
                {/* 关闭按钮 */}
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 transition-all"
                >
                  <X className="w-4 h-4 text-white/70 hover:text-red-400" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="p-6 pt-10">
                <h3 className="font-cyber text-lg font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400 mb-2">
                  IMPORT SLIDES
                </h3>
                <p className="text-xs text-white/50 mb-5">
                  粘贴幻灯片链接或 ID，快速导入所有图片到画布
                </p>

                <div className="relative mb-5 group">
                  {/* 发光边框效果 */}
                  <div className="absolute -inset-[1px] bg-gradient-to-r from-orange-500/0 via-orange-500/20 to-orange-500/0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                  <input
                    type="text"
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder="https://canvas.luzhipeng.com/slides/xxx"
                    className="relative w-full px-4 py-3.5 rounded-xl bg-[#050508] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_20px_rgba(255,107,0,0.15),inset_0_0_20px_rgba(255,107,0,0.05)] transition-all font-mono text-sm"
                    onKeyDown={(e) => e.key === "Enter" && importSlideshow()}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 transition-all font-cyber text-xs font-bold tracking-wider uppercase"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={importSlideshow}
                    disabled={isImporting || !importInput.trim()}
                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-cyber text-xs font-bold tracking-wider uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,107,0,0.4)] hover:shadow-[0_0_30px_rgba(255,107,0,0.6)]"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        IMPORTING...
                      </>
                    ) : (
                      <>
                        <Import className="w-4 h-4" />
                        IMPORT
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 底部装饰 */}
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-orange-500/50" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-orange-500/50" />
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

      {/* 右下角访问计数 - Neo-Cyber 风格 */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="relative group">
          {/* 悬浮时的霓虹光晕 */}
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/30 to-purple-500/30 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* 主容器 */}
          <div className="relative flex items-center gap-2 px-4 py-2 bg-[#0a0a12]/90 backdrop-blur-xl rounded-lg border border-cyan-500/20 shadow-[0_0_15px_rgba(0,245,255,0.1)] transition-all duration-300 group-hover:border-cyan-500/40 group-hover:shadow-[0_0_20px_rgba(0,245,255,0.2)]">
            {/* 状态指示灯 */}
            <div className="relative">
              <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
              <div className="absolute inset-0 w-2 h-2 bg-cyan-500 rounded-full animate-ping opacity-50" />
            </div>
            <span className="font-mono text-xs text-cyan-400/80">
              <PageViewCounter page="/" label="VISITS" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
