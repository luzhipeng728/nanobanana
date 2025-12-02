"use client";

import { memo, useState } from "react";
import { NodeProps, useReactFlow } from "@xyflow/react";
import { useCanvas } from "@/contexts/CanvasContext";
import { Loader2, Mic2, Play, Settings2 } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { NodeTextarea, NodeButton, NodeLabel, NodeSelect } from "@/components/ui/NodeUI";
import { createTTSTask } from "@/app/actions/tts-task";

// 发音人列表（按分类）
const SPEAKERS = [
  // 通用场景
  { key: 'zh_female_vivi', name: 'Vivi', category: '通用', gender: '女', lang: '中/英' },
  { key: 'zh_male_ruyayichen', name: '儒雅逸辰', category: '通用', gender: '男', lang: '中文' },
  { key: 'zh_female_xiaohe', name: '小何', category: '通用', gender: '女', lang: '中文' },
  { key: 'zh_male_yunzhou', name: '云舟', category: '通用', gender: '男', lang: '中文' },
  { key: 'zh_male_xiaotian', name: '小天', category: '通用', gender: '男', lang: '中文' },
  // 视频配音
  { key: 'zh_male_dayi', name: '大壹', category: '配音', gender: '男', lang: '中文' },
  { key: 'zh_female_mizai', name: '咪仔', category: '配音', gender: '女', lang: '中文' },
  { key: 'zh_female_jitangnv', name: '鸡汤女', category: '配音', gender: '女', lang: '中文' },
  { key: 'zh_female_meilinvyou', name: '魅力女友', category: '配音', gender: '女', lang: '中文' },
  { key: 'zh_female_liuchang', name: '流畅女声', category: '配音', gender: '女', lang: '中文' },
  // 角色扮演
  { key: 'zh_female_keai', name: '可爱女生', category: '角色', gender: '女', lang: '中文' },
  { key: 'zh_female_tiaopi', name: '调皮公主', category: '角色', gender: '女', lang: '中文' },
  { key: 'zh_male_shuanglang', name: '爽朗少年', category: '角色', gender: '男', lang: '中文' },
  { key: 'zh_male_tiancai', name: '天才同桌', category: '角色', gender: '男', lang: '中文' },
  { key: 'zh_female_cancan', name: '知性灿灿', category: '角色', gender: '女', lang: '中文' },
  // 儿童绘本
  { key: 'zh_female_xueayi', name: '学艾伊', category: '绘本', gender: '女', lang: '中文' },
];

type TTSGenNodeData = {
  text: string;
  speaker: string;
  speed: number;
};

const TTSGenNode = ({ data, id, selected }: NodeProps<any>) => {
  const { addTTSNode } = useCanvas();
  const { getNode } = useReactFlow();

  const [text, setText] = useState(data.text || "");
  const [speaker, setSpeaker] = useState(data.speaker || "zh_female_vivi");
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
      // 创建 TTS 任务
      const { taskId } = await createTTSTask({
        text: text.trim(),
        speaker,
        speed,
      });

      console.log(`[TTS] Created task: ${taskId}`);

      // 立即创建 TTS 音频节点（loading 状态）
      const currentNode = getNode(id);
      if (currentNode && addTTSNode) {
        addTTSNode(
          taskId,
          text.trim(),
          { x: currentNode.position.x + 380, y: currentNode.position.y }
        );
      }
    } catch (error) {
      console.error("[TTS] Task creation failed:", error);
      alert(error instanceof Error ? error.message : "TTS 任务创建失败");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <BaseNode
      title="语音合成"
      icon={Mic2}
      color="blue"
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
            className="focus:border-blue-500 focus:ring-blue-500/20"
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
            className="focus:border-blue-500 focus:ring-blue-500/20"
          >
            <optgroup label="通用场景">
              {SPEAKERS.filter(s => s.category === '通用').map(s => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.gender} · {s.lang})
                </option>
              ))}
            </optgroup>
            <optgroup label="视频配音">
              {SPEAKERS.filter(s => s.category === '配音').map(s => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.gender})
                </option>
              ))}
            </optgroup>
            <optgroup label="角色扮演">
              {SPEAKERS.filter(s => s.category === '角色').map(s => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.gender})
                </option>
              ))}
            </optgroup>
            <optgroup label="儿童绘本">
              {SPEAKERS.filter(s => s.category === '绘本').map(s => (
                <option key={s.key} value={s.key}>
                  {s.name} ({s.gender})
                </option>
              ))}
            </optgroup>
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
                  className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full appearance-none cursor-pointer accent-blue-500"
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
          className="w-full bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              创建任务...
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
