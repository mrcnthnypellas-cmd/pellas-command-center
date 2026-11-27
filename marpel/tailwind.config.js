/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050a14',
          900: '#08101f',
          850: '#0b1528',
          800: '#0f1c34',
          750: '#132342',
          700: '#182b50',
          600: '#22396a',
          500: '#2f4c87',
        },
        gold: {
          50: '#fbf6ea',
          100: '#f5e9c8',
          200: '#ecd598',
          300: '#e3c27a',
          400: '#d8ae5a',
          500: '#c99a3e',
          600: '#a97d2c',
          700: '#836022',
        },
        ink: { DEFAULT: '#0b0f17' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['"Sora Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(216,174,90,.35), 0 10px 30px -10px rgba(216,174,90,.35)',
        card: '0 1px 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.6)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg,#f5e9c8 0%,#d8ae5a 35%,#a97d2c 65%,#ecd598 100%)',
        'grid-faint':
          'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(12px)' }, '100%': { opacity: 1, transform: 'none' } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        loaderIn: { '0%': { opacity: 0.2, transform: 'scale(.97)', filter: 'blur(2px)' }, '100%': { opacity: 1, transform: 'none', filter: 'none' } },
        loaderBar: { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
        wordIn: { '0%': { opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, '100%': { opacity: 1, transform: 'none', filter: 'none' } },
        drawLine: { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
        floatGlow: { '0%,100%': { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.55 }, '50%': { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0.9 } },
      },
      animation: {
        'fade-up': 'fadeUp .5s ease-out both',
        'fade-in': 'fadeIn .25s ease-out both',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
        'loader-in': 'loaderIn .55s ease-out both',
        'loader-bar': 'loaderBar .95s cubic-bezier(.4,0,.2,1) both',
        'word-in': 'wordIn .6s cubic-bezier(.2,.7,.2,1) both',
        'draw-line': 'drawLine 1.1s cubic-bezier(.4,0,.2,1) both',
        'float-glow': 'floatGlow 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
