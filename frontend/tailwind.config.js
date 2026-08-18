/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        industrial: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
          500: '#64748B',
          100: '#F1F5F9',
          50: '#F8FAFC'
        },
        pass: {
          DEFAULT: '#10B981',
          light: '#D1FAE5',
          dark: '#065F46'
        },
        check: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#92400E'
        },
        fail: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          dark: '#991B1B'
        }
      }
    },
  },
  plugins: [],
}
