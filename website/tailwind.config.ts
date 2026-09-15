import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './data/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f3f7',
          100: '#dbe2ec',
          200: '#b8c6da',
          300: '#8ba1bd',
          400: '#5c779c',
          500: '#3d5876',
          600: '#2c4260',
          700: '#1f3049',
          800: '#0f1b2e',
          900: '#0a1220',
          950: '#060b14',
        },
        gold: {
          50: '#fbf7ee',
          100: '#f5ecd3',
          200: '#e9d6a3',
          300: '#dbbc6d',
          400: '#cda647',
          500: '#b58a35',
          600: '#93692b',
          700: '#734e26',
          800: '#5f4023',
          900: '#523721',
        },
        ivory: '#faf9f6',
        charcoal: '#1c1f24',
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        '8xl': '90rem',
      },
      letterSpacing: {
        widest2: '0.25em',
      },
      boxShadow: {
        elegant: '0 20px 60px -20px rgba(10, 18, 32, 0.25)',
        card: '0 1px 2px rgba(10,18,32,0.06), 0 8px 24px -8px rgba(10,18,32,0.08)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
