/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', DEFAULT: '#2563eb' },
        success: { 50: '#ecfdf5', 100: '#d1fae5', 400: '#34d399', 500: '#10b981', 600: '#059669' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
        danger: { 50: '#fff1f2', 100: '#ffe4e6', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' },
        ink: { 950: '#07080a', 900: '#0b0d10', 850: '#101318', 800: '#171b22', 700: '#232936' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: { xl: '0.5rem', '2xl': '0.75rem', '3xl': '1rem' },
      spacing: { 18: '4.5rem', 22: '5.5rem' }
    }
  }
};
