/** @type {import('tailwindcss').Config} */
// P1: Tailwind 仅作用于 React islands，必须隔离旧 CSS。
// - preflight: false 避免重置 legacy 全局样式
// - important: '.ot-island' 让所有工具类仅在 .ot-island 容器内生效（含 portal 内容需手动加该类）
module.exports = {
  important: '.ot-island',
  corePlugins: {
    preflight: false,
  },
  darkMode: ['class', '.ot-island.dark'],
  content: ['./src-islands/**/*.{ts,tsx}', './src/index.html'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--ot-border) / <alpha-value>)',
        input: 'hsl(var(--ot-input) / <alpha-value>)',
        ring: 'hsl(var(--ot-ring) / <alpha-value>)',
        background: 'hsl(var(--ot-background) / <alpha-value>)',
        foreground: 'hsl(var(--ot-foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--ot-primary) / <alpha-value>)',
          foreground: 'hsl(var(--ot-primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--ot-secondary) / <alpha-value>)',
          foreground: 'hsl(var(--ot-secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--ot-destructive) / <alpha-value>)',
          foreground: 'hsl(var(--ot-destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--ot-muted) / <alpha-value>)',
          foreground: 'hsl(var(--ot-muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--ot-accent) / <alpha-value>)',
          foreground: 'hsl(var(--ot-accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--ot-popover) / <alpha-value>)',
          foreground: 'hsl(var(--ot-popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--ot-card) / <alpha-value>)',
          foreground: 'hsl(var(--ot-card-foreground) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--ot-radius)',
      },
    },
  },
  plugins: [],
};
