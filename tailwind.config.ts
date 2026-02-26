
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        obsidian: '#0A0A0F',
        void: '#06060A',
        surface: '#111118',
        card: '#16161F',
        border: '#1E1E2D',
        gold: '#C8973A',
        'gold-light': '#E8B85A',
        'gold-dim': '#7A5A1E',
        jade: '#1DB07A',
        'jade-light': '#2ECC8E',
        crimson: '#E84040',
        muted: '#4A4A6A',
        subtle: '#2A2A3E',
        text: {
          primary: '#F0EEF8',
          secondary: '#8888AA',
          dim: '#4A4A6A',
        }
      },
      boxShadow: {
        'gold': '0 0 30px rgba(200, 151, 58, 0.15)',
        'gold-sm': '0 0 12px rgba(200, 151, 58, 0.2)',
        'jade': '0 0 30px rgba(29, 176, 122, 0.15)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'glow': '0 0 60px rgba(200, 151, 58, 0.08)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        }
      }
    },
  },
  plugins: [],
}
export default config

