import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative inline-flex h-7 w-14 items-center rounded-full border bg-secondary transition-colors hover:bg-accent/40"
      aria-label="Toggle theme"
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-card shadow border flex items-center justify-center transition-transform ${isDark ? "translate-x-7" : "translate-x-0"}`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-primary" />
        )}
      </span>
    </button>
  );
}
