/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
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
