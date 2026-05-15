import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1440px" } },
    extend: {
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      colors: {
        border: "#E5E7EB",
        input: "#E5E7EB",
        ring: "#66B2B2",
        background: "#FFFFFF",
        foreground: "#333333",
        primary: {
          DEFAULT: "#66B2B2",
          hover: "#5AA0A0",
          soft: "#EAF5F5",
          foreground: "#FFFFFF",
        },
        ink: { DEFAULT: "#333333", muted: "#6B7280", soft: "#9CA3AF" },
        surface: { DEFAULT: "#FFFFFF", subtle: "#F7F9FB", border: "#E5E7EB" },
        success: { DEFAULT: "#16A34A", soft: "#DCFCE7" },
        warning: { DEFAULT: "#F59E0B", soft: "#FEF3C7" },
        danger: { DEFAULT: "#EF4444", soft: "#FEE2E2" },
        info: { DEFAULT: "#6366F1", soft: "#E0E7FF" },
        chip: {
          teal: "#EAF5F5",
          violet: "#EDE9FE",
          peach: "#FFE4D6",
          amber: "#FEF3C7",
          rose: "#FFE4E6",
          indigo: "#E0E7FF",
          mint: "#DCFCE7",
        },
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        pop: "0 10px 30px rgba(16,24,40,.10), 0 4px 12px rgba(16,24,40,.06)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in .2s ease-out",
        "slide-up": "slide-up .25s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
