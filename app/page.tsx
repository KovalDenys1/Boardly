'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const isLoggedIn = status === 'authenticated'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16 animate-scale-in">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6 animate-bounce-in">
            <span className="text-6xl">🎲</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 drop-shadow-lg">
            Boardly
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-2xl mx-auto">
            Play classic board games with friends in real-time
          </p>
          {isLoggedIn && (
            <p className="text-lg text-white/80">
              Welcome back, <span className="font-bold">{session.user?.name || session.user?.email?.split('@')[0]}</span>! 👋
            </p>
          )}
        </div>

        {/* CTA Buttons */}
        <div className="max-w-md mx-auto space-y-4 mb-20 animate-slide-in-up">
          {isLoggedIn ? (
            <>
              <button
                onClick={() => router.push('/games')}
                className="w-full px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🎮</span>
                <span>Browse Games</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push('/auth/login')}
                className="w-full px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🔐</span>
                <span>Login</span>
              </button>
              <button
                onClick={() => router.push('/auth/register')}
                className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg shadow-2xl hover:scale-105 hover:shadow-3xl transition-all duration-300 flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🎯</span>
                <span>Sign Up Free</span>
              </button>
            </>
          )}
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in">
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-xl font-bold mb-2">Multiple Games</h3>
            <p className="text-white/80 text-sm">Yahtzee, Guess the Spy, and many more games coming soon!</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-bold mb-2">Live Chat</h3>
            <p className="text-white/80 text-sm">Chat with friends in real-time while playing your favorite games</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-bold mb-2">Real-Time Play</h3>
            <p className="text-white/80 text-sm">Instant updates with Socket.IO for seamless multiplayer experience</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white hover:bg-white/20 transition-all duration-300 hover:scale-105 animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <div className="text-4xl mb-4">🔐</div>
            <h3 className="text-xl font-bold mb-2">Private Lobbies</h3>
            <p className="text-white/80 text-sm">Create password-protected lobbies for you and your friends</p>
          </div>
        </div>

        {/* How it Works */}
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 md:p-12 text-white animate-slide-in-up">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500 text-white font-bold text-2xl mb-4 shadow-lg">
                1
              </div>
              <h3 className="text-xl font-bold mb-2">Create or Join</h3>
              <p className="text-white/80">Create a new lobby or join an existing one with a code</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500 text-white font-bold text-2xl mb-4 shadow-lg">
                2
              </div>
              <h3 className="text-xl font-bold mb-2">Invite Friends</h3>
              <p className="text-white/80">Share the lobby code with friends to start playing</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-500 text-white font-bold text-2xl mb-4 shadow-lg">
                3
              </div>
              <h3 className="text-xl font-bold mb-2">Play & Win</h3>
              <p className="text-white/80">Take turns, roll dice, and compete for the highest score!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-sm py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center text-white/60 text-sm">
          <p>© 2025 Boardly. Built with Next.js, Socket.IO, and Prisma.</p>
        </div>
      </footer>
    </div>
  )
}
