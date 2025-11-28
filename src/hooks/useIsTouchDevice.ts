"use client";

import { useState, useEffect } from "react";

/**
 * 检测当前设备是否为触摸设备（平板/手机）
 * 使用多种检测方式确保准确性
 */
export function useIsTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouchDevice = () => {
      // 方法1: 检查 ontouchstart 事件
      const hasTouchStart = "ontouchstart" in window;

      // 方法2: 检查 maxTouchPoints
      const hasMaxTouchPoints = navigator.maxTouchPoints > 0;

      // 方法3: 检查 CSS media query (coarse pointer = 触摸)
      const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

      // 任意一个条件满足即为触摸设备
      return hasTouchStart || hasMaxTouchPoints || hasCoarsePointer;
    };

    setIsTouchDevice(checkTouchDevice());

    // 监听设备变化（如连接/断开触摸屏）
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const handleChange = () => setIsTouchDevice(checkTouchDevice());

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isTouchDevice;
}

/**
 * 长按检测 hook
 * @param callback 长按触发的回调
 * @param options 配置选项
 */
export function useLongPress(
  callback: (e: React.TouchEvent | React.MouseEvent) => void,
  options: {
    threshold?: number;      // 长按时间阈值（毫秒）
    moveThreshold?: number;  // 移动多少像素取消长按
  } = {}
) {
  const { threshold = 500, moveThreshold = 10 } = options;

  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  const start = (e: React.TouchEvent | React.MouseEvent) => {
    // 获取起始位置
    const pos = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    setStartPos(pos);

    // 设置长按计时器
    const timer = setTimeout(() => {
      callback(e);
      setLongPressTimer(null);
    }, threshold);

    setLongPressTimer(timer);
  };

  const move = (e: React.TouchEvent | React.MouseEvent) => {
    if (!startPos || !longPressTimer) return;

    // 获取当前位置
    const pos = "touches" in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    // 计算移动距离
    const distance = Math.sqrt(
      Math.pow(pos.x - startPos.x, 2) + Math.pow(pos.y - startPos.y, 2)
    );

    // 移动超过阈值，取消长按
    if (distance > moveThreshold) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
      setStartPos(null);
    }
  };

  const end = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setStartPos(null);
  };

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: end,
  };
}
