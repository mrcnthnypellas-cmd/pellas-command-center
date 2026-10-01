/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#608bfa",
          500: "#3c65f5",
          600: "#2647ea",
          700: "#2036d6",
          800: "#212eac",
          900: "#212a87",
          950: "#161a52",
        },
      },
    },
  },
  plugins: [],
};
