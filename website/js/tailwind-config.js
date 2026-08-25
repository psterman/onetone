tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "PingFang SC", "Microsoft YaHei", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
      },
      colors: {
        mac: {
          bg: "#000000",
          panel: "rgba(30, 30, 32, 0.65)",
          border: "rgba(255, 255, 255, 0.12)",
          accent: "#2a9cc4",
          glow: "#5ec8e8",
          text: "#f5f5f7",
          textMuted: "#86868b",
        },
        "mac-accent": "#2a9cc4",
        "mac-glow": "#5ec8e8",
        brand: {
          50: "#e6f7fc",
          100: "#d4f0fa",
          200: "#a8dff0",
          300: "#7ec8e3",
          400: "#5ec8e8",
          500: "#45b0d4",
          600: "#2a9cc4",
          700: "#1f8fb8",
          800: "#1f8fb8",
          900: "#1a2d4a",
        },
        surface: {
          light: "#ffffff",
          dark: "#000000",
        },
      },
    },
  },
};
