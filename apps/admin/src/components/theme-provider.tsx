'use client';

import { createContext, useContext, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// External store for theme to avoid setState in effects
interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  mounted: boolean;
}

let themeState: ThemeState = { theme: 'system', resolvedTheme: 'dark', mounted: false };
const themeListeners = new Set<() => void>();

function subscribeTheme(callback: () => void) {
  themeListeners.add(callback);
  return () => themeListeners.delete(callback);
}

function getThemeSnapshot(): ThemeState {
  return themeState;
}

function getServerSnapshot(): ThemeState {
  return { theme: 'system', resolvedTheme: 'dark', mounted: false };
}

function setThemeState(newState: ThemeState) {
  themeState = newState;
  themeListeners.forEach((listener) => listener());
}

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerSnapshot);
  const initializedRef = useRef(false);

  // Initialize theme on mount - only runs once
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const savedTheme = (localStorage.getItem('admin-theme') as Theme) || 'system';
    const resolved = getResolvedTheme(savedTheme);
    
    setThemeState({ theme: savedTheme, resolvedTheme: resolved, mounted: true });
    
    // Apply theme class immediately
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
  }, []);

  // Handle theme changes
  const setTheme = useCallback((newTheme: Theme) => {
    const resolved = getResolvedTheme(newTheme);
    setThemeState({ theme: newTheme, resolvedTheme: resolved, mounted: true });
    
    // Apply theme class
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);
    
    // Save to localStorage
    localStorage.setItem('admin-theme', newTheme);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (!state.mounted || state.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? 'dark' : 'light';
      setThemeState({ ...themeState, resolvedTheme: resolved });
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [state.theme, state.mounted]);

  if (!state.mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme: state.theme, resolvedTheme: state.resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
