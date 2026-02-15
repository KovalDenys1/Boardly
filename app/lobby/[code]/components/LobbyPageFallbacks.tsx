'use client'

import LoadingSpinner from '@/components/LoadingSpinner'

export function LobbyPageLoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

export function LobbyPageErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 px-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 mb-5">
          <span className="text-3xl">!</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-3">Game Error</h1>
        <p className="text-white/60 text-sm mb-6">
          Something went wrong with the game lobby. Please try again.
        </p>
        <button
          onClick={() => {
            window.location.href = '/games'
          }}
          className="px-6 py-3 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 transition-all duration-300 shadow-lg"
        >
          Back to Lobbies
        </button>
      </div>
    </div>
  )
}
