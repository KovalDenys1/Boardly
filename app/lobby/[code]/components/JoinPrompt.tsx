interface JoinPromptProps {
  lobby: any
  password: string
  setPassword: (password: string) => void
  error: string | null
  onJoin: () => void
}

export default function JoinPrompt({
  lobby,
  password,
  setPassword,
  error,
  onJoin,
}: JoinPromptProps) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 text-center animate-scale-in">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6 shadow-xl">
          <span className="text-4xl">🎮</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 drop-shadow-sm">
          Join the Game
        </h2>
        <p className="text-white/60 text-sm sm:text-base mb-6">
          Enter the password to join <span className="font-semibold text-white/90">{lobby.name}</span>
        </p>

        {/* Password Input */}
        {lobby.isPrivate && (
          <div className="text-left mb-6">
            <label className="block font-semibold text-white/80 text-sm mb-2">
              🔒 Lobby Password
            </label>
            <input
              type="password"
              className="w-full bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 px-4 py-3 focus:ring-2 focus:ring-white/40 focus:border-transparent transition-all focus-visible:outline-none"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onJoin()
                }
              }}
              autoFocus
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl px-4 py-3 mb-6 animate-shake">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="font-semibold text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Join Button */}
        <button
          onClick={onJoin}
          className="w-full px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-2xl hover:bg-blue-50 hover:scale-[1.02] transition-all duration-300"
        >
          <span className="mr-2 text-xl">🚀</span>
          Join Lobby
        </button>

        {/* Info */}
        <p className="text-white/40 text-xs mt-4">
          💡 You'll be added to the game once you join
        </p>
      </div>
    </div>
  )
}
