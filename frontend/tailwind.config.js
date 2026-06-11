/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Heebo', 'sans-serif'] },
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(30,64,175,0.08), 0 1px 3px 0 rgba(0,0,0,0.06)',
        fab:  '0 4px 20px 0 rgba(37,99,235,0.45)',
      },
      screens: {
        xs: '360px',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-top':    'env(safe-area-inset-top, 0px)',
      },
      minHeight: {
        screen: ['100vh', '100dvh'],
      },
    },
  },
  plugins: [],
};
