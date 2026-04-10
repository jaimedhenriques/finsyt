/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: { 950: '#0a0e1a', 900: '#0f1628', 800: '#131929', 700: '#1a2235' },
        border: '#1e2a42',
        blue: { 600: '#2563eb', 500: '#3b82f6', 400: '#60a5fa' },
        teal: { 600: '#0d9488', 500: '#14b8a6', 400: '#2dd4bf' },
        muted: '#8892aa',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2563eb, #0d9488)',
        'gradient-brand-soft': 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(13,148,136,0.15))',
      },
    },
  },
  plugins: [],
}
