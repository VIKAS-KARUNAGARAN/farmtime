import type { Config } from "tailwindcss";

const c = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        fg: c("fg"),
        muted: c("muted"),
        faint: c("faint"),
        line: c("line"),
        staff: c("staff"),
        "staff-soft": c("staff-soft"),
        admin: c("admin"),
        "admin-soft": c("admin-soft"),
        wheat: c("wheat"),
        "wheat-soft": c("wheat-soft"),
        ok: c("ok"),
        warn: c("warn"),
        danger: c("danger"),
      },
      fontFamily: {
        display: ["'Cabinet Grotesk'", "system-ui", "sans-serif"],
        sans: ["Satoshi", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 2px hsl(var(--shadow) / 0.06), 0 1px 1px hsl(var(--shadow) / 0.04)",
        lift: "0 12px 32px -12px hsl(var(--shadow) / 0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
