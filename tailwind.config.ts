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
        // Boardly Design System
        'bd-coral':     '#FF6B5B',
        'bd-coral-deep':'#E04B3B',
        'bd-mint':      '#4FC9A6',
        'bd-mint-deep': '#2FA787',
        'bd-sun':       '#FFC44D',
        'bd-lav':       '#9B8CFF',
        'bd-sky':       '#6BC1F0',
        'bd-ink':       '#1F1B16',
        'bd-ink-soft':  '#4A3F33',
        'bd-ink-muted': '#8A7A66',
        'bd-line':      '#E8DDC8',
        'bd-bg':        '#FBF6EE',
        'bd-bg2':       '#F2E9D8',
        'bd-card-warm': '#FFF8EC',
      },
      fontFamily: {
        display: ["'Bricolage Grotesque'", 'Georgia', 'serif'],
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
