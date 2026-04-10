/** ThemeProvider — wrapper to inject theme preferences globally. */
"use client";

import React, { useEffect } from "react";
import { useThemeStore } from "@/store/useThemeStore";
import { useAuthStore } from "@/store/useAuthStore";

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { loadGlobalTheme } = useThemeStore();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // 1. Initial manual apply so there's no layout jitter if default changed
    const root = document.documentElement;
    if (!root.style.getPropertyValue("--surface-primary")) {
      // Default to adding dark class if not present
      if (!root.classList.contains("dark") && !root.classList.contains("light")) {
         root.classList.add("dark");
      }
    }
    
    // 2. Load theme from backend if user is authenticated
    if (isAuthenticated) {
      loadGlobalTheme();
      // Ensure user object is loaded into standard memory across sub-routes
      useAuthStore.getState().loadUser();
    }
  }, [isAuthenticated, loadGlobalTheme]);

  return <>{children}</>;
}
