/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        celeste: {
          50:  '#EBF8FF',
          100: '#C8EDFC',
          300: '#A8D8EA',
          500: '#5BB8D4',
          700: '#2E86AB',
          900: '#1A5276',
        },
        menta: {
          50:  '#EAFAF1',
          100: '#A8E6CF',
          500: '#4CAF91',
          700: '#1E8449',
        },
        lavanda: {
          50:  '#F4F0FB',
          100: '#C9B8E8',
          500: '#9B7FD4',
          700: '#6C3483',
        },
        coral: {
          50:  '#FDEDEC',
          100: '#F4A7A3',
          500: '#E57373',
          700: '#C0392B',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.7' },
        },
      },
      animation: {
        fadeIn:     'fadeIn 0.2s ease-out',
        pulseSoft:  'pulseSoft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
