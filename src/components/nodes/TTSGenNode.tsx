"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Volume2, Mic2, Play, Settings2 } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeButton, NodeLabel, NodeSelect } from "@/components/ui/NodeUI";

// 发音人列表（与后端保持一致）
const SPEAKERS = [
  { key: 'zh_male_beijingxiaoye', name: '北京小爷', language: '中文', gender: '男' },
  { key: 'zh_male_shaonianxiaoxiao', name: '少年萧萧', language: '中文', gender: '男' },
  { key: 'zh_female_tianmeixiaoyuan', name: '甜美小源', language: '中文', gender: '女' },
  { key: 'zh_female_wanwanxiaohe', name: '湾湾小何', language: '中文', gender: '女' },
  { key: 'en_male_adam', name: 'Adam', language: '英文', gender: '男' },
  { key: 'en_female_sarah', name: 'Sarah', language: '英文', gender: '女' },
];

type TTSGenNodeData = {
  text: string;
  speaker: string;
  speed: number;
  volume: number;
  pitch: number;
};

const TTSGenNode = ({ data, id, selected }: NodeProps<any>) => {
  const { addTTSNode } = useCanvas();
  const { getNode } = useReactFlow();

  const [text, setText] = useState(data.text || "");
  const [speaker, setSpeaker] = useState(data.speaker || "zh_male_beijingxiaoye");
  const [speed, setSpeed] = useState(data.speed || 1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleTextChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(evt.target.value);
    data.text = evt.target.value;
  };

  const handleSpeakerChange = (evt: React.ChangeEvent<HTMLSelectElement>) => {
    setSpeaker(evt.target.value);
    data.speaker = evt.target.value;
  };

  const onGenerate = async () => {
    if (!text.trim()) {
      alert("请输入要转换的文本");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          speaker,
          speed,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "TTS 生成失败");
      }

      const result = await response.json();
      console.log(`[TTS] Generated audio: ${result.audioUrl}`);

      // 创建 TTS 音频节点
      const currentNode = getNode(id);
      if (currentNode && addTTSNode) {
        addTTSNode(
          result.audioUrl,
          text.trim(),
          { x: currentNode.position.x + 380, y: currentNode.position.y }
        );
      }
    } catch (error) {
      console.error("[TTS] Generation failed:", error);
      alert(error instanceof Error ? error.message : "TTS 生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  // 获取当前发音人信息
  const currentSpeaker = SPEAKERS.find(s => s.key === speaker) || SPEAKERS[0];

  return (
    <BaseNode
      title="语音合成"
      icon={Mic2}
      color="cyan"
      selected={selected}
      className="w-[340px]"
    >
      <div className="space-y-4">
        {/* 文本输入 */}
        <div className="space-y-1">
          <NodeLabel>文本内容</NodeLabel>
          <NodeTextarea
            rows={4}
            value={text}
            onChange={handleTextChange}
            placeholder="输入要转换为语音的文本..."
            className="focus:border-cyan-500 focus:ring-cyan-500/20"
          />
          <div className="flex justify-end">
            <span className="text-xs text-neutral-400">{text.length}/5000</span>
          </div>
        </div>

        {/* 发音人选择 */}
        <div className="space-y-1">
          <NodeLabel>发音人</NodeLabel>
          <NodeSelect
            value={speaker}
            onChange={handleSpeakerChange}
            className="focus:border-cyan-500 focus:ring-cyan-500/20"
          >
            {SPEAKERS.map(s => (
              <option key={s.key} value={s.key}>
                {s.name} ({s.language} · {s.gender})
              </option>
            ))}
          </NodeSelect>
        </div>

        {/* 高级设置 */}
        <div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <Settings2 className="w-3 h-3" />
            {showSettings ? "隐藏设置" : "高级设置"}
          </button>

          {showSettings && (
            <div className="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
              {/* 语速 */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <NodeLabel className="text-xs">语速</NodeLabel>
                  <span className="text-xs text-neutral-500">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSpeed(v);
                    data.speed = v;
                  }}
                  className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* 生成按钮 */}
        <NodeButton
          onClick={onGenerate}
          disabled={isGenerating || !text.trim()}
          variant="primary"
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              生成语音
            </>
          )}
        </NodeButton>
      </div>
    </BaseNode>
  );
};

export default memo(TTSGenNode);
