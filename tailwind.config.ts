import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608bfa',
          500: '#3b63f5',
          600: '#2544ea',
          700: '#1e33d6',
          800: '#1f2bad',
          900: '#1f2988',
          950: '#161a54',
        },
        navy: {
          50: '#eef1f8',
          100: '#d7ddec',
          200: '#a9b4d1',
          300: '#7684af',
          400: '#4a5788',
          500: '#2d3760',
          600: '#1f2749',
          700: '#161c39',
          800: '#10152d',
          900: '#0b0f21',
          950: '#070a17',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
