"use client";

import React, { createContext, useContext, useRef, useCallback } from "react";

interface AudioContextType {
  registerAudio: (audioElement: HTMLAudioElement) => void;
  unregisterAudio: (audioElement: HTMLAudioElement) => void;
  pauseAllExcept: (currentAudio: HTMLAudioElement) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioElementsRef = useRef<Set<HTMLAudioElement>>(new Set());

  const registerAudio = useCallback((audioElement: HTMLAudioElement) => {
    audioElementsRef.current.add(audioElement);
  }, []);

  const unregisterAudio = useCallback((audioElement: HTMLAudioElement) => {
    audioElementsRef.current.delete(audioElement);
  }, []);

  const pauseAllExcept = useCallback((currentAudio: HTMLAudioElement) => {
    audioElementsRef.current.forEach((audio) => {
      if (audio !== currentAudio && !audio.paused) {
        audio.pause();
      }
    });
  }, []);

  return (
    <AudioContext.Provider value={{ registerAudio, unregisterAudio, pauseAllExcept }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
}
