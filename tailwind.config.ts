import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3E7CB1",
        primaryLight: "#CDE7F0",
        secondary: "#E0A458",
        secondaryLight: "#FBE7C6",
        navy: "#1E3A5F",
        bg: "#F4F7FA",
        neutralDark: "#1F2937",
        neutralMid: "#6B7280",
        success: "#4CA771",
        danger: "#D9534F",
      },
      borderRadius: {
        card: "16px",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
