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
    <div className="card max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Join Game</h2>
      {lobby.password && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onJoin()
              }
            }}
          />
        </div>
      )}
      {error && (
        <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      <button onClick={onJoin} className="btn btn-primary w-full">
        Join Lobby
      </button>
    </div>
  )
}
