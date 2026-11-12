import type { Config } from "tailwindcss";

// Theme colours are RGB channel triplets in CSS variables (app/globals.css), so
// opacity modifiers such as `bg-surface/90` or `ring-gold/80` work.
const c = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: c("--surface"),
          secondary: c("--surface-secondary"),
          tertiary: c("--surface-tertiary"),
        },
        border: {
          DEFAULT: c("--border"),
          secondary: c("--border-secondary"),
        },
        accent: {
          DEFAULT: c("--accent"),
          hover: c("--accent-hover"),
          muted: "rgb(var(--accent) / 0.12)",
        },
        win: {
          DEFAULT: c("--win"),
          bg: "rgb(var(--win) / 0.09)",
        },
        loss: {
          DEFAULT: c("--loss"),
          bg: "rgb(var(--loss) / 0.08)",
        },
        fg: {
          DEFAULT: c("--fg"),
          secondary: c("--fg-secondary"),
          muted: c("--fg-muted"),
        },
        gold: c("--gold"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
