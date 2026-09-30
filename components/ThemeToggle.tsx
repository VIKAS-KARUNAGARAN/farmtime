"use client";
import { Moon, Sun } from "lucide-react";
import { useStore } from "@/lib/store";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useStore();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg ${className}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
