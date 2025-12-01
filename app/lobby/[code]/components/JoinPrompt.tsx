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
      <div className="card text-center animate-scale-in">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-blue-600 mb-6 shadow-xl">
          <span className="text-4xl">🎮</span>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold mb-2">Join the Game</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Enter the password to join <span className="font-semibold">{lobby.name}</span>
        </p>

        {/* Password Input */}
        {lobby.password && (
          <div className="mb-6 text-left">
            <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
              🔒 Lobby Password
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
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
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6 animate-shake">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <p className="font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Join Button */}
        <button 
          onClick={onJoin} 
          className="btn btn-primary w-full text-lg py-3 px-8 shadow-xl hover:shadow-2xl transition-shadow"
        >
          <span className="text-xl mr-2">🚪</span>
          Join Lobby
        </button>

        {/* Info */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          💡 You'll be added to the game once you join
        </p>
      </div>
    </div>
  )
}
