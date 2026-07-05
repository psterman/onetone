tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "PingFang SC", "Microsoft YaHei", "system-ui", "sans-serif"],
      },
      colors: {
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
          dark: "#0f172a",
        },
      },
      animation: {
        blob: "blob 7s infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
      },
    },
  },
};
