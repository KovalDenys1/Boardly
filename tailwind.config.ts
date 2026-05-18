/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        // ── Boardly Design System ─────────────────────────────────────
        'bd-coral':      '#FF6B5B',
        'bd-coral-deep': '#E04B3B',
        'bd-mint':       '#4FC9A6',
        'bd-mint-deep':  '#2FA787',
        'bd-sun':        '#FFC44D',
        'bd-sun-deep':   '#E5A82E',
        'bd-lav':        '#9B8CFF',
        'bd-lav-mid':    '#8B7DFF',
        'bd-lav-deep':   '#7867E8',
        'bd-sky':        '#6BC1F0',
        'bd-ink':        'var(--bd-ink)',
        'bd-ink-soft':   'var(--bd-ink-soft)',
        'bd-ink-muted':  'var(--bd-ink-muted)',
        'bd-line':       'var(--bd-line)',
        'bd-bg':         'var(--bd-bg)',
        'bd-bg2':        'var(--bd-bg2)',
        'bd-card-warm':  'var(--bd-card-warm)',
        'bd-danger-border': '#F0B3AC',
        'bd-danger-bg':     '#FFF2EF',
        'bd-danger-text':   '#A6554A',
      },
      fontFamily: {
        display: ['var(--bd-font-display)', 'Georgia', 'serif'],
      },
      boxShadow: {
        // chunky illustrative shadows
        'bd-soft':  '0 4px 14px rgba(31,27,22,0.07)',
        'bd-card':  '0 6px 0 0 rgba(31,27,22,0.08), 0 14px 28px -10px rgba(31,27,22,0.18)',
        'bd-pop':   '0 8px 0 0 rgba(31,27,22,0.85)',
        'bd-ink-4': '0 4px 0 #1F1B16',
        'bd-ink-5': '0 5px 0 #1F1B16',
        'bd-coral-4': '0 4px 0 #E04B3B',
      },
      borderRadius: {
        'bd-sm': '10px',
        'bd-md': '16px',
        'bd-lg': '24px',
        'bd-xl': '36px',
      },
      keyframes: {
        'shake-roll': {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '10%': { transform: 'rotate(-5deg)' },
          '20%': { transform: 'rotate(5deg)' },
          '30%': { transform: 'rotate(-5deg)' },
          '40%': { transform: 'rotate(5deg)' },
          '50%': { transform: 'rotate(-5deg)' },
          '60%': { transform: 'rotate(5deg)' },
          '70%': { transform: 'rotate(-5deg)' },
          '80%': { transform: 'rotate(5deg)' },
          '90%': { transform: 'rotate(-5deg)' },
        },
      },
      animation: {
        'shake-roll': 'shake-roll 0.6s ease-in-out',
      },
    },
  },
  plugins: [],
}
