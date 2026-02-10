import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4F46E5',
      },
      borderRadius: {
        lg: '12px',
      }
    },
  },
  plugins: [],
} satisfies Config
