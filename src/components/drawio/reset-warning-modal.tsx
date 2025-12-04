"use client";

import { Button } from "@/components/drawio/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/drawio/ui/dialog";

interface ResetWarningModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClear: () => void;
}

export function ResetWarningModal({
    open,
    onOpenChange,
    onClear,
}: ResetWarningModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>清空所有内容？</DialogTitle>
                    <DialogDescription>
                        这将清空当前对话并重置图表。此操作无法撤销。
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        取消
                    </Button>
                    <Button variant="destructive" onClick={onClear}>
                        确认清空
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
