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
        <div
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-blue-600 shadow-xl"
          style={{
            width: `clamp(72px, 7.5vw, 100px)`,
            height: `clamp(72px, 7.5vw, 100px)`,
            marginBottom: `clamp(20px, 2vh, 32px)`,
          }}
        >
          <span style={{ fontSize: `clamp(32px, 3.5vw, 48px)` }}>🎮</span>
        </div>

        {/* Title */}
        <h2
          className="font-bold"
          style={{
            fontSize: `clamp(24px, 2.5vw, 36px)`,
            marginBottom: `clamp(6px, 0.6vh, 10px)`,
          }}
        >
          Join the Game
        </h2>
        <p
          className="text-gray-600 dark:text-gray-400"
          style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}
        >
          Enter the password to join <span className="font-semibold">{lobby.name}</span>
        </p>

        {/* Password Input */}
        {lobby.isPrivate && (
          <div
            className="text-left"
            style={{ marginBottom: `clamp(20px, 2vh, 32px)` }}
          >
            <label
              className="block font-semibold text-gray-700 dark:text-gray-300"
              style={{
                fontSize: `clamp(11px, 1vw, 14px)`,
                marginBottom: `clamp(6px, 0.6vh, 10px)`,
              }}
            >
              🔒 Lobby Password
            </label>
            <input
              type="password"
              className="w-full border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              style={{
                padding: `clamp(10px, 1vh, 16px) clamp(12px, 1.2vw, 20px)`,
                borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
              }}
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
          <div
            className="bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-600 text-red-700 dark:text-red-400 rounded-lg animate-shake"
            style={{
              borderWidth: `clamp(1.5px, 0.15vw, 2.5px)`,
              padding: `clamp(10px, 1vh, 16px) clamp(12px, 1.2vw, 20px)`,
              marginBottom: `clamp(20px, 2vh, 32px)`,
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: `clamp(6px, 0.6vw, 10px)` }}
            >
              <span style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}>⚠️</span>
              <p className="font-semibold">{error}</p>
            </div>
          </div>
        )}

        {/* Join Button */}
        <button
          onClick={onJoin}
          className="btn btn-primary w-full shadow-xl hover:shadow-2xl transition-shadow"
          style={{
            fontSize: `clamp(14px, 1.4vw, 20px)`,
            padding: `clamp(10px, 1vh, 16px) clamp(24px, 2.4vw, 40px)`,
          }}
        >
          <span
            style={{
              fontSize: `clamp(16px, 1.6vw, 24px)`,
              marginRight: `clamp(6px, 0.6vw, 10px)`,
            }}
          >
            🚺
          </span>
          Join Lobby
        </button>

        {/* Info */}
        <p
          className="text-gray-500 dark:text-gray-400"
          style={{
            fontSize: `clamp(10px, 0.9vw, 12px)`,
            marginTop: `clamp(12px, 1.2vh, 20px)`,
          }}
        >
          💡 You'll be added to the game once you join
        </p>
      </div>
    </div>
  )
}
