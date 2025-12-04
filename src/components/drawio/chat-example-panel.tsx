"use client";

import { Zap, Cloud, GitBranch, Palette } from "lucide-react";

interface ExampleCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}

function ExampleCard({ icon, title, description, onClick }: ExampleCardProps) {
    return (
        <button
            onClick={onClick}
            className="group w-full text-left p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
        >
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    {icon}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {description}
                    </p>
                </div>
            </div>
        </button>
    );
}

interface ExamplePanelProps {
    setInput: (input: string) => void;
    setFiles: (files: File[]) => void;
}

export default function ExamplePanel({
    setInput,
    setFiles,
}: ExamplePanelProps) {
    const handleReplicateFlowchart = async () => {
        setInput("复制这个流程图");

        try {
            const response = await fetch("/example.png");
            const blob = await response.blob();
            const file = new File([blob], "example.png", { type: "image/png" });
            setFiles([file]);
        } catch (error) {
            console.error("Error loading example image:", error);
        }
    };

    const handleReplicateArchitecture = async () => {
        setInput("用 AWS 风格复制这个架构图");

        try {
            const response = await fetch("/architecture.png");
            const blob = await response.blob();
            const file = new File([blob], "architecture.png", {
                type: "image/png",
            });
            setFiles([file]);
        } catch (error) {
            console.error("Error loading architecture image:", error);
        }
    };

    return (
        <div className="py-6 px-2 animate-fade-in">
            {/* Welcome section */}
            <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                    AI 智能图表生成
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    描述你想创建的图表，或上传图片进行复制
                </p>
            </div>

            {/* Examples grid */}
            <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    快速示例
                </p>

                <div className="grid gap-2">
                    <ExampleCard
                        icon={<Zap className="w-4 h-4 text-primary" />}
                        title="动态流程图"
                        description="绘制带动画连接线的 Transformer 架构图"
                        onClick={() => setInput("绘制一个带**动画连接线**的 Transformer 架构图")}
                    />

                    <ExampleCard
                        icon={<Cloud className="w-4 h-4 text-primary" />}
                        title="AWS 架构图"
                        description="创建带 AWS 图标的云架构图"
                        onClick={handleReplicateArchitecture}
                    />

                    <ExampleCard
                        icon={<GitBranch className="w-4 h-4 text-primary" />}
                        title="复制流程图"
                        description="上传并复制现有的流程图"
                        onClick={handleReplicateFlowchart}
                    />

                    <ExampleCard
                        icon={<Palette className="w-4 h-4 text-primary" />}
                        title="创意绘图"
                        description="画一些有趣的创意内容"
                        onClick={() => setInput("画一只可爱的猫咪")}
                    />
                </div>

                <p className="text-[11px] text-muted-foreground/60 text-center mt-4">
                    示例已缓存，可快速响应
                </p>
            </div>
        </div>
    );
}
