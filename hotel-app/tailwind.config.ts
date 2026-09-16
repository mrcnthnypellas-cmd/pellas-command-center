import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf8f0",
          100: "#f8ecd8",
          200: "#efd5ab",
          300: "#e3b878",
          400: "#d69a4a",
          500: "#c17f2e",
          600: "#a06423",
          700: "#7d4d1f",
          800: "#5f3b1c",
          900: "#4a2f19",
        },
        ink: {
          50: "#f6f6f7",
          100: "#e2e3e6",
          200: "#c5c7cd",
          300: "#9a9da7",
          400: "#6f7280",
          500: "#4d505c",
          600: "#383a44",
          700: "#282a32",
          800: "#1b1c22",
          900: "#101116",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
      spacing: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};
export default config;
