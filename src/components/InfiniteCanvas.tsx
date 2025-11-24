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
  BackgroundVariant
} from "@xyflow/react";
import ImageGenNode from "./nodes/ImageGenNode";
import { saveCanvas, getUserCanvases, getCanvasById } from "@/app/actions/canvas";
import { getOrCreateUser, getCurrentUser, logout } from "@/app/actions/user";
import { Plus, Save, FolderOpen, User as UserIcon, LogOut } from "lucide-react";

const nodeTypes = {
  imageGen: ImageGenNode,
};

const initialNodes: Node[] = [
  {
    id: "1",
    type: "imageGen",
    position: { x: 250, y: 250 },
    data: { prompt: "A futuristic city with flying cars" },
  },
];

export default function InfiniteCanvas() {
  // Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // User & Canvas State
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [savedCanvases, setSavedCanvases] = useState<any[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  const addNode = useCallback(() => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: "imageGen",
      position: {
        x: Math.random() * 500,
        y: Math.random() * 500,
      },
      data: { prompt: "" },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

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
    }
  };

  return (
    <div className="w-full h-screen relative bg-neutral-50 dark:bg-black">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm p-2 rounded-full shadow-lg border border-neutral-200 dark:border-neutral-800">
        <button 
          onClick={addNode}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Add Node"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button 
          onClick={handleSave}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Save Canvas"
        >
          <Save className="w-5 h-5" />
        </button>
        <div className="relative group">
          <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
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

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-neutral-50 dark:bg-black"
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

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
    </div>
  );
}

