"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type ThemeType = "light" | "neo-cyber" | "glass-dark";

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_STORAGE_KEY = "nanobanana-theme";
const THEME_ORDER: ThemeType[] = ["light", "neo-cyber", "glass-dark"];

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeType>("neo-cyber");
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeType;
    if (savedTheme && THEME_ORDER.includes(savedTheme)) {
      setThemeState(savedTheme);
    }
    setMounted(true);
  }, []);

  // Apply theme class to document
  useEffect(() => {
    if (!mounted) return;

    // Remove all theme classes
    document.documentElement.classList.remove("theme-light", "theme-neo-cyber", "theme-glass-dark");
    // Add current theme class
    document.documentElement.classList.add(`theme-${theme}`);

    // Save to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: ThemeType) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(current => {
      const currentIndex = THEME_ORDER.indexOf(current);
      const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
      return THEME_ORDER[nextIndex];
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

// Theme display names
export const THEME_NAMES: Record<ThemeType, string> = {
  "light": "Light",
  "neo-cyber": "Neo-Cyber",
  "glass-dark": "Glass Dark",
};

// Theme icons (for UI)
export const THEME_ICONS: Record<ThemeType, string> = {
  "light": "sun",
  "neo-cyber": "zap",
  "glass-dark": "moon",
};
