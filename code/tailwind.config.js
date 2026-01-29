/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // IDE 테마 컬러 (VS Code Dark+ 영감)
        'ide-bg': '#1e1e1e',
        'ide-sidebar': '#252526',
        'ide-panel': '#1e1e1e',
        'ide-border': '#3c3c3c',
        'ide-active': '#094771',
        'ide-hover': '#2a2d2e',
        'ide-text': '#cccccc',
        'ide-text-muted': '#858585',
        'ide-accent': '#007acc',
        'ide-success': '#4ec9b0',
        'ide-warning': '#dcdcaa',
        'ide-error': '#f14c4c',
      },
      fontFamily: {
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
