"use client";

import { ComponentProps, forwardRef } from "react";

/**
 * Textarea component for use inside ReactFlow nodes
 * The parent node should have the 'nowheel' class to prevent canvas zoom
 * This component simply stops event propagation
 */
export const NodeTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  ({ onWheel, ...props }, ref) => {
    const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
      // Stop propagation to prevent canvas zoom (nowheel class on parent also helps)
      e.stopPropagation();

      // Call original onWheel if provided
      onWheel?.(e);
    };

    return <textarea ref={ref} onWheel={handleWheel} {...props} />;
  }
);

NodeTextarea.displayName = "NodeTextarea";

/**
 * Input component for use inside ReactFlow nodes
 * The parent node should have the 'nowheel' class to prevent canvas zoom
 */
export const NodeInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ onWheel, ...props }, ref) => {
    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
      // Stop propagation to prevent canvas zoom
      e.stopPropagation();

      // Call original onWheel if provided
      onWheel?.(e);
    };

    return <input ref={ref} onWheel={handleWheel} {...props} />;
  }
);

NodeInput.displayName = "NodeInput";

/**
 * Div component for scrollable areas inside ReactFlow nodes
 * The parent node should have the 'nowheel' class to prevent canvas zoom
 * Allows natural scrolling within the container
 */
export const NodeScrollArea = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  ({ onWheel, ...props }, ref) => {
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      // Stop propagation to prevent canvas zoom
      e.stopPropagation();

      // Call original onWheel if provided
      onWheel?.(e);
    };

    return <div ref={ref} onWheel={handleWheel} {...props} />;
  }
);

NodeScrollArea.displayName = "NodeScrollArea";
